import { describe, it, expect } from 'vitest';
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
        display: { ...DEFAULT_DISPLAY, contextBar: false, contextTokens: false, cost: false, duration: false, rateLimits: false },
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
  describe('rate-limit battery glyph', () => {
    function ctxWithRateLimit(usedPercentage: number, iconMode: 'nerd' | 'emoji' | 'none' = 'nerd') {
      const rawInput = {
        model: 'Claude Sonnet 4.6',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
        rate_limits: { five_hour: { used_percentage: usedPercentage, resets_at: Math.floor(Date.now() / 1000) + 3600 } },
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
  });
});
