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
    expect(out).toContain('cache');
    expect(out).toContain('76%');
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
    // 80000 / (50000 + 80000 + 20000) = 53%
    expect(out).toContain('cache 53%');
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
