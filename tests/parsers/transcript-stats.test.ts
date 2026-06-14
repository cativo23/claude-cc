/**
 * Tests for `aggregateStats(path)` — the stats CLI's transcript aggregator
 * (issue #114). Sister test to `transcript.test.ts` but focused on usage-block
 * accumulation and the SessionStats shape, not the tool/agent extraction the
 * existing parser already covers.
 *
 * ──────────────────────────────────────────────────────────────────────
 * EXPECTED TOTALS — transcript-with-usage.jsonl
 *
 *   sessionStart   = 2026-05-23T01:00:00.000Z  (epoch ms 1779663600000)
 *   sessionEnd     = 2026-05-23T01:01:41.000Z  (epoch ms 1779663701000)
 *   durationMs     = 101_000
 *
 *   Assistant turns with usage blocks (8 total):
 *     msg_1: in=2000  out=150  cr=5000   cc=1000  cost=0.05
 *     msg_2: in=1500  out=50   cr=8000   cc=500   cost=0.04
 *     msg_3: in=3000  out=200  cr=10000  cc=250   cost=0.07
 *     msg_4: in=2500  out=100  cr=12000  cc=0     cost=0.06
 *     msg_5: in=4000  out=300  cr=15000  cc=0     cost=0.09
 *     msg_6: in=3500  out=250  cr=18000  cc=0     cost=0.08
 *     msg_7: in=2200  out=180  cr=20000  cc=0     cost=0.05
 *     msg_8: in=1800  out=120  cr=22000  cc=0     cost=0.04
 *
 *   inputTokens          = 20_500
 *   outputTokens         = 1_350
 *   cacheReadTokens      = 110_000
 *   cacheCreationTokens  = 1_750
 *   costUsd              = 0.48
 *   hasCostData          = true
 *
 *   toolFrequency        = { Bash: 3, Read: 2, Edit: 1, Agent: 1 }
 *   agentCount           = 1
 *   errorCount           = 0  (no is_error: true entries in this fixture)
 *
 * EXPECTED TOTALS — transcript-qwen-no-cost.jsonl
 *
 *   sessionStart         = 2026-05-23T02:00:00.000Z
 *   sessionEnd           = 2026-05-23T02:01:11.000Z
 *   durationMs           = 71_000
 *   inputTokens          = 0
 *   outputTokens         = 0
 *   cacheReadTokens      = 0
 *   cacheCreationTokens  = 0
 *   costUsd              = 0
 *   hasCostData          = false  (no usage block exists on any assistant turn)
 *   toolFrequency        = { Bash: 2, Read: 1, Agent: 1 }
 *   agentCount           = 1
 *   errorCount           = 0
 * ──────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error — module does not exist yet (red phase for issue #114).
import { aggregateStats } from '../../src/parsers/transcript-stats.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

describe('aggregateStats — modern transcript with usage blocks', () => {
  it('returns exact totals matching the fixture', async () => {
    const stats = await aggregateStats(join(FIXTURES, 'transcript-with-usage.jsonl'));

    expect(stats.inputTokens).toBe(20_500);
    expect(stats.outputTokens).toBe(1_350);
    expect(stats.cacheReadTokens).toBe(110_000);
    expect(stats.cacheCreationTokens).toBe(1_750);
    expect(stats.costUsd).toBeCloseTo(0.48, 5);
    expect(stats.hasCostData).toBe(true);

    expect(stats.toolFrequency).toEqual({
      Bash: 3,
      Read: 2,
      Edit: 1,
      Agent: 1,
    });
    expect(stats.agentCount).toBe(1);
    expect(stats.errorCount).toBe(0);

    expect(stats.sessionStart).toBe(Date.parse('2026-05-23T01:00:00.000Z'));
    expect(stats.sessionEnd).toBe(Date.parse('2026-05-23T01:01:41.000Z'));
    expect(stats.durationMs).toBe(101_000);
  });
});

describe('aggregateStats — Qwen transcript without usage blocks', () => {
  it('reports hasCostData=false but still extracts tool/agent activity', async () => {
    const stats = await aggregateStats(join(FIXTURES, 'transcript-qwen-no-cost.jsonl'));

    // No usage payload anywhere — token totals MUST be zero and the
    // hasCostData flag MUST be false so renderers can suppress the
    // $cost / burn segments without surfacing misleading "0$" output.
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
    expect(stats.cacheReadTokens).toBe(0);
    expect(stats.cacheCreationTokens).toBe(0);
    expect(stats.costUsd).toBe(0);
    expect(stats.hasCostData).toBe(false);

    // Tool and agent extraction still works without usage — those live
    // in `tool_use` blocks, independent of `usage` accounting.
    expect(stats.toolFrequency).toEqual({
      Bash: 2,
      Read: 1,
      Agent: 1,
    });
    expect(stats.agentCount).toBe(1);

    expect(stats.sessionStart).toBe(Date.parse('2026-05-23T02:00:00.000Z'));
    expect(stats.sessionEnd).toBe(Date.parse('2026-05-23T02:01:11.000Z'));
    expect(stats.durationMs).toBe(71_000);
  });
});

describe('aggregateStats — edge cases', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'lumira-stats-test-'));
  });
  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('returns an all-zero SessionStats for an empty transcript', async () => {
    const p = join(workDir, 'empty.jsonl');
    writeFileSync(p, '');
    const stats = await aggregateStats(p);

    expect(stats.sessionStart).toBeNull();
    expect(stats.sessionEnd).toBeNull();
    expect(stats.durationMs).toBe(0);
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
    expect(stats.cacheReadTokens).toBe(0);
    expect(stats.cacheCreationTokens).toBe(0);
    expect(stats.costUsd).toBe(0);
    expect(stats.hasCostData).toBe(false);
    expect(stats.toolFrequency).toEqual({});
    expect(stats.agentCount).toBe(0);
    expect(stats.errorCount).toBe(0);
  });

  it('rejects with a clear error for a missing file', async () => {
    // A missing file is a user-facing error (they may have typed the wrong
    // path, or the session JSONL has been rotated). The aggregator must
    // surface this — silently returning zeros would hide the real problem.
    //
    // We place the missing path UNDER workDir (which lives in tmpdir, an
    // allowed root) so the allow-list check passes and we actually exercise
    // the file-not-found branch rather than the security guard.
    const missing = join(workDir, 'no-such-transcript.jsonl');
    await expect(aggregateStats(missing))
      .rejects.toThrow(/not found/i);
  });

  it('rejects paths outside LUMIRA_ALLOWED_ROOTS', async () => {
    // Same allow-list guard `parseTranscript` uses (see
    // src/utils/path.ts::isUnderAllowedRoot). The stats CLI must not be a
    // way to read /etc/passwd or any other system file via a crafted path.
    await expect(aggregateStats('/etc/passwd')).rejects.toThrow(/outside allowed roots/i);
  });

  it('respects MAX_LINES cap from the underlying parser', async () => {
    // Aggregation must stop at MAX_LINES (50_000) so a runaway JSONL
    // doesn't pin the CLI for minutes. We write MAX_LINES + 10 minimal
    // assistant-with-usage lines and assert the totals match the cap, not
    // the full count.
    //
    // Each over-cap line has input_tokens=1 so we can detect truncation
    // by checking the inputTokens total is exactly MAX_LINES (every line
    // under the cap is counted; lines beyond are skipped).
    const { MAX_LINES } = await import('../../src/parsers/transcript.js');
    const p = join(workDir, 'huge.jsonl');
    const minimalAssistant = (i: number) => JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-23T03:00:00.000Z',
      message: {
        id: `m${i}`,
        content: [{ type: 'text', text: 'x' }],
        usage: { input_tokens: 1, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });
    // Build the buffer once to keep test runtime reasonable.
    const buf: string[] = new Array(MAX_LINES + 10);
    for (let i = 0; i < buf.length; i++) buf[i] = minimalAssistant(i);
    writeFileSync(p, buf.join('\n') + '\n');

    const stats = await aggregateStats(p);
    // Cap applies — anything past MAX_LINES is dropped.
    expect(stats.inputTokens).toBeLessThanOrEqual(MAX_LINES);
    // And we DID parse a meaningful number of lines (not zero).
    expect(stats.inputTokens).toBeGreaterThan(MAX_LINES - 10);
  }, 60_000);

  it('reports hasCostData=true when usage blocks exist but cost sums to zero', async () => {
    // Nuance: hasCostData reflects whether the platform IS providing token
    // accounting (i.e. usage blocks are present), not whether the dollar
    // total happens to round to zero. A turn with zero-token usage (rare
    // but valid — e.g. cached-response burst) still proves Claude is
    // emitting accounting data; the CLI should keep displaying the
    // tokens/cache segments. Qwen, by contrast, never emits usage at all
    // and is what `hasCostData: false` is reserved for.
    const p = join(workDir, 'zero-cost-with-usage.jsonl');
    writeFileSync(p, [
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-05-23T03:00:00.000Z',
        message: {
          id: 'm1',
          content: [{ type: 'text', text: 'no work' }],
          usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: '2026-05-23T03:00:01.000Z',
        message: {
          id: 'm2',
          content: [{ type: 'text', text: 'still nothing' }],
          usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }),
    ].join('\n') + '\n');

    const stats = await aggregateStats(p);
    expect(stats.costUsd).toBe(0);
    expect(stats.inputTokens).toBe(0);
    expect(stats.hasCostData).toBe(true);
  });

  it('counts tokens only once when Claude Code emits multiple entries for the same message.id', async () => {
    // Real transcripts: Claude Code streams one JSONL entry *per content block*
    // for the same logical message (thinking → text → tool_use all share one
    // message.id). Every entry carries the full usage block for that message.
    // aggregateStats must dedup by message.id so tokens are counted once,
    // not once-per-content-block.
    //
    // This fixture mirrors the real pattern: one logical message (msg_dup)
    // split across three lines — thinking, text, tool_use — each with
    // identical usage counts. A second message (msg_unique) appears once.
    // Expected: inputTokens = 100 (msg_dup) + 50 (msg_unique) = 150, not
    //           100*3 + 50 = 350.
    const p = join(workDir, 'duplicate-message-id.jsonl');
    const makeEntry = (id: string, contentType: string, inputTokens: number) => JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-23T05:00:00.000Z',
      total_cost_usd: 0.01,
      message: {
        id,
        content: [{ type: contentType, text: 'x' }],
        usage: {
          input_tokens: inputTokens,
          output_tokens: 10,
          cache_read_input_tokens: 200,
          cache_creation_input_tokens: 0,
        },
      },
    });
    writeFileSync(p, [
      makeEntry('msg_dup', 'thinking', 100),  // first content block for msg_dup
      makeEntry('msg_dup', 'text', 100),       // second content block — same id, same usage
      makeEntry('msg_dup', 'tool_use', 100),   // third content block — same id, same usage
      makeEntry('msg_unique', 'text', 50),     // different message, counted once
    ].join('\n') + '\n');

    const stats = await aggregateStats(p);
    // msg_dup contributes 100 input tokens (not 300), msg_unique contributes 50.
    expect(stats.inputTokens).toBe(150);
    // output_tokens: 10 each × 2 unique messages = 20
    expect(stats.outputTokens).toBe(20);
    // cacheReadTokens: 200 each × 2 unique messages = 400
    expect(stats.cacheReadTokens).toBe(400);
    // costUsd: 0.01 per entry — but cost lives on the entry, not the message.
    // With dedup on message.id, cost is also counted once per unique message.
    expect(stats.costUsd).toBeCloseTo(0.02, 5);
    expect(stats.hasCostData).toBe(true);
  });

  it('prefers top-level total_cost_usd:0 over a non-zero message.total_cost_usd', async () => {
    // Regression: Anthropic emits `total_cost_usd: 0` for fully-cached turns.
    // The aggregator must treat that explicit 0 as authoritative and NOT
    // fall through to `message.total_cost_usd`. A truthy-OR (`top || msg`)
    // would silently double-count the message field, inflating costs on
    // every cached turn.
    const p = join(workDir, 'top-zero-message-nonzero.jsonl');
    writeFileSync(p, JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-23T04:00:00.000Z',
      total_cost_usd: 0,
      message: {
        id: 'm1',
        total_cost_usd: 0.05,
        content: [{ type: 'text', text: 'cached' }],
        usage: { input_tokens: 1, output_tokens: 0, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
      },
    }) + '\n');

    const stats = await aggregateStats(p);
    // Top-level 0 wins — message.total_cost_usd is fallback, not addend.
    expect(stats.costUsd).toBe(0);
  });
});
