import type { ThemePalette, ThemeMetadata } from './types.js';
import { rgb, WHITE } from './util.js';

export const metadata: ThemeMetadata = {
  name: 'dracula',
  mode: 'dark',
  source: 'https://draculatheme.com/contribute',
};

export const palette: ThemePalette = {
  cyan:       rgb(139, 233, 253),
  magenta:    rgb(255, 121, 198),
  yellow:     rgb(241, 250, 140),
  green:      rgb(80,  250, 123),
  orange:     rgb(255, 184, 108),
  red:        rgb(255, 85,  85),
  brightBlue: rgb(189, 147, 249),
  gray:       rgb(98,  114, 164),
  powerline: {
    modelBg:       { r: 62,  g: 90,  b: 106 },
    dirBg:         { r: 68,  g: 71,  b: 90  },
    branchCleanBg: { r: 126, g: 61,  b: 124 },
    branchDirtyBg: { r: 139, g: 50,  b: 50  },
    taskBg:        { r: 138, g: 108, b: 42  },
    versionBg:     { r: 58,  g: 61,  b: 74  },
    fg: WHITE,
  },
};
