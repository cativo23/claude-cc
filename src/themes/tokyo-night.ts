import type { ThemePalette, ThemeMetadata } from './types.js';
import { rgb, WHITE } from './util.js';

export const metadata: ThemeMetadata = {
  name: 'tokyo-night',
  mode: 'dark',
  source: 'https://github.com/folke/tokyonight.nvim',
};

export const palette: ThemePalette = {
  cyan:       rgb(125, 207, 255),
  magenta:    rgb(187, 154, 247),
  yellow:     rgb(224, 175, 104),
  green:      rgb(158, 206, 106),
  orange:     rgb(255, 158, 100),
  red:        rgb(247, 118, 142),
  brightBlue: rgb(122, 162, 247),
  gray:       rgb(86,  95,  137),
  powerline: {
    modelBg:       { r: 42,  g: 58,  b: 96  },
    dirBg:         { r: 61,  g: 78,  b: 138 },
    branchCleanBg: { r: 90,  g: 63,  b: 140 },
    branchDirtyBg: { r: 166, g: 58,  b: 75  },
    taskBg:        { r: 138, g: 106, b: 46  },
    versionBg:     { r: 39,  g: 43,  b: 58  },
    fg: WHITE,
  },
};
