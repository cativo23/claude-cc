import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderLine2, formatCountdown } from '../../src/render/line2.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { EMPTY_GIT, EMPTY_TRANSCRIPT, DEFAULT_CONFIG, DEFAULT_DISPLAY } from '../../src/types.js';
import type { ClaudeCodeInput, RenderContext } from '../../src/types.js';
import { NERD_ICONS, EMOJI_ICONS, NO_ICONS } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';
import { displayWidth } from '../../src/render/text.js';

const c = createColors('named');

const baseInput: ClaudeCodeInput = {
  model: 'Claude Opus 4',
  session_id: 'test-123',
  context_window: {
    used_percentage: 55,
    remaining_percentage: 45,
    total_input_tokens: 131000,
    total_output_tokens: 25000,
  },
  cost: { total_cost_usd: 1.31, total_duration_ms: 2106000 },
  workspace: { current_dir: '/home/user/project' },
};

function makeCtx(overrides: Partial<RenderContext> = {}, inputOverride?: Partial<ClaudeCodeInput>): RenderContext {
  return {
    input: normalize({ ...baseInput, ...inputOverride }), git: EMPTY_GIT, transcript: EMPTY_TRANSCRIPT,
    tokenSpeed: null, memory: null, gsd: null, mcp: null, cols: 120,
    config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } },
    icons: NERD_ICONS,
    ...overrides,
  };
}

describe('renderLine2', () => {
  afterEach(() => vi.useRealTimers());

  it('shows context bar with percentage', () => {
    const out = stripAnsi(renderLine2(makeCtx(), c));
    expect(out).toContain('55%');
  });

  it('context bar uses realUsedPercentage when available (not usedPercentage)', () => {
    // usedPercentage=42 but realUsedPercentage=48.5 (red test — passes after Task 3 updates renderer)
    // (input 70k + output 12k + cache_read 10k + cache_creation 5k) / 200k * 100 = 48.5
    const inputOverride = {
      context_window: {
        used_percentage: 42,
        remaining_percentage: 58,
        context_window_size: 200000,
        total_input_tokens: 84000,
        total_output_tokens: 12000,
        current_usage: {
          input_tokens: 70000,
          output_tokens: 12000,
          cache_read_input_tokens: 10000,
          cache_creation_input_tokens: 5000,
        },
      },
    };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    // Must show 49% (realUsedPercentage 48.5 rounds to 49) not 42% (input-only %)
    // buildContextBar uses Math.round, so 48.5 → 49%
    expect(out).toContain('49%');
    expect(out).not.toContain('42%');
  });

  it('shows tokens', () => {
    const out = stripAnsi(renderLine2(makeCtx(), c));
    expect(out).toContain('131k');
    expect(out).toContain('25k');
  });

  it('shows cost', () => {
    const out = stripAnsi(renderLine2(makeCtx(), c));
    expect(out).toContain('$1.31');
  });

  it('shows burn rate when duration > 60s', () => {
    const out = stripAnsi(renderLine2(makeCtx(), c));
    expect(out).toContain('/h');
  });

  it('does not show burn rate when duration <= 60s', () => {
    const inputOverride = { cost: { ...baseInput.cost, total_duration_ms: 30000 } };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride as any), c));
    expect(out).not.toContain('/h');
  });

  it('does not show rate limits below 50%', () => {
    const inputOverride = { rate_limits: { five_hour: { used_percentage: 30 } } };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).not.toContain('5h');
  });

  it('does not render rate-limit segment when usedPercentage is NaN', () => {
    const inputOverride = { rate_limits: { five_hour: { used_percentage: NaN } } };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).not.toContain('NaN');
    expect(out).not.toContain('(5h)');
  });

  it('shows rate limits at >=50%', () => {
    const inputOverride = { rate_limits: { five_hour: { used_percentage: 72 } } };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).toContain('72%');
    expect(out).toContain('5h');
  });

  it('renders nerd-mode rate-limit with battery glyph for usedPercentage', () => {
    // 78% sits in the 70-bucket → battery_70 (\u{F0080}); colored via getQuotaColor (orange tier 70-85).
    const inputOverride = { rate_limits: { five_hour: { used_percentage: 78 } } };
    const out = renderLine2(makeCtx({}, inputOverride), c);
    const stripped = stripAnsi(out);
    expect(stripped).toContain('\u{F0080}');
    expect(stripped).toContain('78%(5h)');
    // ANSI orange wraps the battery glyph (color is on the segment containing it).
    expect(out).toMatch(/\x1b\[38;5;208m[^\x1b]*\u{F0080}/u);
    // The legacy bolt should no longer prefix the rate-limit segment.
    expect(stripped).not.toContain(`${NERD_ICONS.bolt} 78%`);
  });

  it('renders nerd-mode 50% rate-limit with the 50-bucket battery glyph', () => {
    const inputOverride = { rate_limits: { five_hour: { used_percentage: 50 } } };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).toContain('\u{F007E}');
  });

  it('renders nerd-mode 70% rate-limit with the 70-bucket battery glyph and a countdown', () => {
    const pinnedNow = 1_700_000_000_000;
    vi.useFakeTimers({ now: pinnedNow });
    const inputOverride = {
      rate_limits: { five_hour: { used_percentage: 70, resets_at: Math.floor(pinnedNow / 1000) + 3600 } },
    };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).toContain('\u{F0080}');
    expect(out).toContain('1h00m'); // pinned time → exactly 3600s → 1h00m
  });

  it('renders nerd-mode 85% rate-limit with the battery_80 glyph (urgency carried by colour, not glyph)', () => {
    const inputOverride = { rate_limits: { five_hour: { used_percentage: 85 } } };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).toContain('\u{F0081}'); // battery_80 — alert reserved for 100%
    expect(out).not.toContain('\u{F0083}');
  });

  it('renders nerd-mode 100% rate-limit with the alert glyph — quota ceiling hit', () => {
    const inputOverride = { rate_limits: { five_hour: { used_percentage: 100 } } };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).toContain('\u{F0083}'); // battery_alert
  });

  it('renders emoji-mode rate-limit with 🔋 below 85% and 🪫 at/above 85%', () => {
    const below = stripAnsi(renderLine2(makeCtx(
      { icons: EMOJI_ICONS },
      { rate_limits: { five_hour: { used_percentage: 84 } } },
    ), c));
    expect(below).toContain('\u{1F50B}');
    expect(below).not.toContain('\u{1FAAB}');

    const at = stripAnsi(renderLine2(makeCtx(
      { icons: EMOJI_ICONS },
      { rate_limits: { five_hour: { used_percentage: 85 } } },
    ), c));
    expect(at).toContain('\u{1FAAB}');

    const full = stripAnsi(renderLine2(makeCtx(
      { icons: EMOJI_ICONS },
      { rate_limits: { five_hour: { used_percentage: 100 } } },
    ), c));
    expect(full).toContain('\u{1F480}'); // 💀 at ceiling

    const mid = stripAnsi(renderLine2(makeCtx(
      { icons: EMOJI_ICONS },
      { rate_limits: { five_hour: { used_percentage: 50 } } },
    ), c));
    expect(mid).toContain('\u{1F50B}');
  });

  it('renders none-mode rate-limit with the legacy bolt fallback (unchanged)', () => {
    const inputOverride = { rate_limits: { five_hour: { used_percentage: 78 } } };
    const out = stripAnsi(renderLine2(makeCtx({ icons: NO_ICONS }, inputOverride), c));
    expect(out).toContain('78%(5h)');
    // none mode currently has bolt='' — so neither nerd nor emoji glyphs leak in.
    expect(out).not.toContain('\u{F0080}');
    expect(out).not.toContain('\u{1F50B}');
    expect(out).not.toContain('\u{1FAAB}');
  });

  // Critical-tier rate-limit segments must survive fitSegments eviction. We
  // guarantee that by promoting them next to the context bar instead of at the
  // end of the line. The test asserts ordering: at >=85% the rate-limit token
  // appears BEFORE the cache/cost markers; at <85% it appears AFTER.
  it('promotes critical-tier rate-limit (>=85%) to slot right after context bar', () => {
    const out = stripAnsi(renderLine2(makeCtx(
      {},
      { rate_limits: { five_hour: { used_percentage: 88 } } },
    ), c));
    // Find positions of the battery segment vs the cost segment.
    const ratePos = out.indexOf('88%(5h)');
    const costPos = out.indexOf('$');
    expect(ratePos).toBeGreaterThan(-1);
    expect(costPos).toBeGreaterThan(-1);
    expect(ratePos).toBeLessThan(costPos); // critical rate beats cost
  });

  it('context tokens (94k/200k) appear before critical rate-limit segment', () => {
    // context bar + context tokens are grouped; rate limits come after, even when critical.
    const inputOverride = {
      context_window: { used_percentage: 47, remaining_percentage: 53, context_window_size: 200000, total_input_tokens: 94000, total_output_tokens: 0 },
      rate_limits: { five_hour: { used_percentage: 89 } },
    };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    const tokensPos = out.indexOf('94k/200k');
    const ratePos = out.indexOf('89%(5h)');
    expect(tokensPos).toBeGreaterThan(-1);
    expect(ratePos).toBeGreaterThan(-1);
    expect(tokensPos).toBeLessThan(ratePos); // context tokens before rate limit
  });

  it('keeps non-critical rate-limit (<85%) at the end of the line — original order', () => {
    const out = stripAnsi(renderLine2(makeCtx(
      {},
      { rate_limits: { five_hour: { used_percentage: 78 } } },
    ), c));
    const ratePos = out.indexOf('78%(5h)');
    const costPos = out.indexOf('$');
    expect(ratePos).toBeGreaterThan(costPos); // non-critical sits after cost
  });

  it('promotes only the critical window when criticality is mixed (5h non-critical, 7d critical)', () => {
    const out = stripAnsi(renderLine2(makeCtx(
      {},
      { rate_limits: {
        five_hour: { used_percentage: 60 },   // non-critical → end of line
        seven_day: { used_percentage: 92 },   // critical → promoted to slot 1
      } },
    ), c));
    const fhPos = out.indexOf('60%(5h)');
    const sdPos = out.indexOf('92%(7d)');
    const costPos = out.indexOf('$');
    expect(sdPos).toBeGreaterThan(-1);
    expect(fhPos).toBeGreaterThan(-1);
    expect(sdPos).toBeLessThan(costPos);  // 7d (critical) before cost
    expect(fhPos).toBeGreaterThan(costPos); // 5h (non-critical) after cost
  });

  it('sevenDay window renders battery glyph and (7d) label', () => {
    const out = stripAnsi(renderLine2(makeCtx(
      {},
      { rate_limits: { seven_day: { used_percentage: 78 } } },
    ), c));
    expect(out).toContain('(7d)');
    expect(out).toContain('\u{F0080}'); // battery_70 glyph for 78%
    expect(out).not.toContain('(5h)');
  });

  it('keeps relative 5h-then-7d order when both are critical', () => {
    const out = stripAnsi(renderLine2(makeCtx(
      {},
      { rate_limits: {
        five_hour: { used_percentage: 91 },
        seven_day: { used_percentage: 87 },
      } },
    ), c));
    const fhPos = out.indexOf('91%(5h)');
    const sdPos = out.indexOf('87%(7d)');
    expect(fhPos).toBeGreaterThan(-1);
    expect(sdPos).toBeGreaterThan(-1);
    expect(fhPos).toBeLessThan(sdPos);
  });

  it('shows vim mode', () => {
    const inputOverride = { vim: { mode: 'i' } };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).toContain('[i]');
  });

  it('hides effort when medium', () => {
    const out = stripAnsi(renderLine2(makeCtx({ transcript: { ...EMPTY_TRANSCRIPT, thinkingEffort: 'medium' } }), c));
    expect(out).not.toContain('^medium');
  });

  it('shows effort when high', () => {
    const out = stripAnsi(renderLine2(makeCtx({ transcript: { ...EMPTY_TRANSCRIPT, thinkingEffort: 'high' } }), c));
    expect(out).toContain('^high');
  });

  it('shows effort when low', () => {
    const out = stripAnsi(renderLine2(makeCtx({ transcript: { ...EMPTY_TRANSCRIPT, thinkingEffort: 'low' } }), c));
    expect(out).toContain('^low');
  });

  it('shows cache hit rate when current_usage provides per-turn token fields', () => {
    const inputOverride = {
      context_window: {
        ...baseInput.context_window,
        current_usage: { input_tokens: 31000, cache_read_input_tokens: 100000 },
      },
    };
    // 100000 / (31000 + 100000) = 76%
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    // New format: N%⚡ (no 'cache' prefix)
    expect(out).toContain('76%');
    expect(out).not.toContain('cache 76%');
  });

  it('reads cache hit rate from nested current_usage (modern 2.1.x payload)', () => {
    const inputOverride = {
      context_window: {
        ...baseInput.context_window,
        current_usage: {
          input_tokens: 50000,
          cache_read_input_tokens: 80000,
          cache_creation_input_tokens: 20000,
        },
      },
    };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    // 80000 / (50000 + 80000 + 20000) = 53% — new format: N%⚡ (no 'cache' prefix)
    expect(out).toContain('53%');
    expect(out).not.toContain('cache 53%');
  });

  it('hides cache metrics for legacy payloads without current_usage (no denominator after #79)', () => {
    // Legacy top-level cache_read without current_usage no longer provides a denominator
    // after dropping the total_input fallback in v0.9.1 (#79). Cache metrics must not render.
    const inputOverride = { context_window: { ...baseInput.context_window, cache_read_input_tokens: 5000000, total_input_tokens: 957000 } };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).not.toContain('cache');
  });

  it('hides cache metrics when cache_read is zero', () => {
    const inputOverride = { context_window: { ...baseInput.context_window, cache_read_input_tokens: 0, total_input_tokens: 957000 } };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).not.toContain('cache');
  });

  it('hides cache metrics when toggled off', () => {
    const inputOverride = { context_window: { ...baseInput.context_window, cache_read_input_tokens: 100000 } };
    const out = stripAnsi(renderLine2(makeCtx({ config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, cacheMetrics: false } } }, inputOverride), c));
    expect(out).not.toContain('cache');
  });

  it('shows MCP server count', () => {
    const mcp = { servers: [{ name: 'a', status: 'ok' as const }, { name: 'b', status: 'ok' as const }] };
    const out = stripAnsi(renderLine2(makeCtx({ mcp }), c));
    expect(out).toContain('MCP 2');
  });

  it('shows MCP errors in red', () => {
    const mcp = { servers: [{ name: 'a', status: 'ok' as const }, { name: 'b', status: 'error' as const }] };
    const out = stripAnsi(renderLine2(makeCtx({ mcp }), c));
    expect(out).toContain('MCP 1/2');
  });

  it('uses context_window_size as capacity instead of back-deriving (≥ 2.1.x)', () => {
    // total_input_tokens (957k) is cumulative; real context is 18% of 1M = 180k
    const inputOverride = {
      context_window: {
        ...baseInput.context_window,
        used_percentage: 18,
        total_input_tokens: 957000,
        context_window_size: 1000000,
      },
    };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).toContain('180k/1.0M');
    expect(out).not.toContain('957k/');
  });

  it('shows contextTokens estimate', () => {
    const inputOverride = { context_window: { ...baseInput.context_window, used_percentage: 50, total_input_tokens: 100000 } };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).toContain('100k/200k');
  });

  it('drops trailing segments via fitSegments when cols is narrow', () => {
    // At cols=60, many segments should still fit within the terminal width
    const inputOverride = {
      rate_limits: { five_hour: { used_percentage: 75 } },
      context_window: { ...baseInput.context_window, cache_read_input_tokens: 80000 },
    };
    const out = stripAnsi(renderLine2(makeCtx({ cols: 60 }, inputOverride), c));
    expect(displayWidth(out)).toBeLessThanOrEqual(64); // fitSegments enforces cols - 4
    // High-priority segment (context bar) survives; low-priority rate limit drops.
    expect(out).toMatch(/\d+%/); // context % is present
    expect(out).not.toContain('75%(5h)'); // rate-limit segment got dropped
  });

  // ── Cache hit rate widget ───────────────────────────────────────────────────

  // Alarm-mode semantics: cache hit rate widget only renders when something looks
  // wrong (<90%). Healthy steady-state cache (99-100%) is wallpaper — sibling
  // widgets (rate limits, agent count) follow the same hide-when-healthy pattern.

  it('hides cache hit rate when >=90% (healthy steady state)', () => {
    const inputOverride = {
      context_window: {
        ...baseInput.context_window,
        current_usage: { input_tokens: 1, cache_read_input_tokens: 99 },
      },
    };
    // 99 / 100 = 99% → hidden
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).not.toMatch(/\d+%⚡/);
  });

  it('hides cache hit rate at the 90% boundary', () => {
    const inputOverride = {
      context_window: {
        ...baseInput.context_window,
        current_usage: { input_tokens: 10000, cache_read_input_tokens: 90000 },
      },
    };
    // 90000 / 100000 = 90% — exactly at threshold, hidden
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).not.toMatch(/\d+%⚡/);
  });

  it('renders cache hit rate at 89% (one below threshold) as yellow', () => {
    const inputOverride = {
      context_window: {
        ...baseInput.context_window,
        current_usage: { input_tokens: 11000, cache_read_input_tokens: 89000 },
      },
    };
    // 89000 / 100000 = 89% → renders
    const out = renderLine2(makeCtx({}, inputOverride), c);
    expect(stripAnsi(out)).toContain('89%');
    expect(out).toMatch(/\x1b\[33m89%/); // yellow
  });

  it('cache hit rate is orange when 40-69%', () => {
    const inputOverride = {
      context_window: {
        ...baseInput.context_window,
        current_usage: { input_tokens: 60000, cache_read_input_tokens: 40000 },
      },
    };
    // 40000 / 100000 = 40% → orange
    const out = renderLine2(makeCtx({}, inputOverride), c);
    expect(out).toMatch(/\x1b\[38;5;208m40%/);
  });

  it('cache hit rate is blinkRed when <40% (critical — cache likely broken)', () => {
    const inputOverride = {
      context_window: {
        ...baseInput.context_window,
        current_usage: { input_tokens: 70000, cache_read_input_tokens: 20000 },
      },
    };
    // 20000 / 90000 ≈ 22% → blinkRed
    const out = renderLine2(makeCtx({}, inputOverride), c);
    expect(out).toMatch(/\x1b\[5;31m22%/);
  });

  it('hides cache hit rate when cacheMetrics display is off', () => {
    const inputOverride = {
      context_window: {
        ...baseInput.context_window,
        current_usage: { input_tokens: 60000, cache_read_input_tokens: 40000 },
      },
    };
    // 40% would normally render; toggle off must still suppress
    const ctx = makeCtx(
      { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, cacheMetrics: false } } },
      inputOverride,
    );
    const out = stripAnsi(renderLine2(ctx, c));
    expect(out).not.toMatch(/\d+%⚡/);
  });

  // ── Pace delta widget ───────────────────────────────────────────────────────

  it('shows pace delta ahead marker when burning quota faster than elapsed time', () => {
    // Pin "now" so computePaceDelta has a defined window.
    const pinnedNow = 1_700_000_000_000;
    vi.useFakeTimers({ now: pinnedNow });
    const nowSec = pinnedNow / 1000;
    // 2 hours elapsed of a 5h window → resetsAt = now + 3h
    const resetsAt = nowSec + 3 * 3600;
    // 60% used but only 40% elapsed → delta = +20 (ahead of pace)
    const inputOverride = {
      rate_limits: { five_hour: { used_percentage: 60, resets_at: resetsAt } },
    };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).toContain('+20%');
  });

  it('shows pace delta behind marker when burning quota slower than elapsed time', () => {
    const pinnedNow = 1_700_000_000_000;
    vi.useFakeTimers({ now: pinnedNow });
    const nowSec = pinnedNow / 1000;
    // 2 hours elapsed → resetsAt = now + 3h
    const resetsAt = nowSec + 3 * 3600;
    // 20% used but 40% elapsed → delta = -20 (behind pace)
    const inputOverride = {
      rate_limits: { five_hour: { used_percentage: 20, resets_at: resetsAt } },
    };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).toContain('-20%');
  });

  it('shows "on pace" when delta is within ±1%', () => {
    const pinnedNow = 1_700_000_000_000;
    vi.useFakeTimers({ now: pinnedNow });
    const nowSec = pinnedNow / 1000;
    const resetsAt = nowSec + 3 * 3600;
    // 40% used, 40% elapsed → delta = 0
    const inputOverride = {
      rate_limits: { five_hour: { used_percentage: 40, resets_at: resetsAt } },
    };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).toContain('on pace');
  });

  it('hides pace delta when display.paceDelta is off', () => {
    const pinnedNow = 1_700_000_000_000;
    vi.useFakeTimers({ now: pinnedNow });
    const nowSec = pinnedNow / 1000;
    const resetsAt = nowSec + 3 * 3600;
    const inputOverride = {
      rate_limits: { five_hour: { used_percentage: 60, resets_at: resetsAt } },
    };
    const ctx = makeCtx(
      { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, paceDelta: false } } },
      inputOverride,
    );
    const out = stripAnsi(renderLine2(ctx, c));
    expect(out).not.toContain('+20%');
    expect(out).not.toContain('on pace');
    // rate-limit segment itself should still render
    expect(out).toContain('60%(5h)');
  });

  it('shows pace delta even when display.rateLimits is off (independent toggles)', () => {
    const pinnedNow = 1_700_000_000_000;
    vi.useFakeTimers({ now: pinnedNow });
    const nowSec = pinnedNow / 1000;
    const resetsAt = nowSec + 3 * 3600;
    const inputOverride = {
      rate_limits: { five_hour: { used_percentage: 60, resets_at: resetsAt } },
    };
    const ctx = makeCtx(
      { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, rateLimits: false } } },
      inputOverride,
    );
    const out = stripAnsi(renderLine2(ctx, c));
    expect(out).toContain('+20%');
    expect(out).not.toContain('60%(5h)');
  });

  it('hides pace delta when insufficient data (< 5 min elapsed)', () => {
    const pinnedNow = 1_700_000_000_000;
    vi.useFakeTimers({ now: pinnedNow });
    const nowSec = pinnedNow / 1000;
    // Only 2 minutes elapsed → computePaceDelta returns null
    const resetsAt = nowSec + (5 * 3600 - 120);
    const inputOverride = {
      rate_limits: { five_hour: { used_percentage: 10, resets_at: resetsAt } },
    };
    const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
    expect(out).not.toContain('on pace');
    // No +/- delta markers appear (context bar %-suffix is still present, that's fine)
    expect(out).not.toMatch(/[+-]\d+%/);
  });

  // ── Quota projection (7d) ───────────────────────────────────────────────────

  describe('quota projection warning (7d)', () => {
    it('shows ⚠ ~24h projection when burn rate will exhaust 7d quota before reset', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      // 1d elapsed of 7d, 50% used → TTE = 24h. Remaining = 6d. willExhaustBefore=true. 24h >= 12h → ⚠
      const resetsAt = nowSec + (7 * 24 * 3600 - 86400);
      const inputOverride = {
        rate_limits: { seven_day: { used_percentage: 50, resets_at: resetsAt } },
      };
      const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
      expect(out).toContain('50%(7d)');
      expect(out).toContain('⚠ ~24h');
    });

    it('uses 🔥 critical icon when projection < 12h', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      // 6h elapsed of 7d, 60% used → TTE = 4h. Remaining ≈ 6.75d. willExhaustBefore=true. 4h < 12h → 🔥
      const resetsAt = nowSec + (7 * 24 * 3600 - 6 * 3600);
      const inputOverride = {
        rate_limits: { seven_day: { used_percentage: 60, resets_at: resetsAt } },
      };
      const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
      expect(out).toContain('🔥 ~4h');
    });

    it('coexists with countdown when >= 70% — both signals appear', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      // 1d elapsed of 7d, 75% used → TTE = 25/(75/86400) ≈ 28800s = 8h. Remaining 6d. willExhaustBefore=true. 8h < 12h → 🔥
      const resetsAt = nowSec + (7 * 24 * 3600 - 86400);
      const inputOverride = {
        rate_limits: { seven_day: { used_percentage: 75, resets_at: resetsAt } },
      };
      const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
      expect(out).toContain('75%(7d)');
      // Countdown still appears (>=70% gate)
      expect(out).toMatch(/\d+d\d+h|\d+h\d+m/);
      // Projection appears after countdown
      expect(out).toContain('🔥 ~8h');
      // Order: countdown comes BEFORE projection in the segment text
      const countdownPos = out.search(/\d+d\d+h|\d+h\d+m/);
      const projPos = out.indexOf('🔥');
      expect(countdownPos).toBeGreaterThan(-1);
      expect(projPos).toBeGreaterThan(countdownPos);
    });

    it('hides projection when display.quotaProjection toggle is off', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      const resetsAt = nowSec + (7 * 24 * 3600 - 86400);
      const inputOverride = {
        rate_limits: { seven_day: { used_percentage: 50, resets_at: resetsAt } },
      };
      const ctx = makeCtx(
        { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, quotaProjection: false } } },
        inputOverride,
      );
      const out = stripAnsi(renderLine2(ctx, c));
      expect(out).toContain('50%(7d)');
      expect(out).not.toContain('⚠ ~');
      expect(out).not.toContain('🔥 ~');
    });

    it('hides projection when 7d will NOT exhaust before reset', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      // 6d elapsed of 7d, 60% used → low burn → TTE ≈ 4d. Remaining 1d. 4d > 1d → false.
      const resetsAt = nowSec + (7 * 24 * 3600 - 518400);
      const inputOverride = {
        rate_limits: { seven_day: { used_percentage: 60, resets_at: resetsAt } },
      };
      const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
      expect(out).toContain('60%(7d)');
      expect(out).not.toContain('⚠ ~');
      expect(out).not.toContain('🔥 ~');
    });

    it('no projection when sevenDay has no resetsAt (no crash)', () => {
      const inputOverride = {
        rate_limits: { seven_day: { used_percentage: 70 } }, // no resets_at
      };
      const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
      expect(out).toContain('70%(7d)');
      expect(out).not.toContain('⚠ ~');
      expect(out).not.toContain('🔥 ~');
    });

    it('respects 1h minElapsed guard for 7d (no projection at 30min elapsed)', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      // 30min elapsed of 7d window — below the 3600 minElapsed for the 7d caller
      const resetsAt = nowSec + (7 * 24 * 3600 - 1800);
      const inputOverride = {
        rate_limits: { seven_day: { used_percentage: 60, resets_at: resetsAt } },
      };
      const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
      expect(out).toContain('60%(7d)');
      expect(out).not.toContain('⚠ ~');
      expect(out).not.toContain('🔥 ~');
    });

    it('does NOT add projection to 5h segment — pace delta carries that signal', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      const resetsAt = nowSec + (5 * 3600 - 3600);
      const inputOverride = {
        rate_limits: { five_hour: { used_percentage: 60, resets_at: resetsAt } },
      };
      const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
      expect(out).toContain('60%(5h)');
      // 5h segment must not carry projection icons (pace delta already communicates TTE)
      const fhPos = out.indexOf('60%(5h)');
      const segmentTail = out.slice(fhPos, fhPos + 40);
      expect(segmentTail).not.toContain('⚠ ~');
      expect(segmentTail).not.toContain('🔥 ~');
    });

    // ── Standalone projection (badge-decoupled) ────────────────────────────
    //
    // When usedPercentage < 50 the 7d badge is suppressed as noise, but the
    // projection may still predict exhaustion before reset. Without surfacing
    // the warning standalone the most actionable signal (early-window
    // unsustainable burn) is silenced. These tests lock the decoupled
    // behaviour.

    it.each([
      // 1d elapsed of 7d, 20% used → TTE = 4d, willExhaust=true, ⚠ tier (≥12h)
      { label: '⚠ warning tier renders yellow standalone when below 50%', usedPct: 20, elapsedSec: 86400, expectedWarning: '⚠ ~4d' },
      // 3h elapsed of 7d, 40% used → TTE = 4.5h, 🔥 tier (sub-12h), badge hidden
      { label: '🔥 critical tier renders red standalone when below 50%', usedPct: 40, elapsedSec: 10800, expectedWarning: '🔥 ~4h' },
    ])('$label', ({ usedPct, elapsedSec, expectedWarning }) => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      const resetsAt = nowSec + (7 * 24 * 3600 - elapsedSec);
      const inputOverride = {
        rate_limits: { seven_day: { used_percentage: usedPct, resets_at: resetsAt } },
      };
      const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
      // Badge is hidden (below 50% gate)
      expect(out).not.toContain(`${usedPct}%(7d)`);
      // Warning still renders standalone
      expect(out).toContain(expectedWarning);
    });

    it('attaches projection to badge when usedPercentage >= 50 (no duplicate standalone)', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      // 1d elapsed of 7d, 50% used → ⚠ ~24h, badge visible
      const resetsAt = nowSec + (7 * 24 * 3600 - 86400);
      const inputOverride = {
        rate_limits: { seven_day: { used_percentage: 50, resets_at: resetsAt } },
      };
      const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
      // Badge AND warning both present in the same segment
      expect(out).toContain('50%(7d)');
      expect(out).toContain('⚠ ~24h');
      // Exactly one occurrence of the warning glyph (not duplicated standalone)
      const matches = out.match(/⚠ ~/g) ?? [];
      expect(matches.length).toBe(1);
    });

    it('does not render standalone when projection does not predict exhaustion (below 50%)', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      // 6d elapsed of 7d, 10% used → low burn, TTE > remaining → no warning
      const resetsAt = nowSec + (7 * 24 * 3600 - 518400);
      const inputOverride = {
        rate_limits: { seven_day: { used_percentage: 10, resets_at: resetsAt } },
      };
      const out = stripAnsi(renderLine2(makeCtx({}, inputOverride), c));
      expect(out).not.toContain('10%(7d)');
      expect(out).not.toContain('⚠ ~');
      expect(out).not.toContain('🔥 ~');
    });

    // The projection signal is independent of `display.rateLimits` — mirrors
    // the pace-delta pattern (line2.ts:165 has the same independence). A user
    // who hides the rate-limit badges still benefits from the exhaustion
    // warning when burn rate predicts they will not make it to reset.
    it('renders standalone projection even when display.rateLimits is off (independent toggles)', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      // 1d elapsed of 7d, 60% used → would normally attach to badge, but
      // rateLimits is off so the badge is suppressed. Warning must surface
      // standalone instead.
      const resetsAt = nowSec + (7 * 24 * 3600 - 86400);
      const inputOverride = {
        rate_limits: { seven_day: { used_percentage: 60, resets_at: resetsAt } },
      };
      const ctx = makeCtx(
        { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, rateLimits: false } } },
        inputOverride,
      );
      const out = stripAnsi(renderLine2(ctx, c));
      // Badge suppressed by rateLimits=false
      expect(out).not.toContain('60%(7d)');
      // Projection still surfaces standalone — toggles are independent
      expect(out).toContain('⚠ ~');
    });

    // I2 regression guard: the projection appended to a visible badge must
    // carry the same severity color it carries when standalone. Otherwise
    // crossing 49%→50% silently demotes the visual urgency of the warning.
    it('colors the attached projection with severity color (red for 🔥, yellow for ⚠)', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      // 1d elapsed of 7d, 50% used → TTE = 24h → ⚠ ~24h, badge visible
      const resetsAt = nowSec + (7 * 24 * 3600 - 86400);
      const inputOverride = {
        rate_limits: { seven_day: { used_percentage: 50, resets_at: resetsAt } },
      };
      const out = renderLine2(makeCtx({}, inputOverride), c);
      // Match an ANSI open sequence (not a reset) directly preceding the
      // warning glyph. `(?!0)` rejects the `\x1b[0m` reset that closes the
      // badge — the warning must be wrapped in its OWN color open, not
      // inherit blanket from the badge wrap.
      expect(out).toMatch(/\x1b\[(?!0m)[\d;]+m⚠ ~24h/u);
    });
  });

  // ── Custom commands (issue #143 phase 3) ─────────────────────────
  describe('custom commands', () => {
    it('renders a single ok command on line 2', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'BUILD', state: 'ok', line: 2, ansi: false }],
      });
      const out = stripAnsi(renderLine2(ctx, c));
      expect(out).toContain('BUILD');
    });

    it('does not render commands targeting a different line', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'ELSEWHERE', state: 'ok', line: 1, ansi: false }],
      });
      const out = stripAnsi(renderLine2(ctx, c));
      expect(out).not.toContain('ELSEWHERE');
    });

    it('drops hidden state outputs', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'NOPE', state: 'hidden', line: 2, ansi: false }],
      });
      const out = stripAnsi(renderLine2(ctx, c));
      expect(out).not.toContain('NOPE');
    });

    it('renders multiple commands in declared order', () => {
      const ctx = makeCtx({
        customCommands: [
          { id: 'a', text: 'ALPHA', state: 'ok', line: 2, ansi: false },
          { id: 'b', text: 'BETA', state: 'ok', line: 2, ansi: false },
        ],
      });
      const out = stripAnsi(renderLine2(ctx, c));
      expect(out.indexOf('ALPHA')).toBeLessThan(out.indexOf('BETA'));
    });

    it('dims stale outputs', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'a', text: 'fading', state: 'stale', line: 2, ansi: false }],
      });
      const out = renderLine2(ctx, c);
      expect(out).toContain('\x1b[2m');
    });

    it('strips embedded ANSI by default and passes through when ansi:true', () => {
      const stripped = renderLine2(makeCtx({
        customCommands: [{ id: 'a', text: '\x1b[31mraw\x1b[0m', state: 'ok', line: 2, ansi: false }],
      }), c);
      expect(stripped).not.toMatch(/\x1b\[31mraw/);

      const through = renderLine2(makeCtx({
        customCommands: [{ id: 'a', text: '\x1b[31mraw\x1b[0m', state: 'ok', line: 2, ansi: true }],
      }), c);
      expect(through).toContain('\x1b[31m');
    });

    it('renders timeout/error placeholder text verbatim', () => {
      const ctx = makeCtx({
        customCommands: [
          { id: 'a', text: '…', state: 'timeout', line: 2, ansi: false },
          { id: 'b', text: '?', state: 'error', line: 2, ansi: false },
        ],
      });
      const out = stripAnsi(renderLine2(ctx, c));
      expect(out).toContain('…');
      expect(out).toContain('?');
    });
  });
});

describe('apiLatency widget', () => {
  function makeCtxWithApiLatency(apiDurationMs: number | undefined, durationMs = 60000, toggleOn = true): RenderContext {
    const input = normalize({
      ...baseInput,
      cost: { ...baseInput.cost, total_duration_ms: durationMs, total_api_duration_ms: apiDurationMs as number },
    });
    const patchedInput = apiDurationMs === undefined
      ? { ...normalize({ ...baseInput, cost: { ...baseInput.cost, total_duration_ms: durationMs } }), apiDurationMs: undefined }
      : { ...input, apiDurationMs };
    return {
      input: patchedInput,
      git: EMPTY_GIT,
      transcript: EMPTY_TRANSCRIPT,
      tokenSpeed: null,
      memory: null,
      gsd: null,
      mcp: null,
      cols: 120,
      config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, apiLatency: toggleOn } },
      icons: NERD_ICONS,
    };
  }

  it('should_render_API_N_percent_when_toggle_on_and_field_present', () => {
    // 15000ms / 60000ms = 25%
    const ctx = makeCtxWithApiLatency(15000, 60000);
    const out = stripAnsi(renderLine2(ctx, c));
    expect(out).toContain('API 25%');
  });

  it('should_hide_when_display_apiLatency_is_false', () => {
    const ctx = makeCtxWithApiLatency(15000, 60000, false);
    const out = stripAnsi(renderLine2(ctx, c));
    expect(out).not.toContain('API ');
  });

  it('should_hide_when_apiDurationMs_is_undefined', () => {
    const ctx = makeCtxWithApiLatency(undefined, 60000);
    const out = stripAnsi(renderLine2(ctx, c));
    expect(out).not.toContain('API ');
  });

  it.each([
    // healthy: <40% → dim (\x1b[2m)
    { pct: 25, durationMs: 60000, apiMs: 15000, colorEsc: '\x1b[2m', label: 'healthy (25%) uses dim' },
    // notable: 40-69% → no color (null)
    { pct: 55, durationMs: 60000, apiMs: 33000, colorEsc: null, label: 'notable (55%) uses no color' },
    // warn: 70-89% → yellow (\x1b[33m)
    { pct: 80, durationMs: 60000, apiMs: 48000, colorEsc: '\x1b[33m', label: 'warn (80%) uses yellow' },
    // critical: >=90% → orange (\x1b[38;5;208m)
    { pct: 90, durationMs: 60000, apiMs: 54000, colorEsc: '\x1b[38;5;208m', label: 'critical (90%) uses orange' },
  ])('should_apply_severity_color_at_each_tier_boundary: $label', ({ durationMs, apiMs, colorEsc }) => {
    const ctx = makeCtxWithApiLatency(apiMs, durationMs);
    const out = renderLine2(ctx, c);
    if (colorEsc === null) {
      // notable: no ANSI color should wrap the API text
      const stripped = stripAnsi(out);
      expect(stripped).toContain('API ');
      // The text must not be wrapped in any of the alarm colors
      expect(out).not.toMatch(/\x1b\[2mAPI /);
      expect(out).not.toMatch(/\x1b\[33mAPI /);
      expect(out).not.toMatch(/\x1b\[38;5;208mAPI /);
    } else {
      expect(out).toContain(colorEsc + 'API ');
    }
  });
});

describe('formatCountdown', () => {
  afterEach(() => vi.useRealTimers());

  it('returns empty string for past timestamps', () => {
    expect(formatCountdown(Date.now() - 10_000)).toBe('');
  });

  it('formats seconds correctly', () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers({ now });
    expect(formatCountdown(now + 45_000)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers({ now });
    expect(formatCountdown(now + 125_000)).toBe('2m05s');
  });

  it('formats hours and minutes', () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers({ now });
    expect(formatCountdown(now + 3_725_000)).toBe('1h02m');
  });

  it('treats values < 1e12 as seconds and converts to ms', () => {
    const nowMs = 1_700_000_000_000;
    const nowSec = nowMs / 1000;
    vi.useFakeTimers({ now: nowMs });
    expect(formatCountdown(nowSec + 60)).toBe('1m00s');
  });
});
