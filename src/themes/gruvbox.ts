import type { ThemePalette, ThemeMetadata } from './types.js';
import { rgb, WHITE } from './util.js';

export const metadata: ThemeMetadata = {
  name: 'gruvbox',
  mode: 'dark',
  source: 'https://github.com/morhetz/gruvbox',
};

export const palette: ThemePalette = {
  cyan:       rgb(131, 165, 152),
  magenta:    rgb(211, 134, 155),
  yellow:     rgb(215, 153, 33),
  green:      rgb(152, 151, 26),
  orange:     rgb(214, 93,  14),
  red:        rgb(204, 36,  29),
  brightBlue: rgb(69,  133, 136),
  gray:       rgb(146, 131, 116),
  powerline: {
    modelBg:       { r: 60,  g: 91,  b: 95  },
    dirBg:         { r: 80,  g: 73,  b: 69  },
    branchCleanBg: { r: 131, g: 61,  b: 106 },
    branchDirtyBg: { r: 157, g: 43,  b: 34  },
    taskBg:        { r: 160, g: 104, b: 21  },
    versionBg:     { r: 60,  g: 56,  b: 54  },
    fg: WHITE,
  },
};
