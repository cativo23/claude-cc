import { describe, it, expect } from 'vitest';
import { THEMES, getThemeNames, resolveTheme, downgradePaletteTo256, type ThemePalette } from '../src/themes.js';

// Build a synthetic palette where every color slot is the same RGB triple.
// Used to exercise rgbTo256 indirectly through downgradePaletteTo256.
function synthetic(escape: string): ThemePalette {
  return {
    cyan: escape, magenta: escape, yellow: escape, green: escape,
    orange: escape, red: escape, brightBlue: escape, gray: escape,
  };
}
const rgbEsc = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;

describe('THEMES', () => {
  it('has at least 7 themes', () => {
    expect(Object.keys(THEMES).length).toBeGreaterThanOrEqual(7);
  });

  it('each theme has all required color keys', () => {
    const requiredKeys = ['cyan', 'magenta', 'yellow', 'green', 'orange', 'red', 'brightBlue', 'gray'];
    for (const [, palette] of Object.entries(THEMES)) {
      for (const key of requiredKeys) {
        expect(palette).toHaveProperty(key);
        expect((palette as Record<string, string>)[key]).toContain('\x1b[38;2;');
      }
    }
  });
});

describe('getThemeNames', () => {
  it('returns all theme names', () => {
    const names = getThemeNames();
    expect(names).toEqual(
      expect.arrayContaining(['dracula', 'nord', 'tokyo-night', 'catppuccin', 'monokai', 'gruvbox', 'solarized']),
    );
  });
});

describe('resolveTheme', () => {
  it('returns null when no theme specified', () => {
    expect(resolveTheme(undefined, 'truecolor')).toBeNull();
  });

  it('returns null in named mode (insufficient color fidelity)', () => {
    expect(resolveTheme('dracula', 'named')).toBeNull();
  });

  it('returns a downgraded 256-color palette in 256 mode', () => {
    const palette = resolveTheme('dracula', '256');
    expect(palette).not.toBeNull();
    expect(palette!.cyan).toMatch(/^\x1b\[38;5;\d+m$/);
    expect(palette!.magenta).toMatch(/^\x1b\[38;5;\d+m$/);
  });

  it('returns the raw RGB palette in truecolor mode', () => {
    const palette = resolveTheme('dracula', 'truecolor');
    expect(palette).not.toBeNull();
    expect(palette!.cyan).toContain('\x1b[38;2;');
  });

  it('is case-insensitive', () => {
    expect(resolveTheme('Dracula', 'truecolor')).not.toBeNull();
    expect(resolveTheme('NORD', 'truecolor')).not.toBeNull();
  });

  it('returns null for unknown theme', () => {
    expect(resolveTheme('nonexistent', 'truecolor')).toBeNull();
  });
});

describe('downgradePaletteTo256 (rgbTo256 projection)', () => {
  it('maps pure black (0,0,0) to xterm index 16', () => {
    expect(downgradePaletteTo256(synthetic(rgbEsc(0, 0, 0))).cyan).toBe('\x1b[38;5;16m');
  });

  it('maps pure white (255,255,255) to xterm index 231', () => {
    expect(downgradePaletteTo256(synthetic(rgbEsc(255, 255, 255))).cyan).toBe('\x1b[38;5;231m');
  });

  it('maps mid-gray (128,128,128) into the grayscale ramp (232-255)', () => {
    const m = downgradePaletteTo256(synthetic(rgbEsc(128, 128, 128))).cyan.match(/38;5;(\d+)m/);
    const idx = parseInt(m![1], 10);
    expect(idx).toBeGreaterThanOrEqual(232);
    expect(idx).toBeLessThanOrEqual(255);
  });

  it('maps pure red (255,0,0) to cube index 196', () => {
    expect(downgradePaletteTo256(synthetic(rgbEsc(255, 0, 0))).cyan).toBe('\x1b[38;5;196m');
  });

  it('maps pure green (0,255,0) to cube index 46', () => {
    expect(downgradePaletteTo256(synthetic(rgbEsc(0, 255, 0))).cyan).toBe('\x1b[38;5;46m');
  });

  it('maps pure blue (0,0,255) to cube index 21', () => {
    expect(downgradePaletteTo256(synthetic(rgbEsc(0, 0, 255))).cyan).toBe('\x1b[38;5;21m');
  });

  it('handles grayscale boundary: r<8 rounds to black (16)', () => {
    expect(downgradePaletteTo256(synthetic(rgbEsc(5, 5, 5))).cyan).toBe('\x1b[38;5;16m');
  });

  it('handles grayscale boundary: r>248 rounds to white (231)', () => {
    expect(downgradePaletteTo256(synthetic(rgbEsc(250, 250, 250))).cyan).toBe('\x1b[38;5;231m');
  });

  it('leaves malformed escapes untouched (not a truecolor escape)', () => {
    // Sanity: if an escape doesn't match the parseRgb shape, the function
    // returns it unchanged rather than throwing.
    const weird = '\x1b[1;38;5;208m';
    expect(downgradePaletteTo256(synthetic(weird)).cyan).toBe(weird);
  });
});
