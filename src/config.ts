import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { DEFAULT_CONFIG, DEFAULT_DISPLAY, type HudConfig, type DisplayToggles, type ColorConfig } from './types.js';

export function loadConfig(configDir: string = join(homedir(), '.config', 'ccpulse')): HudConfig {
  const p = join(configDir, 'config.json');
  if (!existsSync(p)) return { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    return mergeConfig(raw);
  } catch { return { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } }; }
}

function mergeConfig(raw: Record<string, unknown>): HudConfig {
  const layout = (['custom', 'minimal', 'auto'] as const).includes(raw.layout as never) ? raw.layout as HudConfig['layout'] : DEFAULT_CONFIG.layout;
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
  return { layout, gsd: typeof raw.gsd === 'boolean' ? raw.gsd : DEFAULT_CONFIG.gsd, display, colors };
}

export function mergeCliFlags(config: HudConfig, argv: string[]): HudConfig {
  const r = { ...config, display: { ...config.display }, colors: { ...config.colors } };
  if (argv.includes('--minimal')) r.layout = 'minimal';
  if (argv.includes('--gsd')) r.gsd = true;
  return r;
}
