import type { ThemePalette, ThemeMetadata } from './types.js';
import { rgb, WHITE } from './util.js';

export const metadata: ThemeMetadata = {
  name: 'catppuccin',
  mode: 'dark',
  source: 'https://catppuccin.com/palette',
};

export const palette: ThemePalette = {
  cyan:       rgb(137, 220, 235),
  magenta:    rgb(245, 194, 231),
  yellow:     rgb(249, 226, 175),
  green:      rgb(166, 227, 161),
  orange:     rgb(250, 179, 135),
  red:        rgb(243, 139, 168),
  brightBlue: rgb(137, 180, 250),
  gray:       rgb(108, 112, 134),
  powerline: {
    modelBg:       { r: 58,  g: 98,  b: 116 },
    dirBg:         { r: 74,  g: 90,  b: 154 },
    branchCleanBg: { r: 122, g: 90,  b: 168 },
    branchDirtyBg: { r: 160, g: 72,  b: 86  },
    taskBg:        { r: 160, g: 102, b: 58  },
    versionBg:     { r: 49,  g: 50,  b: 68  },
    fg: WHITE,
  },
};
