import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import {
  DEFAULT_CONFIG,
  DEFAULT_DISPLAY,
  DEFAULT_CONTEXT_WARNING_THRESHOLD,
  DEFAULT_CONTEXT_CRITICAL_THRESHOLD,
  POWERLINE_STYLE_NAMES,
  CUSTOM_COMMAND_MAX_TIMEOUT_MS,
  CUSTOM_COMMAND_MAX_BYTES,
  CUSTOM_COMMAND_MAX_ENV_ENTRIES,
  CUSTOM_COMMAND_MIN_REFRESH_MS,
  CUSTOM_COMMAND_MAX_REFRESH_MS,
  CUSTOM_COMMAND_VALID_LINES,
  CUSTOM_COMMAND_ERROR_BEHAVIORS,
  CUSTOM_COMMAND_COLORS,
  CUSTOM_COMMAND_MAX_LABEL_LEN,
  CUSTOM_COMMAND_MAX_VALUE_TIERS,
  CUSTOM_COMMAND_MAX_ICON_LEN,
  CUSTOM_COMMAND_MAX_DESCRIPTION_LEN,
  type HudConfig,
  type DisplayToggles,
  type ColorConfig,
  type CustomCommand,
  type CustomCommandsConfig,
  type CustomCommandValueTier,
  type OnErrorBehavior,
} from './types.js';
import { stripAnsi } from './render/colors.js';
import { toSingleLine } from './utils/format.js';

/**
 * Ids we refuse to accept on user-supplied custom commands. Object.prototype
 * lookalikes prevent prototype-pollution-style attacks via the cache map
 * (cache entries are keyed by id; if an attacker can name an entry
 * `__proto__` or `constructor`, lookups against arbitrary objects later in
 * the pipeline could become surprising).
 */
const RESERVED_ID_NAMES = new Set([
  '__proto__',
  'prototype',
  'constructor',
  'hasOwnProperty',
  'toString',
  'valueOf',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
]);

/**
 * Reject ids containing path separators or ASCII control characters. Slash
 * and backslash would break cache-map lookups by id (entries are keyed under
 * a single object; nesting via paths is not supported). Control chars in id
 * could corrupt log output / status lines downstream.
 */
// eslint-disable-next-line no-control-regex
const DANGEROUS_ID_CHARS = /[\x00-\x1f/\\]/;

function isValidCustomCommandId(id: string): boolean {
  if (id.length === 0 || id.length > 64) return false;
  if (RESERVED_ID_NAMES.has(id)) return false;
  if (DANGEROUS_ID_CHARS.test(id)) return false;
  return true;
}

// Module-level flag: fires the qwen→minimal deprecation warning once per
// Node process. Process-scoped by design — tests must run in forked workers
// (see vitest.config.ts `pool: 'forks'`). Issue #20.
let qwenWarningShown = false;
let thresholdWarningShown = false;
let refreshIntervalWarningShown = false;
/** Test-only — resets the process-scoped qwenWarningShown flag. Do not call in production. */
export function _resetMigrationFlags(): void {
  qwenWarningShown = false;
  thresholdWarningShown = false;
  refreshIntervalWarningShown = false;
}

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

const clampInt = (n: number, min: number, max: number): number => {
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
};

/**
 * `customWidgets` is the name documented from here on (custom widgets —
 * value→icon/color tiers, description, etc.); `customCommands` is the
 * original name and stays a permanent, silent alias — README commits to
 * "config schema stable since v1.0, additive changes only", so nobody's
 * existing config.json can be allowed to stop working over a rename.
 *
 * Precedence: if `customWidgets` is present and is itself an object (not
 * null/array/string/number — a malformed value there is treated as absent,
 * not as "user meant this"), it wins ENTIRELY — no merge with
 * `customCommands`, even if both are populated and even if `customWidgets`
 * is `{}`. A partial merge would let a stale `customCommands` block the
 * user forgot to delete resurrect widgets they believe they removed by
 * migrating to the new key.
 */
export function resolveWidgetsKey(raw: Record<string, unknown>): 'customWidgets' | 'customCommands' {
  const cw = raw.customWidgets;
  const isObject = cw !== null && typeof cw === 'object' && !Array.isArray(cw);
  return isObject ? 'customWidgets' : 'customCommands';
}

/**
 * Parse and validate a `valueMap` block (custom widgets — value→icon/color
 * tiers). Same doctrine as the rest of this file: drop invalid elements
 * silently rather than reject the whole widget, clamp/sanitize what can be
 * salvaged. Returns undefined (field omitted) when nothing valid survives —
 * callers treat that identically to "no valueMap" configured.
 *
 * The one non-obvious step: tiers are ALWAYS sorted ascending by `lt`, with
 * the catch-all (no `lt`) forced last, regardless of the order the user
 * wrote them in. This is what makes render-time matching (matchValueTier in
 * value-map.ts) a simple linear scan instead of needing its own validation —
 * and it's what prevents a widget pasted from someone else's config with
 * tiers in the "wrong" order from silently matching the wrong tier.
 */
function parseValueMap(raw: unknown): CustomCommandValueTier[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  const tiers: CustomCommandValueTier[] = [];
  let sawCatchAll = false;
  const seenLt = new Set<number>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;

    let lt: number | undefined;
    if (e.lt !== undefined) {
      if (typeof e.lt !== 'number' || !Number.isFinite(e.lt)) continue; // drop the whole element
      if (seenLt.has(e.lt)) continue; // first VALID occurrence of a duplicate lt wins — seenLt is only
      // marked below, after the icon/color no-op check, so a discarded no-op tier doesn't reserve the lt
      lt = e.lt;
    } else {
      if (sawCatchAll) continue; // first catch-all wins
    }

    const tier: CustomCommandValueTier = {};
    if (lt !== undefined) tier.lt = lt;

    if (typeof e.icon === 'string') {
      const sanitized = toSingleLine(stripAnsi(e.icon)).slice(0, CUSTOM_COMMAND_MAX_ICON_LEN);
      if (sanitized.length > 0) tier.icon = sanitized;
    }
    if (typeof e.color === 'string' && (CUSTOM_COMMAND_COLORS as readonly string[]).includes(e.color)) {
      tier.color = e.color as CustomCommandValueTier['color'];
    }

    // A tier with neither icon nor color is a no-op — dropping it here means
    // downstream code never has to special-case "matched but nothing to show".
    if (tier.icon === undefined && tier.color === undefined) continue;

    if (lt !== undefined) seenLt.add(lt);
    else sawCatchAll = true;
    tiers.push(tier);
  }

  if (tiers.length === 0) return undefined;

  // Sort ascending by lt; the catch-all (no lt) always sorts last regardless
  // of input position. Array.prototype.sort is stable (ES2019+), so ties —
  // there are none here since duplicate lt is already deduped above — would
  // preserve input order anyway.
  tiers.sort((a, b) => {
    if (a.lt === undefined) return 1;
    if (b.lt === undefined) return -1;
    return a.lt - b.lt;
  });

  if (tiers.length <= CUSTOM_COMMAND_MAX_VALUE_TIERS) return tiers;

  // The catch-all always sorts last, so a plain slice(0, N) here would
  // silently drop it whenever there are >= N bounded tiers — the widget
  // would then render bare text for any value above the highest `lt`, with
  // no diagnostic (parseValueMap never warns to stderr). Reserve it a
  // guaranteed slot instead: keep the N-1 smallest bounded tiers, plus the
  // catch-all if one exists.
  const hasCatchAll = tiers[tiers.length - 1]?.lt === undefined;
  if (!hasCatchAll) return tiers.slice(0, CUSTOM_COMMAND_MAX_VALUE_TIERS);
  return [...tiers.slice(0, CUSTOM_COMMAND_MAX_VALUE_TIERS - 1), tiers[tiers.length - 1]!];
}

/**
 * Parse and validate the `customCommands` config block (issue #143).
 * Drops invalid commands silently, clamps numerics to documented bounds,
 * defaults missing optional fields, and preserves first-occurrence on
 * duplicate `id`. Always returns a fresh object (no shared references).
 */
function parseCustomCommands(raw: unknown): CustomCommandsConfig {
  const empty: CustomCommandsConfig = { enabled: false, commands: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const obj = raw as Record<string, unknown>;
  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : false;
  if (!Array.isArray(obj.commands)) return { enabled, commands: [] };

  const seenIds = new Set<string>();
  const commands: CustomCommand[] = [];

  for (const entry of obj.commands) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;

    // id — non-empty string, unique, no path separators / control chars /
    // reserved Object.prototype names. Caps length at 64 to prevent absurd
    // ids from blowing up log lines or cache files.
    if (typeof e.id !== 'string' || !isValidCustomCommandId(e.id)) continue;
    if (seenIds.has(e.id)) continue;

    // command — non-empty array of non-empty strings (no shell-string form)
    if (!Array.isArray(e.command) || e.command.length === 0) continue;
    if (!e.command.every((s: unknown) => typeof s === 'string' && s.length > 0)) continue;

    // line — must be one of {1,2,3,4}
    if (typeof e.line !== 'number' || !CUSTOM_COMMAND_VALID_LINES.includes(e.line as 1 | 2 | 3 | 4)) continue;

    // From here on the entry is valid; default optional fields.
    const refreshMs = typeof e.refreshMs === 'number' && Number.isFinite(e.refreshMs)
      ? clampInt(e.refreshMs, CUSTOM_COMMAND_MIN_REFRESH_MS, CUSTOM_COMMAND_MAX_REFRESH_MS)
      : 5000;
    const timeoutMs = typeof e.timeoutMs === 'number' && Number.isFinite(e.timeoutMs)
      ? clampInt(e.timeoutMs, 100, CUSTOM_COMMAND_MAX_TIMEOUT_MS)
      : 1500;
    const maxBytes = typeof e.maxBytes === 'number' && Number.isFinite(e.maxBytes)
      ? clampInt(e.maxBytes, 16, CUSTOM_COMMAND_MAX_BYTES)
      : 256;

    // Cast AFTER the membership guard, not before — casting unknown→typed
    // up front inverts the type-narrowing the guard exists to provide.
    const rawOnError = e.onError;
    const onError: OnErrorBehavior =
      typeof rawOnError === 'string' && (CUSTOM_COMMAND_ERROR_BEHAVIORS as readonly string[]).includes(rawOnError)
        ? (rawOnError as OnErrorBehavior)
        : 'hide';
    const rawOnTimeout = e.onTimeout;
    const onTimeout: OnErrorBehavior =
      typeof rawOnTimeout === 'string' && (CUSTOM_COMMAND_ERROR_BEHAVIORS as readonly string[]).includes(rawOnTimeout)
        ? (rawOnTimeout as OnErrorBehavior)
        : 'stale';
    const ansi = typeof e.ansi === 'boolean' ? e.ansi : false;

    const cmd: CustomCommand = {
      id: e.id,
      command: e.command.slice() as string[],
      line: e.line as 1 | 2 | 3 | 4,
      refreshMs,
      timeoutMs,
      maxBytes,
      onError,
      onTimeout,
      ansi,
    };

    // label — sanitized the same way command output is (stripAnsi + toSingleLine):
    // a raw \n or embedded ANSI escape here would break the statusline exactly
    // like unsanitized stdout does. Capped short since it's meant to be a
    // one-glyph/one-word prefix, not a second segment of content.
    if (typeof e.label === 'string') {
      const sanitizedLabel = toSingleLine(stripAnsi(e.label)).slice(0, CUSTOM_COMMAND_MAX_LABEL_LEN);
      if (sanitizedLabel.length > 0) cmd.label = sanitizedLabel;
    }
    // cwd — must be an absolute path. Relative paths like '../../../etc'
    // would silently escape the renderer's cwd; drop them to fall back to
    // process.cwd() instead of accepting hostile relative input.
    if (typeof e.cwd === 'string' && isAbsolute(e.cwd)) cmd.cwd = e.cwd;
    if (typeof e.color === 'string' && (CUSTOM_COMMAND_COLORS as readonly string[]).includes(e.color)) {
      cmd.color = e.color as CustomCommand['color'];
    }

    // description — never rendered, exists purely so a widget pasted from
    // someone else's config.json explains itself (`lumira widget list`).
    if (typeof e.description === 'string') {
      const sanitizedDescription = toSingleLine(stripAnsi(e.description)).slice(0, CUSTOM_COMMAND_MAX_DESCRIPTION_LEN);
      if (sanitizedDescription.length > 0) cmd.description = sanitizedDescription;
    }

    // valueMap — see parseValueMap for the full validation contract.
    const valueMap = parseValueMap(e.valueMap);
    if (valueMap) cmd.valueMap = valueMap;

    // env — record of string→string, truncated to CUSTOM_COMMAND_MAX_ENV_ENTRIES
    if (e.env && typeof e.env === 'object' && !Array.isArray(e.env)) {
      const envOut: Record<string, string> = {};
      let count = 0;
      for (const [k, v] of Object.entries(e.env)) {
        if (count >= CUSTOM_COMMAND_MAX_ENV_ENTRIES) break;
        if (typeof k !== 'string' || k.length === 0) continue;
        if (typeof v !== 'string') continue;
        envOut[k] = v;
        count++;
      }
      if (count > 0) cmd.env = envOut;
    }

    seenIds.add(cmd.id);
    commands.push(cmd);
  }

  return { enabled, commands };
}

/**
 * Validate context-bar threshold pair. Clamps each to [0, 100]. If `warning`
 * is not strictly less than `critical` after clamping, emits a one-shot warn
 * to stderr and returns the defaults (70/85). Falls back to defaults if a
 * value is missing or non-finite.
 */
function resolveThresholds(
  rawWarn: unknown,
  rawCrit: unknown,
): { warning: number; critical: number } {
  const hasWarn = typeof rawWarn === 'number' && Number.isFinite(rawWarn);
  const hasCrit = typeof rawCrit === 'number' && Number.isFinite(rawCrit);
  if (!hasWarn && !hasCrit) {
    return { warning: DEFAULT_CONTEXT_WARNING_THRESHOLD, critical: DEFAULT_CONTEXT_CRITICAL_THRESHOLD };
  }
  const warning = hasWarn ? clampPct(rawWarn as number) : DEFAULT_CONTEXT_WARNING_THRESHOLD;
  const critical = hasCrit ? clampPct(rawCrit as number) : DEFAULT_CONTEXT_CRITICAL_THRESHOLD;
  if (warning >= critical) {
    if (!thresholdWarningShown) {
      process.stderr.write(
        `[lumira] context thresholds invalid (warning=${warning}, critical=${critical}); ` +
        `falling back to defaults (${DEFAULT_CONTEXT_WARNING_THRESHOLD}/${DEFAULT_CONTEXT_CRITICAL_THRESHOLD})\n`,
      );
      thresholdWarningShown = true;
    }
    return { warning: DEFAULT_CONTEXT_WARNING_THRESHOLD, critical: DEFAULT_CONTEXT_CRITICAL_THRESHOLD };
  }
  return { warning, critical };
}

export function loadConfig(configDir: string = join(homedir(), '.config', 'lumira')): HudConfig {
  const p = join(configDir, 'config.json');
  if (!existsSync(p)) return { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY }, customCommands: { enabled: false, commands: [] } };
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY }, customCommands: { enabled: false, commands: [] } };
    return mergeConfig(raw);
  } catch { return { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY }, customCommands: { enabled: false, commands: [] } }; }
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
  const line1Align = (['justified', 'packed'] as const).includes(raw.line1Align as never) ? raw.line1Align as HudConfig['line1Align'] : DEFAULT_CONFIG.line1Align;
  const colors: ColorConfig = { ...DEFAULT_CONFIG.colors };
  if (raw.colors && typeof raw.colors === 'object') {
    const m = (raw.colors as Record<string, unknown>).mode;
    if (['auto', 'named', '256', 'truecolor'].includes(m as string)) colors.mode = m as ColorConfig['mode'];
  }
  const result: HudConfig = {
    layout,
    line1Align,
    gsd: typeof raw.gsd === 'boolean' ? raw.gsd : DEFAULT_CONFIG.gsd,
    display: { ...DEFAULT_DISPLAY },
    colors,
    customCommands: parseCustomCommands(raw[resolveWidgetsKey(raw)]),
  };

  // Apply preset FIRST (sets layout + display defaults)
  const validPresets = ['full', 'balanced', 'minimal'] as const;
  if (validPresets.includes(raw.preset as never)) applyPreset(result, raw.preset as NonNullable<HudConfig['preset']>);

  // Then overlay user's explicit display toggles (user wins over preset)
  if (raw.display && typeof raw.display === 'object') {
    const rawDisplay = raw.display as Record<string, unknown>;
    for (const k of Object.keys(DEFAULT_DISPLAY) as (keyof DisplayToggles)[]) {
      if (typeof rawDisplay[k] === 'boolean') (result.display[k] as boolean) = rawDisplay[k] as boolean;
    }
    const { warning, critical } = resolveThresholds(rawDisplay.contextWarningThreshold, rawDisplay.contextCriticalThreshold);
    result.display.contextWarningThreshold = warning;
    result.display.contextCriticalThreshold = critical;
  }

  if (typeof raw.theme === 'string' && raw.theme.length > 0) result.theme = raw.theme;
  const validIcons = ['nerd', 'emoji', 'none'] as const;
  if (validIcons.includes(raw.icons as never)) result.icons = raw.icons as HudConfig['icons'];
  if (raw.style === 'classic' || raw.style === 'powerline') result.style = raw.style;
  if (raw.powerline && typeof raw.powerline === 'object') {
    const plRaw = raw.powerline as Record<string, unknown>;
    if (POWERLINE_STYLE_NAMES.includes(plRaw.style as never)) {
      result.powerline = { style: plRaw.style as NonNullable<HudConfig['powerline']>['style'] };
    }
  }
  // refreshInterval — CC's documented minimum is 1 (seconds); clamp up rather
  // than reject so a typo'd 0/negative value degrades to "refresh every
  // second" instead of silently doing nothing.
  if (raw.refreshInterval !== undefined) {
    if (typeof raw.refreshInterval === 'number' && Number.isFinite(raw.refreshInterval)) {
      result.refreshInterval = Math.max(1, Math.trunc(raw.refreshInterval));
    } else if (!refreshIntervalWarningShown) {
      process.stderr.write(
        `[lumira] refreshInterval must be a number (got ${JSON.stringify(raw.refreshInterval)}); ignoring\n`,
      );
      refreshIntervalWarningShown = true;
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
    display: { agents: true }, // all defaults (everything on)
  },
  balanced: {
    layout: 'auto',
    display: {
      agents: true,
      pr: true,
      repo: true,
      thinking: true,
      fastMode: true,
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
      apiLatency: true,
    },
  },
  minimal: {
    layout: 'singleline',
    display: {
      agents: false,
      tokens: false,
      burnRate: false,
      duration: false,
      tokenSpeed: false,
      rateLimits: false,
      paceDelta: false,
      quotaProjection: false,
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
      // apiLatency is renderered only by line2/powerline-line2 — set false here
      // to match the established convention for widgets renderMinimal does not
      // surface (see burnRate/rateLimits/paceDelta etc. above). Default
      // remains true; users on full/balanced see the widget out of the box.
      apiLatency: false,
      addedDirs: false,
      worktreeBreadcrumb: false,
      compactionCount: false,
      pr: false,
      repo: false,
      thinking: false,
      fastMode: false,
    },
  },
};

export function applyPreset(r: HudConfig, preset: NonNullable<HudConfig['preset']>): void {
  const def = PRESET_DEFS[preset];
  r.preset = preset;
  r.layout = def.layout;
  // PRESET_DEFS only set boolean toggles — threshold numbers are not
  // overridable via preset. The runtime guard keeps the cast narrow and
  // catches accidental non-boolean entries in PRESET_DEFS.
  for (const [k, v] of Object.entries(def.display)) {
    if (typeof v === 'boolean') (r.display as unknown as Record<string, boolean>)[k] = v;
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
    const presetMatch = arg.match(/^--preset=(full|balanced|minimal)$/);
    if (presetMatch) { applyPreset(r, presetMatch[1] as NonNullable<HudConfig['preset']>); continue; }
    const iconsMatch = arg.match(/^--icons=(nerd|emoji|none)$/);
    if (iconsMatch) { r.icons = iconsMatch[1] as HudConfig['icons']; continue; }
    // Build the alternation from POWERLINE_STYLE_NAMES so this regex stays
    // in sync when a new style is added — single source of truth in types.ts.
    // Escape regex metacharacters defensively in case a future style name
    // ever contains one (today they're all `[a-z]+`, but the safety is free).
    const escaped = POWERLINE_STYLE_NAMES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const plStyleMatch = arg.match(new RegExp(`^--powerline-style=(${escaped.join('|')})$`));
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
