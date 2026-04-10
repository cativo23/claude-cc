import { describe, it, expect } from 'vitest';
import { THEMES, getThemeNames, resolveTheme } from '../src/themes.js';

describe('THEMES', () => {
  it('has at least 5 themes', () => {
    expect(Object.keys(THEMES).length).toBeGreaterThanOrEqual(5);
  });

  it('each theme has all required color keys', () => {
    const requiredKeys = ['cyan', 'magenta', 'yellow', 'green', 'orange', 'red', 'brightBlue', 'gray'];
    for (const [name, palette] of Object.entries(THEMES)) {
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
    expect(names).toContain('dracula');
    expect(names).toContain('nord');
    expect(names).toContain('tokyo-night');
    expect(names).toContain('catppuccin');
    expect(names).toContain('monokai');
  });
});

describe('resolveTheme', () => {
  it('returns null when no theme specified', () => {
    expect(resolveTheme(undefined, 'truecolor')).toBeNull();
  });

  it('returns null for non-truecolor modes', () => {
    expect(resolveTheme('dracula', 'named')).toBeNull();
    expect(resolveTheme('dracula', '256')).toBeNull();
  });

  it('returns palette for valid theme in truecolor mode', () => {
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
