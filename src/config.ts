import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { DEFAULT_CONFIG, DEFAULT_DISPLAY, type HudConfig, type DisplayToggles, type ColorConfig } from './types.js';

// Module-level flag: fires the qwen→minimal deprecation warning once per
// Node process. Process-scoped by design — tests must run in forked workers
// (see vitest.config.ts `pool: 'forks'`). Issue #20.
let qwenWarningShown = false;
/** Test-only — resets the process-scoped qwenWarningShown flag. Do not call in production. */
export function _resetMigrationFlags(): void { qwenWarningShown = false; }

export function loadConfig(configDir: string = join(homedir(), '.config', 'lumira')): HudConfig {
  const p = join(configDir, 'config.json');
  if (!existsSync(p)) return { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    return mergeConfig(raw);
  } catch { return { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } }; }
}

function mergeConfig(rawIn: Record<string, unknown>): HudConfig {
  let raw = rawIn;
  if (raw.preset === 'qwen') {
    if (!qwenWarningShown) {
      process.stderr.write("[lumira] 'qwen' preset is removed — using 'minimal' instead\n");
      qwenWarningShown = true;
    }
    raw = { ...raw, preset: 'minimal' };
  }
  const layout = (['multiline', 'singleline', 'auto'] as const).includes(raw.layout as never) ? raw.layout as HudConfig['layout'] : DEFAULT_CONFIG.layout;
  const colors: ColorConfig = { ...DEFAULT_CONFIG.colors };
  if (raw.colors && typeof raw.colors === 'object') {
    const m = (raw.colors as Record<string, unknown>).mode;
    if (['auto', 'named', '256', 'truecolor'].includes(m as string)) colors.mode = m as ColorConfig['mode'];
  }
  const result: HudConfig = { layout, gsd: typeof raw.gsd === 'boolean' ? raw.gsd : DEFAULT_CONFIG.gsd, display: { ...DEFAULT_DISPLAY }, colors };

  // Apply preset FIRST (sets layout + display defaults)
  const validPresets = ['full', 'balanced', 'minimal'] as const;
  if (validPresets.includes(raw.preset as never)) applyPreset(result, raw.preset as NonNullable<HudConfig['preset']>);

  // Then overlay user's explicit display toggles (user wins over preset)
  if (raw.display && typeof raw.display === 'object') {
    for (const k of Object.keys(DEFAULT_DISPLAY) as (keyof DisplayToggles)[]) {
      if (typeof (raw.display as Record<string, unknown>)[k] === 'boolean') result.display[k] = (raw.display as Record<string, boolean>)[k];
    }
  }

  if (typeof raw.theme === 'string' && raw.theme.length > 0) result.theme = raw.theme;
  const validIcons = ['nerd', 'emoji', 'none'] as const;
  if (validIcons.includes(raw.icons as never)) result.icons = raw.icons as HudConfig['icons'];
  if (raw.style === 'classic' || raw.style === 'powerline') result.style = raw.style;
  if (raw.powerline && typeof raw.powerline === 'object') {
    const plRaw = raw.powerline as Record<string, unknown>;
    const validPlStyles = ['arrow', 'flame', 'slant', 'round', 'diamond', 'compatible', 'plain', 'auto'] as const;
    if (validPlStyles.includes(plRaw.style as never)) {
      result.powerline = { style: plRaw.style as NonNullable<HudConfig['powerline']>['style'] };
    }
  }
  return result;
}

// ── Preset definitions ─────────────────────────────────────────────
// Each preset defines a layout + display toggle overrides.
// Toggles not listed here stay at their current value.

interface PresetDef {
  layout: HudConfig['layout'];
  display: Partial<DisplayToggles>;
}

const PRESET_DEFS: Record<NonNullable<HudConfig['preset']>, PresetDef> = {
  full: {
    layout: 'multiline',
    display: {}, // all defaults (everything on)
  },
  balanced: {
    layout: 'auto',
    display: {
      burnRate: false,
      duration: false,
      tokenSpeed: false,
      linesChanged: false,
      sessionName: false,
      style: false,
      version: false,
      memory: false,
      contextTokens: false,
      cacheMetrics: false,
    },
  },
  minimal: {
    layout: 'singleline',
    display: {
      tokens: false,
      burnRate: false,
      duration: false,
      tokenSpeed: false,
      rateLimits: false,
      tools: false,
      todos: false,
      vim: false,
      effort: false,
      worktree: false,
      agent: false,
      sessionName: false,
      style: false,
      version: false,
      linesChanged: false,
      memory: false,
      contextTokens: false,
      cacheMetrics: false,
      mcp: false,
    },
  },
};

function applyPreset(r: HudConfig, preset: NonNullable<HudConfig['preset']>): void {
  const def = PRESET_DEFS[preset];
  r.preset = preset;
  r.layout = def.layout;
  for (const [k, v] of Object.entries(def.display)) {
    r.display[k as keyof DisplayToggles] = v as boolean;
  }
}

export function mergeCliFlags(config: HudConfig, argv: string[]): HudConfig {
  const r = { ...config, display: { ...config.display }, colors: { ...config.colors } };
  if (argv.includes('--gsd')) r.gsd = true;
  // Shorthand flags
  if (argv.includes('--minimal')) applyPreset(r, 'minimal');
  if (argv.includes('--balanced')) applyPreset(r, 'balanced');
  if (argv.includes('--full')) applyPreset(r, 'full');
  if (argv.includes('--powerline')) r.style = 'powerline';
  if (argv.includes('--classic'))   r.style = 'classic';
  for (const arg of argv) {
    const presetMatch = arg.match(/^--preset[= ]?(full|balanced|minimal)$/);
    if (presetMatch) { applyPreset(r, presetMatch[1] as NonNullable<HudConfig['preset']>); continue; }
    const iconsMatch = arg.match(/^--icons[= ]?(nerd|emoji|none)$/);
    if (iconsMatch) { r.icons = iconsMatch[1] as HudConfig['icons']; continue; }
    const plStyleMatch = arg.match(/^--powerline-style[= ](arrow|flame|slant|round|diamond|compatible|plain|auto)$/);
    if (plStyleMatch) {
      r.style = 'powerline';
      r.powerline = { ...(r.powerline ?? {}), style: plStyleMatch[1] as NonNullable<HudConfig['powerline']>['style'] };
      continue;
    }
  }
  return r;
}

export interface WizardResult {
  preset: 'full' | 'balanced' | 'minimal';
  theme?: string;
  icons: 'nerd' | 'emoji' | 'none';
}

export function saveConfig(wizard: WizardResult, configPath: string): void {
  mkdirSync(dirname(configPath), { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      existing = {};
    }
  }

  const merged: Record<string, unknown> = { ...existing, preset: wizard.preset, icons: wizard.icons };
  if (wizard.theme !== undefined) merged.theme = wizard.theme;
  else delete merged.theme;

  const tmp = configPath + '.tmp';
  writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, configPath);
}
