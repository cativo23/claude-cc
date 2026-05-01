import type { ThemePalette, ThemeMetadata } from './types.js';
import { rgb, WHITE } from './util.js';

export const metadata: ThemeMetadata = {
  name: 'nord',
  mode: 'dark',
  source: 'https://www.nordtheme.com/docs/colors-and-palettes',
};

export const palette: ThemePalette = {
  cyan:       rgb(136, 192, 208),
  magenta:    rgb(180, 142, 173),
  yellow:     rgb(235, 203, 139),
  green:      rgb(163, 190, 140),
  orange:     rgb(208, 135, 112),
  red:        rgb(191, 97,  106),
  brightBlue: rgb(129, 161, 193),
  gray:       rgb(76,  86,  106),
  powerline: {
    modelBg:       { r: 84,  g: 113, b: 137 },  // darkened from (94,127,150) for WCAG AA against white fg
    dirBg:         { r: 76,  g: 86,  b: 106 },
    branchCleanBg: { r: 109, g: 90,  b: 130 },
    branchDirtyBg: { r: 142, g: 72,  b: 80  },
    taskBg:        { r: 160, g: 101, b: 58  },
    versionBg:     { r: 59,  g: 66,  b: 82  },
    fg: WHITE,
  },
};
