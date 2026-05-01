import type { ThemePalette, ThemeMetadata } from './types.js';
import { rgb, WHITE } from './util.js';

export const metadata: ThemeMetadata = {
  name: 'monokai',
  mode: 'dark',
  source: 'https://monokai.pro/',
};

export const palette: ThemePalette = {
  cyan:       rgb(102, 217, 239),
  magenta:    rgb(249, 38,  114),
  yellow:     rgb(230, 219, 116),
  green:      rgb(166, 226, 46),
  orange:     rgb(253, 151, 31),
  red:        rgb(249, 38,  114),
  brightBlue: rgb(102, 217, 239),
  gray:       rgb(117, 113, 94),
  powerline: {
    modelBg:       { r: 42,  g: 93,  b: 110 },
    dirBg:         { r: 73,  g: 72,  b: 62  },
    branchCleanBg: { r: 140, g: 30,  b: 73  },
    branchDirtyBg: { r: 166, g: 56,  b: 37  },
    taskBg:        { r: 133, g: 107, b: 42  },
    versionBg:     { r: 39,  g: 40,  b: 34  },
    fg: WHITE,
  },
};
