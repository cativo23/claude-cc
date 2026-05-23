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
 *
 * Session auto-discovery (issue #114 follow-up): when `--session-id` is
 * omitted, derive the Claude Code project slug from `cwd` (`/foo/bar` →
 * `-foo-bar`) and read the newest `.jsonl` in `<homeDir>/.claude/projects/
 * <slug>/`. If that dir is missing or empty, fall back to the globally
 * newest transcript across all project subdirs and emit a stderr notice so
 * users know a non-cwd session was picked. A bare uuid passed via
 * `--session-id` is treated the same way: prefer cwd-slug, fall back to
 * global search by filename.
 */
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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
 * Optional overrides for `runStatsCommand`. `cwd` and `homeDir` are injected
 * here (rather than read from `process`) so tests can build isolated fake
 * `~/.claude/projects/` trees in tmpdir without touching the real one.
 */
export interface StatsCommandOpts {
  cwd?: string;
  homeDir?: string;
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

function err(message: string, exitCode = 1): StatsCommandResult {
  return { stdout: '', stderr: message.endsWith('\n') ? message : `${message}\n`, exitCode };
}

function ok(stdout: string, stderr = ''): StatsCommandResult {
  return { stdout, stderr, exitCode: 0 };
}

/**
 * Convert a cwd into the Claude Code project slug. Claude Code names project
 * directories by replacing every `/` in the absolute cwd with `-`, including
 * the leading slash — `/home/me/proj` becomes `-home-me-proj`.
 */
function cwdToSlug(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

/**
 * Return the newest `.jsonl` file in `dir` by mtime, or `null` if the dir
 * doesn't exist, can't be read, or contains no `.jsonl` files. Symlinks and
 * non-regular files are tolerated — `fs.stat` follows symlinks, and a stat
 * failure on a single entry just drops it from the candidate set.
 */
async function newestJsonl(dir: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  let bestPath: string | null = null;
  let bestMtime = -Infinity;
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue;
    const full = join(dir, name);
    try {
      const st = await fs.stat(full);
      if (!st.isFile()) continue;
      if (st.mtimeMs > bestMtime) {
        bestMtime = st.mtimeMs;
        bestPath = full;
      }
    } catch {
      // Unstable entry (deleted between readdir and stat, permission denied,
      // broken symlink). Skip it — discovery should never crash on one bad file.
    }
  }
  return bestPath;
}

/**
 * Walk every project subdir under `projectsRoot` and return the globally
 * newest `.jsonl` by mtime. Used as the fallback when the cwd-slug dir
 * doesn't exist (e.g. user runs `lumira stats` from a directory that isn't
 * a known Claude Code project).
 */
async function globalNewestJsonl(projectsRoot: string): Promise<string | null> {
  let dirs: string[];
  try {
    dirs = await fs.readdir(projectsRoot);
  } catch {
    return null;
  }
  let bestPath: string | null = null;
  let bestMtime = -Infinity;
  for (const subdir of dirs) {
    const candidate = await newestJsonl(join(projectsRoot, subdir));
    if (!candidate) continue;
    try {
      const st = await fs.stat(candidate);
      if (st.mtimeMs > bestMtime) {
        bestMtime = st.mtimeMs;
        bestPath = candidate;
      }
    } catch {
      // Race: file vanished between `newestJsonl` and this stat. Skip.
    }
  }
  return bestPath;
}

/**
 * Locate a transcript when the user didn't pass an explicit path. Prefers
 * the cwd-slug project dir; falls back to the globally newest transcript.
 */
async function discoverTranscript(cwd: string, homeDir: string): Promise<string | null> {
  const projectsRoot = join(homeDir, '.claude', 'projects');
  const cwdSlugDir = join(projectsRoot, cwdToSlug(cwd));
  const local = await newestJsonl(cwdSlugDir);
  if (local) return local;
  return await globalNewestJsonl(projectsRoot);
}

/**
 * Resolve a bare session uuid to a JSONL path. Prefer the cwd-slug dir so
 * a uuid that exists in multiple projects (rare but possible if the user
 * imports an old session) maps to the locally-scoped one. Falls back to the
 * first match found by scanning every project subdir.
 */
async function resolveSessionId(uuid: string, cwd: string, homeDir: string): Promise<string | null> {
  const projectsRoot = join(homeDir, '.claude', 'projects');
  const filename = `${uuid}.jsonl`;

  // 1. Try cwd-slug dir.
  const localPath = join(projectsRoot, cwdToSlug(cwd), filename);
  try {
    const st = await fs.stat(localPath);
    if (st.isFile()) return localPath;
  } catch { /* miss — fall through to global scan */ }

  // 2. Walk all project subdirs.
  let dirs: string[];
  try {
    dirs = await fs.readdir(projectsRoot);
  } catch {
    return null;
  }
  for (const sub of dirs) {
    const cand = join(projectsRoot, sub, filename);
    try {
      const st = await fs.stat(cand);
      if (st.isFile()) return cand;
    } catch { /* not in this project — keep walking */ }
  }
  return null;
}

/** Cheap detector for "looks like a path, not a uuid". */
function looksLikePath(value: string): boolean {
  return value.includes('/') || value.endsWith('.jsonl');
}

/**
 * Execute `lumira stats [...]`. Resolution order for the transcript:
 *   1. `--session-id <path>` (contains `/` or ends in `.jsonl`) — used as-is.
 *   2. `--session-id <uuid>` — looked up under cwd-slug, then globally.
 *   3. No flag — auto-discover newest in cwd-slug dir, then globally.
 *
 * The parser's own allow-list check (LUMIRA_ALLOWED_ROOTS) remains the
 * security boundary — anything we hand it must pass `isUnderAllowedRoot`.
 * Discovered paths live under `~/.claude/projects/` (covered by the home
 * root) or under tmpdir in tests (also covered).
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
  opts: StatsCommandOpts = {},
): Promise<StatsCommandResult> {
  const args = parseStatsArgs(argv);
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? homedir();
  const projectsRoot = join(homeDir, '.claude', 'projects');

  let transcriptPath: string;
  let usedDiscovery = false;

  if (args.sessionId) {
    if (looksLikePath(args.sessionId)) {
      // Explicit path — hand straight to the parser.
      transcriptPath = args.sessionId;
    } else {
      // Bare uuid — resolve via cwd-slug then global scan.
      const resolved = await resolveSessionId(args.sessionId, cwd, homeDir);
      if (!resolved) {
        return err(
          `lumira stats: session id "${args.sessionId}" not found under ${projectsRoot}\n`,
        );
      }
      transcriptPath = resolved;
    }
  } else {
    const discovered = await discoverTranscript(cwd, homeDir);
    if (!discovered) {
      return err(
        `lumira stats: no transcripts found under ${projectsRoot}\n\n`
        + 'Pass --session-id <path-or-uuid> explicitly, or run `lumira stats` from a directory '
        + 'where Claude Code has recorded a session.\n',
      );
    }
    transcriptPath = discovered;
    usedDiscovery = true;
  }

  let stats: SessionStats;
  try {
    stats = await aggregateStats(transcriptPath);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`lumira stats: ${message}`);
  }

  // Fallback notice — emitted to stderr only when discovery picked a
  // transcript outside the cwd-slug project dir. Keeping it on stderr means
  // `lumira stats --json | jq` stays parseable even when the fallback fired.
  let stderr = '';
  if (usedDiscovery) {
    const cwdSlugDir = join(projectsRoot, cwdToSlug(cwd));
    if (!transcriptPath.startsWith(cwdSlugDir)) {
      stderr = `lumira stats: no transcripts for cwd; reading most recent session from ${transcriptPath}\n`;
    }
  }

  return ok(formatStatsOutput(stats, { noColor: args.noColor, json: args.json }), stderr);
}
