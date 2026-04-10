import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { DEFAULT_CONFIG, DEFAULT_DISPLAY, type HudConfig, type DisplayToggles, type ColorConfig } from './types.js';

export function loadConfig(configDir: string = join(homedir(), '.config', 'lumira')): HudConfig {
  const p = join(configDir, 'config.json');
  if (!existsSync(p)) return { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    return mergeConfig(raw);
  } catch { return { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } }; }
}

function mergeConfig(raw: Record<string, unknown>): HudConfig {
  const layout = (['full', 'minimal', 'auto'] as const).includes(raw.layout as never) ? raw.layout as HudConfig['layout'] : DEFAULT_CONFIG.layout;
  const display = { ...DEFAULT_DISPLAY };
  if (raw.display && typeof raw.display === 'object') {
    for (const k of Object.keys(DEFAULT_DISPLAY) as (keyof DisplayToggles)[]) {
      if (typeof (raw.display as Record<string, unknown>)[k] === 'boolean') display[k] = (raw.display as Record<string, boolean>)[k];
    }
  }
  const colors: ColorConfig = { ...DEFAULT_CONFIG.colors };
  if (raw.colors && typeof raw.colors === 'object') {
    const m = (raw.colors as Record<string, unknown>).mode;
    if (['auto', 'named', '256', 'truecolor'].includes(m as string)) colors.mode = m as ColorConfig['mode'];
  }
  const result: HudConfig = { layout, gsd: typeof raw.gsd === 'boolean' ? raw.gsd : DEFAULT_CONFIG.gsd, display, colors };
  const validPresets = ['full', 'balanced', 'minimal'] as const;
  if (validPresets.includes(raw.preset as never)) applyPreset(result, raw.preset as NonNullable<HudConfig['preset']>);
  if (typeof raw.theme === 'string' && raw.theme.length > 0) result.theme = raw.theme;
  const validIcons = ['nerd', 'emoji', 'none'] as const;
  if (validIcons.includes(raw.icons as never)) result.icons = raw.icons as HudConfig['icons'];
  return result;
}

const PRESET_TO_LAYOUT: Record<string, HudConfig['layout']> = {
  full: 'full',
  balanced: 'auto',
  minimal: 'minimal',
};

function applyPreset(r: HudConfig, preset: NonNullable<HudConfig['preset']>): void {
  r.preset = preset;
  r.layout = PRESET_TO_LAYOUT[preset];
}

export function mergeCliFlags(config: HudConfig, argv: string[]): HudConfig {
  const r = { ...config, display: { ...config.display }, colors: { ...config.colors } };
  if (argv.includes('--gsd')) r.gsd = true;
  // Shorthand flags
  if (argv.includes('--minimal')) applyPreset(r, 'minimal');
  if (argv.includes('--balanced')) applyPreset(r, 'balanced');
  if (argv.includes('--full')) applyPreset(r, 'full');
  for (const arg of argv) {
    const presetMatch = arg.match(/^--preset[= ]?(full|balanced|minimal)$/);
    if (presetMatch) { applyPreset(r, presetMatch[1] as NonNullable<HudConfig['preset']>); continue; }
    const iconsMatch = arg.match(/^--icons[= ]?(nerd|emoji|none)$/);
    if (iconsMatch) { r.icons = iconsMatch[1] as HudConfig['icons']; continue; }
  }
  return r;
}
