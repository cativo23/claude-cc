import type { ColorMode } from './render/colors.js';

/**
 * A theme defines truecolor overrides for each named color.
 * At runtime, if the user selects a theme AND their terminal supports
 * truecolor/256, these values replace the defaults in createColors.
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

function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
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
};

export function getThemeNames(): string[] {
  return Object.keys(THEMES);
}

export function resolveTheme(name: string | undefined, mode: ColorMode): ThemePalette | null {
  if (!name) return null;
  // Themes only apply in truecolor mode — they use RGB values
  if (mode !== 'truecolor') return null;
  return THEMES[name.toLowerCase()] ?? null;
}
