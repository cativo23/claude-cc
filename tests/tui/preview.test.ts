import { describe, it, expect } from 'vitest';
import { buildPreview } from '../../src/tui/preview.js';

describe('buildPreview', () => {
  it('returns a non-empty string for preset "balanced"', () => {
    const out = buildPreview({ preset: 'balanced', icons: 'nerd' });
    expect(out.length).toBeGreaterThan(0);
  });

  it('dracula theme in truecolor emits a dracula RGB code', () => {
    const out = buildPreview({ preset: 'full', theme: 'dracula', icons: 'nerd', colorMode: 'truecolor' });
    // Dracula cyan: rgb(139, 233, 253)
    expect(out).toContain('\x1b[38;2;139;233;253m');
  });

  it('named color mode does not emit 24-bit RGB escapes', () => {
    const out = buildPreview({ preset: 'full', theme: 'dracula', icons: 'nerd', colorMode: 'named' });
    expect(out).not.toContain('\x1b[38;2;');
  });

  it('icons="none" produces no Nerd Font codepoints (Private Use Area)', () => {
    const out = buildPreview({ preset: 'full', icons: 'none' });
    expect(/[\uE000-\uF8FF]/.test(out)).toBe(false);
  });

  it('catches renderer exceptions and returns fallback', () => {
    const out = buildPreview({ preset: 'balanced', icons: 'nerd' }, {
      render: () => { throw new Error('boom'); },
    });
    expect(out).toBe('(preview unavailable)');
  });

  it('full preset shows segments that balanced suppresses (regression)', () => {
    // Pre-fix the wizard preview only mirrored layout, leaving every
    // display toggle on for both presets. The two outputs were identical
    // at typical wizard widths. After applyPreset is invoked correctly,
    // balanced suppresses burnRate, duration, tokenSpeed, linesChanged,
    // sessionName, version, memory, contextTokens, cacheMetrics — so the
    // outputs must differ.
    const full = buildPreview({ preset: 'full', icons: 'nerd' });
    const balanced = buildPreview({ preset: 'balanced', icons: 'nerd' });
    expect(full).not.toBe(balanced);
    // Sanity: full keeps the burn-rate suffix, balanced drops it
    expect(full).toMatch(/\$\d+\.\d+\/h/);
    expect(balanced).not.toMatch(/\$\d+\.\d+\/h/);
  });
});
