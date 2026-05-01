import type { ThemePalette, PowerlinePalette, RGB } from './types.js';

/** Build a truecolor fg escape `\x1b[38;2;r;g;bm`. */
export function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

export const WHITE: RGB = { r: 255, g: 255, b: 255 };

/** Parse a truecolor fg or bg escape (`\x1b[38;2;…m` / `\x1b[48;2;…m`) back into RGB. */
export function parseRgb(escape: string): RGB | null {
  const m = escape.match(/^\x1b\[[34]8;2;(\d+);(\d+);(\d+)m$/);
  if (!m) return null;
  return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) };
}

/** Convert RGB to the nearest xterm 256-color index (cube 16..231 + grayscale 232..255). */
export function rgbTo256Index(r: number, g: number, b: number): number {
  return rgbTo256(r, g, b);
}

/**
 * Convert an RGB triple to the nearest xterm 256-color index (0..255).
 * Uses the standard 6×6×6 color cube (indices 16..231) plus grayscale ramp
 * (232..255). Algorithm follows Chalk/ansi-styles conventions.
 */
function rgbTo256(r: number, g: number, b: number): number {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round((r - 8) / 247 * 24) + 232;
  }
  const cube = (v: number) => Math.round(v / 255 * 5);
  return 16 + 36 * cube(r) + 6 * cube(g) + cube(b);
}

function rgbEscapeTo256(escape: string): string {
  const c = parseRgb(escape);
  if (!c) return escape;
  return `\x1b[38;5;${rgbTo256(c.r, c.g, c.b)}m`;
}

/** Project a truecolor-only palette to 256-color escapes. */
export function downgradePaletteTo256(p: ThemePalette): ThemePalette {
  return {
    cyan: rgbEscapeTo256(p.cyan),
    magenta: rgbEscapeTo256(p.magenta),
    yellow: rgbEscapeTo256(p.yellow),
    green: rgbEscapeTo256(p.green),
    orange: rgbEscapeTo256(p.orange),
    red: rgbEscapeTo256(p.red),
    brightBlue: rgbEscapeTo256(p.brightBlue),
    gray: rgbEscapeTo256(p.gray),
    // powerline stores raw RGB triples (projected to 256 at render time by
    // rgbTo256Index), so pass it through as-is — no escape conversion needed.
    ...(p.powerline ? { powerline: p.powerline } : {}),
  };
}

/** Darken an RGB triple toward black by `factor` in [0,1]. */
function darken(c: RGB, factor: number): RGB {
  return {
    r: Math.round(c.r * (1 - factor)),
    g: Math.round(c.g * (1 - factor)),
    b: Math.round(c.b * (1 - factor)),
  };
}

/**
 * Build a PowerlinePalette for a theme that doesn't define one explicitly.
 * We darken the existing fg hues (by ~55%) so the palette reads as "background
 * tones of the theme" rather than blown-out fg colors that would clash with
 * white text. The branchDirtyBg uses `red` regardless of theme for signal.
 */
export function derivePowerlinePalette(theme: ThemePalette): PowerlinePalette {
  const get = (escape: string, fallback: RGB): RGB => parseRgb(escape) ?? fallback;
  const f = 0.55;
  const fb: RGB = { r: 80, g: 80, b: 80 };
  return {
    modelBg:        darken(get(theme.cyan, fb), f),
    dirBg:          darken(get(theme.brightBlue, fb), f),
    branchCleanBg:  darken(get(theme.magenta, fb), f),
    branchDirtyBg:  darken(get(theme.red, fb), f),
    taskBg:         darken(get(theme.yellow, fb), f),
    versionBg:      darken(get(theme.gray, fb), f),
    fg:             WHITE,
  };
}

/** Fallback powerline palette when no theme is selected (named-ANSI terminals use classic). */
export const DEFAULT_POWERLINE_PALETTE: PowerlinePalette = {
  modelBg:       { r: 32,  g: 96,  b: 128 },
  dirBg:         { r: 48,  g: 72,  b: 128 },
  branchCleanBg: { r: 96,  g: 48,  b: 112 },
  branchDirtyBg: { r: 160, g: 40,  b: 40  },
  taskBg:        { r: 128, g: 96,  b: 24  },
  versionBg:     { r: 64,  g: 64,  b: 72  },
  fg:            WHITE,
};
