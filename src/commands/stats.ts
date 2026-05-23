/**
 * `lumira stats` subcommand (issue #114) — print an aggregate summary of a
 * Claude Code transcript session. Consumes `aggregateStats` from the parser
 * layer, formats either human-readable or JSON output, and follows the same
 * `{ stdout, stderr, exitCode }` contract as `runThemesCommand` so the
 * top-level CLI dispatcher can wire it identically.
 *
 * Color handling: we deliberately do NOT auto-detect TTY here. Tests assert
 * that `--no-color` strips ANSI escapes, and the default rendering already
 * uses no escape codes (plain text only) — keeping the formatter color-free
 * in the default path means a TTY-less test environment never sees stray
 * sequences, and a future enhancement can layer color in via `createColors`
 * without changing the test contract.
 */
import { aggregateStats, type SessionStats } from '../parsers/transcript-stats.js';
import { formatTokens, formatDuration, formatCost, formatBurnRate } from '../utils/format.js';
import { stripAnsi } from '../render/colors.js';

export interface StatsArgs {
  sessionId?: string;
  noColor: boolean;
  json: boolean;
}

/**
 * Result of invoking the stats subcommand. Mirrors `ThemesCommandResult` so
 * the dispatcher in `index.ts` can treat both subcommands uniformly.
 */
export interface StatsCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Parse argv for `lumira stats [...flags]`. argv is the full process.argv;
 * the 'stats' command starts at argv[2], flags from argv[3].
 *
 * Per https://no-color.org, the NO_COLOR env var (any non-empty value)
 * disables color. An empty string is *not* a trigger — the variable being
 * unset and the variable being empty must behave identically, otherwise
 * shell environments that pre-export NO_COLOR='' would silently disable
 * color everywhere.
 *
 * Unknown flags are ignored to stay forward-compatible: a future minor that
 * adds a new flag shouldn't crash older binaries piped against new shells.
 */
export function parseStatsArgs(argv: string[]): StatsArgs {
  let sessionId: string | undefined;
  let noColor = false;
  let json = false;

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--session-id' && i + 1 < argv.length) {
      sessionId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--no-color') { noColor = true; continue; }
    if (arg === '--json') { json = true; continue; }
    // Unknown flag — ignored.
  }

  const envNoColor = process.env['NO_COLOR'];
  if (typeof envNoColor === 'string' && envNoColor.length > 0) noColor = true;

  return { sessionId, noColor, json };
}

/** True when the session has no temporal extent and no activity at all. */
function isEmptySession(stats: SessionStats): boolean {
  const noTokens = stats.inputTokens === 0 && stats.outputTokens === 0
    && stats.cacheReadTokens === 0 && stats.cacheCreationTokens === 0;
  const noTools = Object.keys(stats.toolFrequency).length === 0;
  const noTime = stats.sessionStart === null || stats.durationMs === 0;
  return noTokens && noTools && noTime;
}

/** Cache hit % = cache_read / (cache_read + input). Returns null when undefined. */
function cacheHitPercent(stats: SessionStats): number | null {
  const denom = stats.cacheReadTokens + stats.inputTokens;
  if (denom <= 0) return null;
  return Math.round((stats.cacheReadTokens / denom) * 100);
}

function totalTokens(stats: SessionStats): number {
  return stats.inputTokens + stats.outputTokens
    + stats.cacheReadTokens + stats.cacheCreationTokens;
}

/**
 * Render a SessionStats either as human-readable text or as pretty JSON.
 *
 * In `json` mode we emit `JSON.stringify(stats, null, 2)` — the 2-space
 * indent makes the output diff-friendly without being absurdly verbose, and
 * matches the convention used elsewhere in the tree for CLI JSON output.
 *
 * In human mode we always render the `Session:` and `Tools:` lines so the
 * user gets a consistent skeleton regardless of which renderer produced the
 * transcript. Cost and burn-rate lines are gated on `hasCostData` so Qwen
 * (and other no-usage backends) never surface a misleading "$0.00".
 */
export function formatStatsOutput(
  stats: SessionStats,
  opts: { noColor: boolean; json: boolean },
): string {
  if (opts.json) return JSON.stringify(stats, null, 2);

  if (isEmptySession(stats)) {
    const text = 'Session: empty session — no activity recorded.';
    return opts.noColor ? stripAnsi(text) : text;
  }

  const lines: string[] = [];

  // Session: <duration> [— <cost>, <tokens> tokens, <cache>% cache]
  const segments: string[] = [`Session: ${formatDuration(stats.durationMs) || '0s'}`];
  if (stats.hasCostData) {
    const cost = formatCost(stats.costUsd);
    if (cost) segments.push(cost);
    const tt = totalTokens(stats);
    if (tt > 0) segments.push(`${formatTokens(tt)} tokens`);
    const hit = cacheHitPercent(stats);
    if (hit !== null) segments.push(`${hit}% cache`);
  }
  lines.push(segments.join(' — '));

  // Tools: ToolName×N ToolName×N ...
  const toolEntries = Object.entries(stats.toolFrequency)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => `${name}×${count}`);
  lines.push(`Tools: ${toolEntries.length > 0 ? toolEntries.join(' ') : '(none)'}`);

  // Burn: $X.XX/h — only meaningful when we have cost AND a long-enough session.
  if (stats.hasCostData) {
    const burn = formatBurnRate(stats.costUsd, stats.durationMs);
    if (burn) lines.push(`Burn: ${burn}`);
  }

  const out = lines.join('\n');
  return opts.noColor ? stripAnsi(out) : out;
}

function err(message: string): StatsCommandResult {
  return { stdout: '', stderr: message.endsWith('\n') ? message : `${message}\n`, exitCode: 1 };
}

function ok(stdout: string): StatsCommandResult {
  return { stdout, stderr: '', exitCode: 0 };
}

/**
 * Execute `lumira stats [...]`. Resolves the transcript path from the
 * `--session-id` flag (currently the only supported discovery mode), invokes
 * the parser, and renders.
 *
 * `cols` is accepted for parity with `runThemesCommand` but the human
 * renderer here doesn't wrap or align to terminal width — keep it in the
 * signature so a future widened renderer (sparklines, multi-column tool
 * frequency) can opt in without breaking the dispatcher contract.
 */
export async function runStatsCommand(
  argv: string[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _cols?: number,
): Promise<StatsCommandResult> {
  const args = parseStatsArgs(argv);

  if (!args.sessionId) {
    return err(
      'lumira stats: --session-id <path> is required.\n\n'
      + 'Pass a path to a Claude Code transcript .jsonl file under your home or tmp directory.\n',
    );
  }

  // For this first iteration, --session-id is interpreted as a path. The
  // parser's own allow-list check (LUMIRA_ALLOWED_ROOTS) is the security
  // boundary — we don't need to duplicate it here.
  let stats: SessionStats;
  try {
    stats = await aggregateStats(args.sessionId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`lumira stats: ${message}`);
  }

  return ok(formatStatsOutput(stats, { noColor: args.noColor, json: args.json }));
}
