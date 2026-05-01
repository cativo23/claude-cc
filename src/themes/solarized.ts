import type { ThemePalette, ThemeMetadata } from './types.js';
import { rgb, WHITE } from './util.js';

export const metadata: ThemeMetadata = {
  name: 'solarized',
  mode: 'dark',
  source: 'https://ethanschoonover.com/solarized/',
};

export const palette: ThemePalette = {
  cyan:       rgb(42,  161, 152),
  magenta:    rgb(211, 54,  130),
  yellow:     rgb(181, 137, 0),
  green:      rgb(133, 153, 0),
  orange:     rgb(203, 75,  22),
  red:        rgb(220, 50,  47),
  brightBlue: rgb(38,  139, 210),
  gray:       rgb(101, 123, 131),
  powerline: {
    modelBg:       { r: 31,  g: 109, b: 103 },
    dirBg:         { r: 30,  g: 88,  b: 126 },
    branchCleanBg: { r: 141, g: 40,  b: 87  },
    branchDirtyBg: { r: 168, g: 32,  b: 31  },
    taskBg:        { r: 138, g: 79,  b: 17  },
    versionBg:     { r: 7,   g: 54,  b: 66  },
    fg: WHITE,
  },
};
