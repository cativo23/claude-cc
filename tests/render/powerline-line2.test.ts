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
      const raw = renderPowerlineLine2(ctx, 'truecolor', null, c);
      const out = stripAnsi(raw);
      // New format: N%⚡ (no 'cache' prefix)
      expect(out).toContain('75%');
      expect(out).not.toContain('cache 75%');
      // Lock yellow-tier bg: 75% sits in the [70, 90) range and must keep
      // DEFAULT_POWERLINE_PALETTE.versionBg as its background, matching pre-escalation behavior.
      expect(raw).toContain('\x1b[48;2;64;64;72m');
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

    it('cache hit rate hidden in powerline when >=90% (alarm-mode)', () => {
      const patchedInput = { ...makeCtx().input, cacheHitRate: 99 };
      const ctx = makeCtx({
        input: patchedInput,
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, cacheMetrics: true } },
      });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).not.toMatch(/\d+%⚡/);
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

  describe('cache color escalation', () => {
    // DEFAULT_POWERLINE_PALETTE values (theme=null path).
    // The escape format is \x1b[48;2;R;G;Bm — produced by powerline.ts:61-62.
    const bg = (rgb: { r: number; g: number; b: number }) => `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m`;
    const VERSION_BG = { r: 64, g: 64, b: 72 };
    const TASK_BG = { r: 128, g: 96, b: 24 };
    const BRANCH_DIRTY_BG = { r: 160, g: 40, b: 40 };

    function cacheCtx(rate: number) {
      const base = makeCtx();
      // Disable every other display toggle so the only bg escape in the
      // output belongs to the cache segment. Otherwise `cost` (taskBg) and
      // `mcp` (taskBg) would make orange-tier assertions pass spuriously.
      return makeCtx({
        input: { ...base.input, cacheHitRate: rate },
        config: {
          ...DEFAULT_CONFIG,
          display: {
            ...DEFAULT_DISPLAY,
            cacheMetrics: true,
            contextBar: false,
            contextTokens: false,
            cost: false,
            burnRate: false,
            tokens: false,
            rateLimits: false,
            paceDelta: false,
            mcp: false,
            vim: false,
            effort: false,
          },
        },
      });
    }

    it('yellow tier lower boundary (70%) renders with versionBg', () => {
      const raw = renderPowerlineLine2(cacheCtx(70), 'truecolor', null, c);
      expect(raw).toContain(bg(VERSION_BG));
      expect(stripAnsi(raw)).toContain('70%');
    });

    it('orange tier upper boundary (69%) escalates to taskBg', () => {
      const raw = renderPowerlineLine2(cacheCtx(69), 'truecolor', null, c);
      expect(raw).toContain(bg(TASK_BG));
      expect(stripAnsi(raw)).toContain('69%');
    });

    it('orange tier lower boundary (40%) renders with taskBg', () => {
      const raw = renderPowerlineLine2(cacheCtx(40), 'truecolor', null, c);
      expect(raw).toContain(bg(TASK_BG));
      expect(stripAnsi(raw)).toContain('40%');
    });

    it('blinkRed tier upper boundary (39%) escalates to branchDirtyBg', () => {
      const raw = renderPowerlineLine2(cacheCtx(39), 'truecolor', null, c);
      expect(raw).toContain(bg(BRANCH_DIRTY_BG));
      expect(stripAnsi(raw)).toContain('39%');
    });

    it('blinkRed tier deep (30%) renders with branchDirtyBg', () => {
      const raw = renderPowerlineLine2(cacheCtx(30), 'truecolor', null, c);
      expect(raw).toContain(bg(BRANCH_DIRTY_BG));
      expect(stripAnsi(raw)).toContain('30%');
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

  describe('quota projection warning (7d)', () => {
    function ctxWith7dProjection(usedPercentage: number, elapsedSec: number, toggles: Partial<typeof DEFAULT_DISPLAY> = {}) {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      const resetsAt = nowSec + (7 * 24 * 3600 - elapsedSec);
      const rawInput = {
        model: 'Claude Sonnet 4.6',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
        rate_limits: { seven_day: { used_percentage: usedPercentage, resets_at: resetsAt } },
      };
      return makeCtx({
        input: normalize(rawInput),
        config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, ...toggles } },
      });
    }

    it('appends ⚠ ~Xh projection inside the 7d segment when it will exhaust before reset', () => {
      // 1d elapsed of 7d, 50% used → TTE = 24h → ⚠ ~24h (24h is NOT <12h boundary).
      const ctx = ctxWith7dProjection(50, 86400);
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('50%(7d)');
      expect(out).toContain('⚠ ~24h');
    });

    it('uses 🔥 critical icon when projection < 12h', () => {
      // 6h elapsed of 7d, 60% used → TTE = 4h → 🔥
      const ctx = ctxWith7dProjection(60, 6 * 3600);
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('🔥 ~4h');
    });

    it('hides projection when display.quotaProjection toggle is off', () => {
      const ctx = ctxWith7dProjection(50, 86400, { quotaProjection: false });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('50%(7d)');
      expect(out).not.toContain('⚠ ~');
      expect(out).not.toContain('🔥 ~');
    });

    it('no projection when sevenDay has no resetsAt', () => {
      const rawInput = {
        model: 'Claude Sonnet 4.6',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
        rate_limits: { seven_day: { used_percentage: 70 } }, // no resets_at
      };
      const ctx = makeCtx({ input: normalize(rawInput) });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('70%(7d)');
      expect(out).not.toContain('⚠ ~');
      expect(out).not.toContain('🔥 ~');
    });

    it('hides projection when 7d will NOT exhaust before reset', () => {
      // 6d elapsed of 7d, 60% used → TTE ≈ 4d, remaining 1d → false
      const ctx = ctxWith7dProjection(60, 518400);
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('60%(7d)');
      expect(out).not.toContain('⚠ ~');
      expect(out).not.toContain('🔥 ~');
    });

    it('respects 1h minElapsed guard for 7d (no projection at 30min elapsed)', () => {
      const ctx = ctxWith7dProjection(60, 1800);
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('60%(7d)');
      expect(out).not.toContain('⚠ ~');
      expect(out).not.toContain('🔥 ~');
    });

    it('does NOT add projection to 5h segment — pace delta carries that signal', () => {
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      const resetsAt = nowSec + (5 * 3600 - 3600);
      const rawInput = {
        model: 'Claude Sonnet 4.6',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
        rate_limits: { five_hour: { used_percentage: 60, resets_at: resetsAt } },
      };
      const ctx = makeCtx({ input: normalize(rawInput) });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('60%(5h)');
      const fhPos = out.indexOf('60%(5h)');
      const segmentTail = out.slice(fhPos, fhPos + 40);
      expect(segmentTail).not.toContain('⚠ ~');
      expect(segmentTail).not.toContain('🔥 ~');
    });

    // ── Standalone projection segment (badge-decoupled) ────────────────────
    //
    // Mirrors line2.ts: when usedPercentage < 50 the 7d badge is suppressed,
    // but a projection that predicts exhaustion before reset must still
    // surface — as a dedicated powerline segment.

    it.each([
      { label: '⚠ warning tier renders standalone when below 50%', usedPct: 20, elapsedSec: 86400, expectedWarning: '⚠ ~4d' },
      { label: '🔥 critical tier renders standalone when below 50%', usedPct: 40, elapsedSec: 10800, expectedWarning: '🔥 ~4h' },
    ])('$label', ({ usedPct, elapsedSec, expectedWarning }) => {
      const ctx = ctxWith7dProjection(usedPct, elapsedSec);
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).not.toContain(`${usedPct}%(7d)`);
      expect(out).toContain(expectedWarning);
    });

    it('attaches projection to 7d segment when usedPercentage >= 50 (no duplicate standalone)', () => {
      const ctx = ctxWith7dProjection(50, 86400);
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('50%(7d)');
      expect(out).toContain('⚠ ~24h');
      const matches = out.match(/⚠ ~/g) ?? [];
      expect(matches.length).toBe(1);
    });

    it('does not render standalone when projection does not predict exhaustion (below 50%)', () => {
      // 6d elapsed of 7d, 10% used → TTE far exceeds remaining → no warning
      const ctx = ctxWith7dProjection(10, 518400);
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).not.toContain('10%(7d)');
      expect(out).not.toContain('⚠ ~');
      expect(out).not.toContain('🔥 ~');
    });

    // The projection signal is independent of `display.rateLimits` (mirrors
    // pace-delta). Users who hide rate-limit badges still benefit from the
    // exhaustion warning.
    it('renders standalone projection even when display.rateLimits is off (independent toggles)', () => {
      // 1d elapsed of 7d, 60% used → would normally attach, but rateLimits is
      // off so the badge is suppressed. Warning must surface standalone.
      const ctx = ctxWith7dProjection(60, 86400, { rateLimits: false });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).not.toContain('60%(7d)');
      expect(out).toContain('⚠ ~');
    });

    // ── ANSI/bg robustness (post-second-review tightening) ─────────────────
    //
    // The previous projection tests all stripped ANSI before asserting, so a
    // future change that drops the inline colour wrap or flattens the severity
    // bg to a neutral palette slot would not be caught. These tests lock both.

    it('attached projection in 7d segment carries inline yellow ANSI wrap (⚠ tier)', () => {
      // 1d elapsed of 7d, 50% used → ⚠ ~24h, badge visible at >=50%.
      // Module-level `c` is truecolor — yellow emits \x1b[38;2;255;255;0m.
      const ctx = ctxWith7dProjection(50, 86400);
      const raw = renderPowerlineLine2(ctx, 'truecolor', null, c);
      expect(raw).toContain('\x1b[38;2;255;255;0m⚠ ~24h\x1b[0m');
    });

    it('attached projection in 7d segment carries inline red ANSI wrap (🔥 tier)', () => {
      // 6h elapsed of 7d, 60% used → TTE 4h → 🔥. Badge visible at >=50%.
      // Note: createColors keeps `red` in named mode even when overall mode is
      // truecolor (colors.ts:53 spread leaves red/blinkRed at \x1b[31m). The
      // assertion tracks the actual emitted escape, not the theoretical
      // truecolor red.
      const ctx = ctxWith7dProjection(60, 6 * 3600);
      const raw = renderPowerlineLine2(ctx, 'truecolor', null, c);
      expect(raw).toContain('\x1b[31m🔥 ~4h\x1b[0m');
    });

    it('standalone 🔥 emits BRANCH_DIRTY_BG; standalone ⚠ emits TASK_BG', () => {
      // Default truecolor palette values (theme=null path, see themes.ts).
      const BRANCH_DIRTY_BG = '\x1b[48;2;160;40;40m';
      const TASK_BG = '\x1b[48;2;128;96;24m';

      // 3h elapsed of 7d, 40% used → TTE 4.5h → 🔥 ~4h standalone (<50% badge hidden).
      // BRANCH_DIRTY_BG is unique to the standalone 🔥 in this context (no
      // rate-limit segment ≥85%, no cacheMetrics <40%), so the assertion is
      // strict without further toggle gating.
      const critCtx = ctxWith7dProjection(40, 10800);
      const critRaw = renderPowerlineLine2(critCtx, 'truecolor', null, c);
      expect(critRaw).toContain('🔥 ~4h');
      expect(critRaw).toContain(BRANCH_DIRTY_BG);

      // 1d elapsed of 7d, 20% used → TTE 4d → ⚠ ~4d standalone (<50% badge hidden).
      // `cost: false` disables the cost segment (which also emits TASK_BG) so
      // the assertion locks the standalone ⚠ segment's bg specifically. Without
      // this gate the test would pass even if the standalone ⚠ used a
      // different bg.
      const warnCtx = ctxWith7dProjection(20, 86400, { cost: false });
      const warnRaw = renderPowerlineLine2(warnCtx, 'truecolor', null, c);
      expect(warnRaw).toContain('⚠ ~4d');
      expect(warnRaw).toContain(TASK_BG);
    });

    it('standalone 🔥 outlives 5h critical under narrow-cols eviction', () => {
      // Concurrence pattern the headline scenario must protect: heavy short-
      // burst usage (5h critical, priority 85) AND silent weekly trajectory
      // off-rails (7d sub-50% projection 🔥). At cols=45 only one of the two
      // fits; whichever has lower priority is dropped.
      //
      // Reasoning behind 🔥 winning: 5h critical has redundant time-to-exhaust
      // signal via paceDelta. The standalone 🔥 has no other carrier — if it
      // evicts, the user sees the immediate fire but loses the warning about
      // weekly trajectory. The more-actionable signal must win the contest.
      //
      // This test fails with standalone 🔥 priority <= 85; passes when > 85.
      const pinnedNow = 1_700_000_000_000;
      vi.useFakeTimers({ now: pinnedNow });
      const nowSec = pinnedNow / 1000;
      const fiveHourReset = nowSec + 600;
      const sevenDayReset = nowSec + (7 * 24 * 3600 - 10800);
      const rawInput = {
        model: 'Claude Sonnet 4.6',
        session_id: 'test',
        context_window: { used_percentage: 42, remaining_percentage: 58, total_input_tokens: 12000, total_output_tokens: 1800 },
        cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
        rate_limits: {
          five_hour: { used_percentage: 90, resets_at: fiveHourReset },
          seven_day: { used_percentage: 40, resets_at: sevenDayReset },
        },
      };
      const ctx = makeCtx({ input: normalize(rawInput), cols: 45 });
      const out = stripAnsi(renderPowerlineLine2(ctx, 'truecolor', null, c));
      expect(out).toContain('🔥 ~4h');
    });
  });
});
