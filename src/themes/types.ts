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
  /** Optional per-theme powerline palette; derived from fg colors when absent. */
  powerline?: PowerlinePalette;
}

export interface PowerlinePalette {
  modelBg: RGB;
  dirBg: RGB;
  branchCleanBg: RGB;
  branchDirtyBg: RGB;
  taskBg: RGB;
  versionBg: RGB;
  fg: RGB;
}

export interface RGB { r: number; g: number; b: number; }

/**
 * Theme metadata exposed on each per-theme module's named export. Not part of
 * the runtime ThemePalette; surfaced separately for validators, docs, and the
 * `lumira themes list` command.
 */
export interface ThemeMetadata {
  /** Slug used as registry key and CLI argument. Lowercase, kebab-case. */
  name: string;
  /** Light vs dark — informational only, doesn't affect rendering. */
  mode: 'dark' | 'light';
  /** Upstream source for brand colors (license check / attribution). */
  source: string;
}
