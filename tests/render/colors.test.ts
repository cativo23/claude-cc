import { describe, it, expect, vi, afterEach } from 'vitest';
import { createColors, stripAnsi, detectColorMode, getContextColor, getQuotaColor, getPaceColor, getCacheHitColor, getCacheHitTier } from '../../src/render/colors.js';

describe('stripAnsi', () => {
  it('removes ANSI escape codes', () => {
    expect(stripAnsi('\x1b[36mhello\x1b[0m')).toBe('hello');
    expect(stripAnsi('\x1b[38;5;208mworld\x1b[0m')).toBe('world');
    expect(stripAnsi('\x1b[38;2;255;0;0mred\x1b[0m')).toBe('red');
  });
  it('returns plain string unchanged', () => { expect(stripAnsi('hello world')).toBe('hello world'); });
});

describe('detectColorMode', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns truecolor when COLORTERM=truecolor', () => {
    vi.stubEnv('COLORTERM', 'truecolor');
    vi.stubEnv('TERM', '');
    vi.stubEnv('TERM_PROGRAM', '');
    expect(detectColorMode()).toBe('truecolor');
  });

  it('returns truecolor when COLORTERM=24bit', () => {
    vi.stubEnv('COLORTERM', '24bit');
    vi.stubEnv('TERM', '');
    vi.stubEnv('TERM_PROGRAM', '');
    expect(detectColorMode()).toBe('truecolor');
  });

  it('returns 256 when TERM ends with -256color', () => {
    vi.stubEnv('COLORTERM', '');
    vi.stubEnv('TERM', 'xterm-256color');
    vi.stubEnv('TERM_PROGRAM', '');
    expect(detectColorMode()).toBe('256');
  });

  it('returns 256 for iTerm.app', () => {
    vi.stubEnv('COLORTERM', '');
    vi.stubEnv('TERM', 'xterm');
    vi.stubEnv('TERM_PROGRAM', 'iTerm.app');
    expect(detectColorMode()).toBe('256');
  });

  it('returns named as fallback', () => {
    vi.stubEnv('COLORTERM', '');
    vi.stubEnv('TERM', 'xterm');
    vi.stubEnv('TERM_PROGRAM', '');
    expect(detectColorMode()).toBe('named');
  });
});

describe('createColors', () => {
  it('wraps text with named ANSI codes', () => {
    const c = createColors('named');
    expect(c.cyan('test')).toBe('\x1b[36mtest\x1b[0m');
    expect(c.red('err')).toBe('\x1b[31merr\x1b[0m');
  });
  it('creates 256-color output', () => {
    const c = createColors('256');
    expect(c.orange('warn')).toContain('\x1b[38;5;208m');
  });
});

describe('getContextColor', () => {
  it('returns green for <50% with default thresholds', () => { expect(getContextColor(30)).toBe('green'); });
  it('returns yellow for 50-69% with default thresholds', () => { expect(getContextColor(55)).toBe('yellow'); });
  it('returns orange for 70-84% with default thresholds', () => { expect(getContextColor(70)).toBe('orange'); });
  it('returns blinkRed for >=85% with default thresholds', () => { expect(getContextColor(85)).toBe('blinkRed'); });

  describe('with custom thresholds where warning < 50', () => {
    // warning=30, critical=60: green floor (50) is above warning, so semantics
    // collapse to green = below warning, orange = warning..critical, red = >=critical.
    it('returns green when below warning and below 50 floor', () => {
      expect(getContextColor(20, 30, 60)).toBe('green');
    });
    it('returns orange when at or above warning but below critical', () => {
      expect(getContextColor(40, 30, 60)).toBe('orange');
    });
    it('returns orange just below critical', () => {
      expect(getContextColor(55, 30, 60)).toBe('orange');
    });
    it('returns blinkRed when at or above critical', () => {
      expect(getContextColor(70, 30, 60)).toBe('blinkRed');
    });
  });

  describe('with custom thresholds where warning > 50', () => {
    it('returns green below 50 even with high warning threshold', () => {
      expect(getContextColor(48, 60, 80)).toBe('green');
    });
    it('returns yellow between 50 and warning', () => {
      expect(getContextColor(55, 60, 80)).toBe('yellow');
    });
  });
});

describe('getQuotaColor', () => {
  it('returns green for <50%', () => { expect(getQuotaColor(30)).toBe('green'); });
  it('returns green for 0%', () => { expect(getQuotaColor(0)).toBe('green'); });
  // Exact green→yellow boundary
  it('returns green at 49 — one below green/yellow boundary', () => { expect(getQuotaColor(49)).toBe('green'); });
  it('returns yellow at 50 — exactly green/yellow boundary', () => { expect(getQuotaColor(50)).toBe('yellow'); });
  it('returns yellow for 50-69%', () => { expect(getQuotaColor(55)).toBe('yellow'); });
  // Exact yellow→orange boundary
  it('returns yellow at 69 — one below yellow/orange boundary', () => { expect(getQuotaColor(69)).toBe('yellow'); });
  it('returns orange at 70 — exactly yellow/orange boundary', () => { expect(getQuotaColor(70)).toBe('orange'); });
  it('returns orange for 70-84%', () => { expect(getQuotaColor(75)).toBe('orange'); });
  it('returns orange at 84 — one below QUOTA_CRITICAL boundary', () => { expect(getQuotaColor(84)).toBe('orange'); });
  it('returns blinkRed at 85 — exactly QUOTA_CRITICAL boundary', () => { expect(getQuotaColor(85)).toBe('blinkRed'); });
  it('returns blinkRed for >=85%', () => { expect(getQuotaColor(90)).toBe('blinkRed'); });
  it('returns blinkRed for 100%', () => { expect(getQuotaColor(100)).toBe('blinkRed'); });
  // Non-finite guards — these tests validate that the explicit guard fires:
  // NaN falls through to blinkRed in both old and new code, but Infinity/-Infinity
  // changed behavior: old code -Infinity → green (< 50 was true), new code → blinkRed.
  it('returns blinkRed for NaN', () => { expect(getQuotaColor(NaN)).toBe('blinkRed'); });
  it('returns blinkRed for Infinity', () => { expect(getQuotaColor(Infinity)).toBe('blinkRed'); });
  it('returns blinkRed for -Infinity — guard prevents false green', () => { expect(getQuotaColor(-Infinity)).toBe('blinkRed'); });
});

describe('getPaceColor', () => {
  it('returns green at delta = 0 (exactly on pace)', () => { expect(getPaceColor(0)).toBe('green'); });
  it('returns green for negative delta (behind pace — healthy)', () => { expect(getPaceColor(-10)).toBe('green'); });
  it('returns yellow at delta = 1 (lower warning boundary)', () => { expect(getPaceColor(1)).toBe('yellow'); });
  it('returns yellow at delta = 15 (upper warning boundary)', () => { expect(getPaceColor(15)).toBe('yellow'); });
  it('returns orange at delta = 16 (lower escalation boundary)', () => { expect(getPaceColor(16)).toBe('orange'); });
  it('returns orange at delta = 30 (upper escalation boundary)', () => { expect(getPaceColor(30)).toBe('orange'); });
  it('returns blinkRed at delta = 31 (critical boundary)', () => { expect(getPaceColor(31)).toBe('blinkRed'); });
  it('returns blinkRed for very high delta', () => { expect(getPaceColor(80)).toBe('blinkRed'); });
});

describe('getCacheHitTier', () => {
  // SSOT for cache severity thresholds — both getCacheHitColor (classic fg)
  // and the powerline bg mapper consume this. Boundary tests pin both edges
  // of every tier so a future threshold tweak fails loudly.
  it('returns mild at 89% (just below alarm gate)', () => { expect(getCacheHitTier(89)).toBe('mild'); });
  it('returns mild at 70% (lower mild boundary)', () => { expect(getCacheHitTier(70)).toBe('mild'); });
  it('returns moderate at 69% (upper moderate boundary)', () => { expect(getCacheHitTier(69)).toBe('moderate'); });
  it('returns moderate at 40% (lower moderate boundary)', () => { expect(getCacheHitTier(40)).toBe('moderate'); });
  it('returns critical at 39% (upper critical boundary)', () => { expect(getCacheHitTier(39)).toBe('critical'); });
  it('returns critical at 0% (cache fully broken)', () => { expect(getCacheHitTier(0)).toBe('critical'); });
});

describe('getCacheHitColor', () => {
  // Alarm-mode tiers: ≥90% is hidden by the renderer entirely; the colors below
  // describe degrees of "cache is degrading" for the visible-warning range.
  // The threshold logic itself is pinned by getCacheHitTier above; this suite
  // verifies the tier→ColorName mapping has not regressed.
  it('returns yellow at 89% (mild concern, just below alarm threshold)', () => { expect(getCacheHitColor(89)).toBe('yellow'); });
  it('returns yellow at 70% (lower yellow boundary)', () => { expect(getCacheHitColor(70)).toBe('yellow'); });
  it('returns orange at 69% (upper orange boundary)', () => { expect(getCacheHitColor(69)).toBe('orange'); });
  it('returns orange at 40% (lower orange boundary)', () => { expect(getCacheHitColor(40)).toBe('orange'); });
  it('returns blinkRed at 39% (upper red boundary — cache likely broken)', () => { expect(getCacheHitColor(39)).toBe('blinkRed'); });
  it('returns blinkRed at 0% (no cache hits)', () => { expect(getCacheHitColor(0)).toBe('blinkRed'); });
});
