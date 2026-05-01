/**
 * Public surface for the theme system. Re-exports types, utility helpers,
 * and assembles the THEMES registry from per-theme modules. New themes are
 * added by creating a new module here (see CONTRIBUTING.md → "Adding a theme")
 * and registering it in the import block below.
 */
import type { ColorMode } from '../render/colors.js';
import type { ThemePalette, ThemeMetadata } from './types.js';
import { downgradePaletteTo256 } from './util.js';

import * as dracula from './dracula.js';
import * as nord from './nord.js';
import * as tokyoNight from './tokyo-night.js';
import * as catppuccin from './catppuccin.js';
import * as monokai from './monokai.js';
import * as gruvbox from './gruvbox.js';
import * as solarized from './solarized.js';

export type { ThemePalette, PowerlinePalette, RGB, ThemeMetadata } from './types.js';
export {
  rgb,
  parseRgb,
  rgbTo256Index,
  downgradePaletteTo256,
  derivePowerlinePalette,
  DEFAULT_POWERLINE_PALETTE,
} from './util.js';

const REGISTRY: ReadonlyArray<{ metadata: ThemeMetadata; palette: ThemePalette }> = [
  dracula,
  nord,
  tokyoNight,
  catppuccin,
  monokai,
  gruvbox,
  solarized,
];

/**
 * Validate registry shape at module load. Catches contributor-PR mistakes
 * before they pollute the THEMES map: every metadata.name must match
 * lowercase kebab-case and must be unique (resolveTheme lowercases lookups,
 * so "Dracula" + "dracula" both registering would shadow each other).
 *
 * Exported so the same check is unit-testable without booting the registry.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export function assertValidRegistry(registry: ReadonlyArray<{ metadata: ThemeMetadata }>): void {
  const seen = new Set<string>();
  for (const t of registry) {
    const name = t.metadata.name;
    if (!SLUG_RE.test(name)) {
      throw new Error(`Invalid theme metadata.name: "${name}". Must be lowercase kebab-case (^[a-z0-9][a-z0-9-]*$).`);
    }
    if (seen.has(name)) {
      throw new Error(`Duplicate theme name in REGISTRY: "${name}". Each theme module must declare a unique metadata.name.`);
    }
    seen.add(name);
  }
}
assertValidRegistry(REGISTRY);

export const THEMES: Record<string, ThemePalette> = Object.freeze(
  Object.fromEntries(REGISTRY.map(t => [t.metadata.name, t.palette]))
);

export const THEME_METADATA: Record<string, ThemeMetadata> = Object.freeze(
  Object.fromEntries(REGISTRY.map(t => [t.metadata.name, t.metadata]))
);

export function getThemeNames(): string[] {
  return Object.keys(THEMES);
}

export function resolveTheme(name: string | undefined, mode: ColorMode): ThemePalette | null {
  if (!name) return null;
  const key = name.toLowerCase();
  // hasOwn guard: a name like `__proto__` or `constructor` would otherwise
  // resolve to `Object.prototype` (truthy), bypass the `!base` check, then
  // crash later when render code reads `.cyan` etc. Reject anything not
  // explicitly in the THEMES map.
  if (!Object.prototype.hasOwnProperty.call(THEMES, key)) return null;
  const base = THEMES[key];
  if (mode === 'truecolor') return base;
  if (mode === '256') return downgradePaletteTo256(base);
  return null;
}
