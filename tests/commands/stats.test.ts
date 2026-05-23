/**
 * Tests for `lumira stats` subcommand (issue #114). Covers:
 *   - parseStatsArgs: flag parsing (--session-id, --no-color, --json, NO_COLOR env)
 *   - formatStatsOutput: human-readable rendering with hasCostData branching
 *   - runStatsCommand: end-to-end {stdout, stderr, exitCode} contract
 *
 * Mirrors the shape of `tests/commands/themes.test.ts` so the dispatch and
 * exit-code semantics are consistent across subcommands.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stripAnsi } from '../../src/render/colors.js';
// @ts-expect-error — module does not exist yet (red phase for issue #114).
import { parseStatsArgs, formatStatsOutput, runStatsCommand } from '../../src/commands/stats.js';

const argv = (...rest: string[]) => ['node', 'lumira', 'stats', ...rest];

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const WITH_USAGE = join(FIXTURES, 'transcript-with-usage.jsonl');
const QWEN = join(FIXTURES, 'transcript-qwen-no-cost.jsonl');

/** Compact SessionStats factory for formatStatsOutput unit tests. */
function makeStats(overrides: Record<string, unknown> = {}) {
  return {
    sessionStart: Date.parse('2026-05-23T01:00:00.000Z'),
    sessionEnd: Date.parse('2026-05-23T03:15:00.000Z'),
    durationMs: 2 * 60 * 60 * 1000 + 15 * 60 * 1000, // 2h 15m
    inputTokens: 20_500,
    outputTokens: 1_350,
    cacheReadTokens: 110_000,
    cacheCreationTokens: 1_750,
    costUsd: 4.23,
    hasCostData: true,
    toolFrequency: { Bash: 45, Read: 32, Write: 18, Edit: 12, Agent: 8 },
    agentCount: 8,
    errorCount: 0,
    ...overrides,
  };
}

describe('parseStatsArgs', () => {
  // NO_COLOR is read at parse time, so we save/restore around tests that
  // touch it. Other tests must run with NO_COLOR unset.
  let savedNoColor: string | undefined;
  beforeEach(() => { savedNoColor = process.env['NO_COLOR']; delete process.env['NO_COLOR']; });
  afterEach(() => {
    if (savedNoColor === undefined) delete process.env['NO_COLOR'];
    else process.env['NO_COLOR'] = savedNoColor;
  });

  it('returns sensible defaults with no flags', () => {
    const args = parseStatsArgs(argv());
    expect(args.sessionId).toBeUndefined();
    expect(args.noColor).toBe(false);
    expect(args.json).toBe(false);
  });

  it('parses --session-id <id>', () => {
    expect(parseStatsArgs(argv('--session-id', 'abc123')).sessionId).toBe('abc123');
  });

  it('parses --no-color flag', () => {
    expect(parseStatsArgs(argv('--no-color')).noColor).toBe(true);
  });

  it('parses --json flag', () => {
    expect(parseStatsArgs(argv('--json')).json).toBe(true);
  });

  it('honors NO_COLOR env var (any non-empty value)', () => {
    // Per https://no-color.org, presence of NO_COLOR (any value) disables color.
    process.env['NO_COLOR'] = '1';
    expect(parseStatsArgs(argv()).noColor).toBe(true);
  });

  it('empty NO_COLOR env does NOT enable noColor', () => {
    // Spec edge case: an empty value should not trigger the override.
    process.env['NO_COLOR'] = '';
    expect(parseStatsArgs(argv()).noColor).toBe(false);
  });

  it('combines multiple flags', () => {
    const args = parseStatsArgs(argv('--session-id', 'xyz', '--json', '--no-color'));
    expect(args.sessionId).toBe('xyz');
    expect(args.json).toBe(true);
    expect(args.noColor).toBe(true);
  });
});

describe('formatStatsOutput', () => {
  it('renders the full header line, tools, and burn rate when hasCostData', () => {
    const out = stripAnsi(formatStatsOutput(makeStats(), { noColor: true, json: false }));
    // Session header — duration + cost + tokens + cache hit
    expect(out).toContain('Session:');
    expect(out).toContain('$');
    // Tokens segment (formatTokens rolls 20500→21k or similar — match loosely)
    expect(out).toMatch(/\btokens?\b/);
    expect(out).toContain('cache');
    // Tools breakdown
    expect(out).toContain('Tools:');
    expect(out).toContain('Bash');
    expect(out).toContain('Read');
    // Burn rate line (duration is > 1 min and cost > 0)
    expect(out).toContain('Burn:');
  });

  it('suppresses cost and burn when hasCostData is false (Qwen sessions)', () => {
    const out = stripAnsi(formatStatsOutput(
      makeStats({ hasCostData: false, costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }),
      { noColor: true, json: false },
    ));
    // Session and Tools always render — they don't depend on usage data.
    expect(out).toContain('Session:');
    expect(out).toContain('Tools:');
    // But the $cost and Burn segments must NOT appear — they would mislead.
    expect(out).not.toContain('$');
    expect(out).not.toContain('Burn:');
  });

  it('omits the burn line when session is shorter than 1 minute', () => {
    // formatBurnRate returns null when durationMs ≤ 60_000 (see src/utils/format.ts).
    const out = stripAnsi(formatStatsOutput(
      makeStats({ durationMs: 30_000 }),
      { noColor: true, json: false },
    ));
    expect(out).not.toContain('Burn:');
    // Session header still renders so the user sees something.
    expect(out).toContain('Session:');
  });

  it('shows a "no activity" message for a totally empty session', () => {
    const out = stripAnsi(formatStatsOutput(
      makeStats({
        sessionStart: null,
        sessionEnd: null,
        durationMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0,
        hasCostData: false,
        toolFrequency: {},
        agentCount: 0,
      }),
      { noColor: true, json: false },
    ));
    // The exact wording is the implementation's call — just verify the user
    // gets a clear "nothing to show" signal rather than a misleading "0s".
    expect(out.toLowerCase()).toMatch(/no activity|nothing recorded|empty session/);
  });

  it('emits parseable JSON when json:true and matches the SessionStats shape', () => {
    const stats = makeStats();
    const out = formatStatsOutput(stats, { noColor: true, json: true });
    const parsed = JSON.parse(out);

    expect(parsed.inputTokens).toBe(stats.inputTokens);
    expect(parsed.outputTokens).toBe(stats.outputTokens);
    expect(parsed.cacheReadTokens).toBe(stats.cacheReadTokens);
    expect(parsed.cacheCreationTokens).toBe(stats.cacheCreationTokens);
    expect(parsed.costUsd).toBeCloseTo(stats.costUsd, 5);
    expect(parsed.hasCostData).toBe(true);
    expect(parsed.toolFrequency).toEqual(stats.toolFrequency);
    expect(parsed.agentCount).toBe(stats.agentCount);
    expect(parsed.durationMs).toBe(stats.durationMs);
  });

  it('produces no ANSI escapes when noColor:true', () => {
    const out = formatStatsOutput(makeStats(), { noColor: true, json: false });
    // ESC byte must not appear anywhere in the output.
    expect(out).not.toMatch(/\x1b\[/);
  });
});

describe('runStatsCommand', () => {
  let workDir: string;
  beforeEach(() => { workDir = mkdtempSync(join(tmpdir(), 'lumira-stats-cmd-')); });
  afterEach(() => { rmSync(workDir, { recursive: true, force: true }); });

  it('returns the {stdout, stderr, exitCode} contract', async () => {
    const r = await runStatsCommand(argv('--session-id', WITH_USAGE, '--no-color'));
    expect(r).toHaveProperty('stdout');
    expect(r).toHaveProperty('stderr');
    expect(r).toHaveProperty('exitCode');
  });

  it('exits non-zero with a clear stderr when the session JSONL is missing', async () => {
    const r = await runStatsCommand(argv('--session-id', '/nonexistent/no-such-file.jsonl'));
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).not.toBe('');
    expect(r.stdout).toBe('');
  });

  it('produces non-empty stdout for a valid session passed via --session-id', async () => {
    const r = await runStatsCommand(argv('--session-id', WITH_USAGE, '--no-color'));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).not.toBe('');
    expect(r.stdout).toContain('Session:');
    expect(r.stdout).toContain('Tools:');
  });

  it('--json flag produces valid JSON on stdout', async () => {
    const r = await runStatsCommand(argv('--session-id', WITH_USAGE, '--json'));
    expect(r.exitCode).toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const parsed = JSON.parse(r.stdout);
    expect(parsed.inputTokens).toBe(20_500);
    expect(parsed.costUsd).toBeCloseTo(0.48, 5);
    expect(parsed.hasCostData).toBe(true);
    expect(parsed.toolFrequency).toEqual({ Bash: 3, Read: 2, Edit: 1, Agent: 1 });
  });

  it('handles Qwen sessions (no usage blocks) without error', async () => {
    const r = await runStatsCommand(argv('--session-id', QWEN, '--no-color'));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('Session:');
    expect(r.stdout).toContain('Tools:');
    // No cost segment for Qwen.
    expect(r.stdout).not.toContain('$');
    expect(r.stdout).not.toContain('Burn:');
  });

  it('rejects --session-id paths outside LUMIRA_ALLOWED_ROOTS with non-zero exit', async () => {
    // Same allow-list check the parser enforces. /etc/passwd is the
    // canonical out-of-bounds path used elsewhere in the test suite.
    const r = await runStatsCommand(argv('--session-id', '/etc/passwd'));
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).not.toBe('');
  });
});
