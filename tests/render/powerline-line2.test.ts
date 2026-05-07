import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderPowerlineLine2 } from '../../src/render/powerline-line2.js';
import { createColors } from '../../src/render/colors.js';
import { stripAnsi } from '../../src/render/colors.js';
import { resolveIcons } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';
import { DEFAULT_CONFIG, DEFAULT_DISPLAY, EMPTY_GIT, EMPTY_TRANSCRIPT } from '../../src/types.js';
import type { RenderContext } from '../../src/types.js';
import { EMOJI_ICONS, NO_ICONS } from '../../src/render/icons.js';

function makeCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  const rawInput = {
    model: 'Claude Sonnet 4.6',
    session_id: 'test',
    context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
    cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
  };
  return {
    input: normalize(rawInput),
    git: { ...EMPTY_GIT },
    transcript: { ...EMPTY_TRANSCRIPT },
    tokenSpeed: null,
    memory: null,
    gsd: null,
    mcp: null,
    cols: 120,
    config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } },
    icons: resolveIcons('nerd'),
    ...overrides,
  };
}

const c = createColors('truecolor', null);

describe('renderPowerlineLine2', () => {
  afterEach(() => vi.useRealTimers());

  it('renders context bar segment in truecolor', () => {
    const ctx = makeCtx();
    const out = renderPowerlineLine2(ctx, 'truecolor', null, c);
    expect(out).toBeTruthy();
    expect(out).toContain('\x1b[48;2;');
    expect(out.endsWith('\x1b[0m')).toBe(true);
  });

  it('renders cost segment when cost is present', () => {
    const ctx = makeCtx();
    const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
    expect(out).toContain('$');
  });

  it('uses context_window_size as capacity, not back-derived from cumulative input', () => {
    // total_input_tokens (957k) is cumulative; real context = 18% of 1M = 180k.
    // Pre-fix would have shown 957k/5.3M (back-derived from 957k/0.18).
    const rawInput = {
      model: 'Claude Sonnet 4.6',
      session_id: 'test',
      context_window: {
        used_percentage: 18,
        remaining_percentage: 82,
        total_input_tokens: 957000,
        total_output_tokens: 1656000,
        context_window_size: 1000000,
      },
      cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
    };
    const ctx = makeCtx({ input: normalize(rawInput) });
    const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
    expect(out).toContain('180k/1.0M');
    expect(out).not.toContain('5.3M');
    expect(out).not.toContain('957k/');
  });

  it('returns empty string when all display toggles are off', () => {
    const ctx = makeCtx({
      config: {
        ...DEFAULT_CONFIG,
        display: {
          ...DEFAULT_DISPLAY,
          contextBar: false,
          contextTokens: false,
          cost: false,
          duration: false,
          rateLimits: false,
          tokens: false,
          cacheMetrics: false,
          burnRate: false,
          mcp: false,
          vim: false,
          effort: false,
        },
      },
    });
    const out = renderPowerlineLine2(ctx, 'truecolor', null, c);
    expect(out).toBe('');
  });

  it('projects to 256-color escapes in 256 mode', () => {
    const ctx = makeCtx();
    const out = renderPowerlineLine2(ctx, '256', null, c);
    expect(out).toMatch(/\x1b\[48;5;\d+m/);
    expect(out).not.toContain('\x1b[48;2;');
  });

  // Battery glyph in the rate-limit segment — mirrors the line2.test.ts coverage
  // so the powerline path is not silently regressed when the glyph mapping moves.
  describe('parity segments', () => {
    it('tokens segment appears when display.tokens true and input has token counts', () => {
      const rawInput = {
        model: 'Claude Sonnet 4.6',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 50000, total_output_tokens: 5000 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
      };
      const ctx = makeCtx({
        input: normalize(rawInput),
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, tokens: true } },
      });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      // Should contain ↑ or ↓ token indicators
      expect(out).toMatch(/↑|↓/);
    });

    it('cacheMetrics segment appears when display.cacheMetrics true and input has cacheHitRate', () => {
      const rawInput = {
        model: 'claude-code',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 50000, total_output_tokens: 5000 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
        usage: { input_tokens: 5000, output_tokens: 1000, cache_read_input_tokens: 4000, cache_creation_input_tokens: 1000 },
      };
      // Directly set cacheHitRate on the normalized input
      const normalizedInput = normalize(rawInput);
      // Patch cacheHitRate in since the test payload may not trigger the parser logic
      const patchedInput = { ...normalizedInput, cacheHitRate: 75 };
      const ctx = makeCtx({
        input: patchedInput,
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, cacheMetrics: true } },
      });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      // New format: N%⚡ (no 'cache' prefix)
      expect(out).toContain('75%');
      expect(out).not.toContain('cache 75%');
    });

    it('burnRate segment appears next to cost when display.burnRate true', () => {
      const rawInput = {
        model: 'Claude Sonnet 4.6',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
      };
      const ctx = makeCtx({
        input: normalize(rawInput),
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, cost: true, burnRate: true } },
      });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      // burnRate formatted as $/h or $/min — check for $/
      expect(out).toMatch(/\$.*\/[hm]/);
    });

    it('cache hit rate renders as N%⚡ in powerline segment (no "cache" prefix)', () => {
      const patchedInput = { ...makeCtx().input, cacheHitRate: 85 };
      const ctx = makeCtx({
        input: patchedInput,
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, cacheMetrics: true } },
      });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('85%');
      expect(out).not.toContain('cache 85%');
    });

    it('pace delta segment appears when fiveHour window has sufficient data', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      const resetsAt = nowSec + 3 * 3600; // 2h elapsed of a 5h window
      const rawInput = {
        model: 'Claude Sonnet 4.6',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
        rate_limits: { five_hour: { used_percentage: 60, resets_at: resetsAt } },
      };
      const ctx = makeCtx({ input: normalize(rawInput) });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      // delta = 60 - 40 = +20%
      expect(out).toContain('+20%');
    });
  });

  describe('config health hints', () => {
    it('renders GSD-missing info hint when gsd is on but no .planning/STATE.md found', () => {
      // This is the only health hint reachable in powerline mode (powerline requires
      // truecolor/256, so named-color hints are never shown through this path).
      // gsd:true + cwd with no STATE.md → getConfigHealth returns the info hint.
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90, total_input_tokens: 0, total_output_tokens: 0 } }), cwd: '/tmp' },
        config: {
          ...DEFAULT_CONFIG,
          display: { ...DEFAULT_DISPLAY, health: true },
          colors: { mode: 'truecolor' },
          gsd: true,
        },
      });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('ℹ');
      expect(out).toContain('GSD on but no .planning/STATE.md found');
    });

    it('does not render health hints when display.health is false', () => {
      const ctx = makeCtx({
        input: { ...normalize({ model: 'Claude', session_id: 't', context_window: { used_percentage: 10, remaining_percentage: 90, total_input_tokens: 0, total_output_tokens: 0 } }), cwd: '/tmp' },
        config: {
          ...DEFAULT_CONFIG,
          display: { ...DEFAULT_DISPLAY, health: false },
          colors: { mode: 'truecolor' },
          gsd: true,
        },
      });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).not.toContain('ℹ');
    });

    it('does not render health hints when getConfigHealth returns no hints', () => {
      // truecolor + no theme + no gsd → getConfigHealth returns []
      const ctx = makeCtx({
        config: {
          ...DEFAULT_CONFIG,
          display: { ...DEFAULT_DISPLAY, health: true },
          colors: { mode: 'truecolor' },
          gsd: false,
        },
      });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).not.toMatch(/[⚠ℹ]/);
    });
  });

  describe('rate-limit battery glyph', () => {
    function ctxWithRateLimit(usedPercentage: number, iconMode: 'nerd' | 'emoji' | 'none' = 'nerd') {
      const rawInput = {
        model: 'Claude Sonnet 4.6',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
        rate_limits: { five_hour: { used_percentage: usedPercentage } },
      };
      const icons = iconMode === 'emoji' ? EMOJI_ICONS : iconMode === 'none' ? NO_ICONS : resolveIcons('nerd');
      return makeCtx({ input: normalize(rawInput), icons });
    }

    it('renders nerd-mode battery glyph at 78% in the 5h rate-limit segment', () => {
      const out = stripAnsi(renderPowerlineLine2(ctxWithRateLimit(78), 'truecolor', null, c));
      expect(out).toContain('\u{F0080}'); // battery_70 bucket
      expect(out).toContain('78%(5h)');
    });

    it('renders alert glyph at 100% ceiling in powerline rate-limit segment', () => {
      const out = stripAnsi(renderPowerlineLine2(ctxWithRateLimit(100), 'truecolor', null, c));
      expect(out).toContain('\u{F0083}'); // battery_alert
    });

    it('rounds 99.7 up to 100 — glyph matches the displayed text', () => {
      const out = stripAnsi(renderPowerlineLine2(ctxWithRateLimit(99.7), 'truecolor', null, c));
      expect(out).toContain('\u{F0083}'); // alert, NOT battery_90
      expect(out).toContain('100%(5h)');  // text rounds up too
    });

    it('renders emoji-mode 🪫 at >=85% rate-limit', () => {
      const out = stripAnsi(renderPowerlineLine2(ctxWithRateLimit(90, 'emoji'), 'truecolor', null, c));
      expect(out).toContain('\u{1FAAB}');
    });

    it('does not render rate-limit segment when usedPercentage is NaN', () => {
      const out = stripAnsi(renderPowerlineLine2(ctxWithRateLimit(NaN), 'truecolor', null, c));
      expect(out).not.toContain('NaN');
      expect(out).not.toContain('(5h)');
    });

    it('does not render rate-limit segment below 50% gate', () => {
      const out = stripAnsi(renderPowerlineLine2(ctxWithRateLimit(49), 'truecolor', null, c));
      expect(out).not.toContain('(5h)');
    });

    it('renders sevenDay window with correct label and battery glyph', () => {
      const rawInput = {
        model: 'Claude Sonnet 4.6',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
        rate_limits: { seven_day: { used_percentage: 78 } },
      };
      const ctx = makeCtx({ input: normalize(rawInput), icons: resolveIcons('nerd') });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('(7d)');
      expect(out).toContain('\u{F0080}'); // battery_70 glyph for 78%
      expect(out).not.toContain('(5h)');
    });

    it('renders both fiveHour and sevenDay windows when both are above the 50% gate', () => {
      const rawInput = {
        model: 'Claude Sonnet 4.6',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
        rate_limits: {
          five_hour: { used_percentage: 60 },
          seven_day:  { used_percentage: 90 },
        },
      };
      const ctx = makeCtx({ input: normalize(rawInput), icons: resolveIcons('nerd') });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('60%(5h)');
      expect(out).toContain('90%(7d)');
      // 5h renders before 7d (loop order)
      expect(out.indexOf('(5h)')).toBeLessThan(out.indexOf('(7d)'));
    });

    it('renders correct battery glyphs for mixed criticality (60% non-critical, 90% critical)', () => {
      const rawInput = {
        model: 'Claude Sonnet 4.6',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
        rate_limits: {
          five_hour: { used_percentage: 60 },
          seven_day:  { used_percentage: 90 },
        },
      };
      const ctx = makeCtx({ input: normalize(rawInput), icons: resolveIcons('nerd') });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('\u{F0082}'); // battery_90 glyph for 90% (7d)
      expect(out).toContain('\u{F007F}'); // battery_60 glyph for 60% (5h)
    });
  });
});
