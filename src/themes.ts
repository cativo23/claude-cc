import type { ColorMode } from './render/colors.js';

/**
 * A theme defines truecolor RGB values for each named color.
 * At runtime:
 * - truecolor terminals get the exact RGB via `\x1b[38;2;r;g;bm`
 * - 256-color terminals get the nearest xterm 256-color index via `\x1b[38;5;Nm`
 * - named-ANSI terminals fall back to defaults (themes are not applied)
 */
export interface ThemePalette {
  cyan: string;
  magenta: string;
  yellow: string;
  green: string;
  orange: string;
  red: string;
  brightBlue: string;
  gray: string;
}

interface RGB { r: number; g: number; b: number; }

function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

/** Parse a truecolor escape `\x1b[38;2;R;G;Bm` back into RGB components. */
function parseRgb(escape: string): RGB | null {
  const m = escape.match(/^\x1b\[38;2;(\d+);(\d+);(\d+)m$/);
  if (!m) return null;
  return { r: parseInt(m[1], 10), g: parseInt(m[2], 10), b: parseInt(m[3], 10) };
}

/**
 * Convert an RGB triple to the nearest xterm 256-color index (0..255).
 * Uses the standard 6×6×6 color cube (indices 16..231) plus grayscale ramp
 * (232..255). Algorithm follows Chalk/ansi-styles conventions.
 */
function rgbTo256(r: number, g: number, b: number): number {
  // Grayscale shortcut when r≈g≈b
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
  };
}

export const THEMES: Record<string, ThemePalette> = {
  dracula: {
    cyan: rgb(139, 233, 253),
    magenta: rgb(255, 121, 198),
    yellow: rgb(241, 250, 140),
    green: rgb(80, 250, 123),
    orange: rgb(255, 184, 108),
    red: rgb(255, 85, 85),
    brightBlue: rgb(189, 147, 249),
    gray: rgb(98, 114, 164),
  },
  nord: {
    cyan: rgb(136, 192, 208),
    magenta: rgb(180, 142, 173),
    yellow: rgb(235, 203, 139),
    green: rgb(163, 190, 140),
    orange: rgb(208, 135, 112),
    red: rgb(191, 97, 106),
    brightBlue: rgb(129, 161, 193),
    gray: rgb(76, 86, 106),
  },
  'tokyo-night': {
    cyan: rgb(125, 207, 255),
    magenta: rgb(187, 154, 247),
    yellow: rgb(224, 175, 104),
    green: rgb(158, 206, 106),
    orange: rgb(255, 158, 100),
    red: rgb(247, 118, 142),
    brightBlue: rgb(122, 162, 247),
    gray: rgb(86, 95, 137),
  },
  catppuccin: {
    cyan: rgb(137, 220, 235),
    magenta: rgb(245, 194, 231),
    yellow: rgb(249, 226, 175),
    green: rgb(166, 227, 161),
    orange: rgb(250, 179, 135),
    red: rgb(243, 139, 168),
    brightBlue: rgb(137, 180, 250),
    gray: rgb(108, 112, 134),
  },
  monokai: {
    cyan: rgb(102, 217, 239),
    magenta: rgb(249, 38, 114),
    yellow: rgb(230, 219, 116),
    green: rgb(166, 226, 46),
    orange: rgb(253, 151, 31),
    red: rgb(249, 38, 114),
    brightBlue: rgb(102, 217, 239),
    gray: rgb(117, 113, 94),
  },
  gruvbox: {
    cyan: rgb(131, 165, 152),
    magenta: rgb(211, 134, 155),
    yellow: rgb(215, 153, 33),
    green: rgb(152, 151, 26),
    orange: rgb(214, 93, 14),
    red: rgb(204, 36, 29),
    brightBlue: rgb(69, 133, 136),
    gray: rgb(146, 131, 116),
  },
  solarized: {
    cyan: rgb(42, 161, 152),
    magenta: rgb(211, 54, 130),
    yellow: rgb(181, 137, 0),
    green: rgb(133, 153, 0),
    orange: rgb(203, 75, 22),
    red: rgb(220, 50, 47),
    brightBlue: rgb(38, 139, 210),
    gray: rgb(101, 123, 131),
  },
};

export function getThemeNames(): string[] {
  return Object.keys(THEMES);
}

export function resolveTheme(name: string | undefined, mode: ColorMode): ThemePalette | null {
  if (!name) return null;
  const base = THEMES[name.toLowerCase()];
  if (!base) return null;
  // Truecolor terminals get the exact palette; 256-color terminals get a
  // nearest-index projection. Named-ANSI terminals cannot represent arbitrary
  // palettes — fall back to built-in defaults rather than lying with mismatched
  // named colors (only 8 base hues available).
  if (mode === 'truecolor') return base;
  if (mode === '256') return downgradePaletteTo256(base);
  return null;
}
