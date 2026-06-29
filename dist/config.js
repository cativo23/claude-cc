import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { DEFAULT_CONFIG, DEFAULT_DISPLAY, DEFAULT_CONTEXT_WARNING_THRESHOLD, DEFAULT_CONTEXT_CRITICAL_THRESHOLD, POWERLINE_STYLE_NAMES, CUSTOM_COMMAND_MAX_TIMEOUT_MS, CUSTOM_COMMAND_MAX_BYTES, CUSTOM_COMMAND_MAX_ENV_ENTRIES, CUSTOM_COMMAND_MIN_REFRESH_MS, CUSTOM_COMMAND_MAX_REFRESH_MS, CUSTOM_COMMAND_VALID_LINES, CUSTOM_COMMAND_ERROR_BEHAVIORS, CUSTOM_COMMAND_COLORS, } from './types.js';
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
function isValidCustomCommandId(id) {
    if (id.length === 0 || id.length > 64)
        return false;
    if (RESERVED_ID_NAMES.has(id))
        return false;
    if (DANGEROUS_ID_CHARS.test(id))
        return false;
    return true;
}
// Module-level flag: fires the qwen→minimal deprecation warning once per
// Node process. Process-scoped by design — tests must run in forked workers
// (see vitest.config.ts `pool: 'forks'`). Issue #20.
let qwenWarningShown = false;
let thresholdWarningShown = false;
/** Test-only — resets the process-scoped qwenWarningShown flag. Do not call in production. */
export function _resetMigrationFlags() { qwenWarningShown = false; thresholdWarningShown = false; }
const clampPct = (n) => Math.max(0, Math.min(100, n));
const clampInt = (n, min, max) => {
    const i = Math.trunc(n);
    return Math.max(min, Math.min(max, i));
};
/**
 * Parse and validate the `customCommands` config block (issue #143).
 * Drops invalid commands silently, clamps numerics to documented bounds,
 * defaults missing optional fields, and preserves first-occurrence on
 * duplicate `id`. Always returns a fresh object (no shared references).
 */
function parseCustomCommands(raw) {
    const empty = { enabled: false, commands: [] };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return empty;
    const obj = raw;
    const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : false;
    if (!Array.isArray(obj.commands))
        return { enabled, commands: [] };
    const seenIds = new Set();
    const commands = [];
    for (const entry of obj.commands) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            continue;
        const e = entry;
        // id — non-empty string, unique, no path separators / control chars /
        // reserved Object.prototype names. Caps length at 64 to prevent absurd
        // ids from blowing up log lines or cache files.
        if (typeof e.id !== 'string' || !isValidCustomCommandId(e.id))
            continue;
        if (seenIds.has(e.id))
            continue;
        // command — non-empty array of non-empty strings (no shell-string form)
        if (!Array.isArray(e.command) || e.command.length === 0)
            continue;
        if (!e.command.every((s) => typeof s === 'string' && s.length > 0))
            continue;
        // line — must be one of {1,2,3,4}
        if (typeof e.line !== 'number' || !CUSTOM_COMMAND_VALID_LINES.includes(e.line))
            continue;
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
        const onError = typeof rawOnError === 'string' && CUSTOM_COMMAND_ERROR_BEHAVIORS.includes(rawOnError)
            ? rawOnError
            : 'hide';
        const rawOnTimeout = e.onTimeout;
        const onTimeout = typeof rawOnTimeout === 'string' && CUSTOM_COMMAND_ERROR_BEHAVIORS.includes(rawOnTimeout)
            ? rawOnTimeout
            : 'stale';
        const ansi = typeof e.ansi === 'boolean' ? e.ansi : false;
        const cmd = {
            id: e.id,
            command: e.command.slice(),
            line: e.line,
            refreshMs,
            timeoutMs,
            maxBytes,
            onError,
            onTimeout,
            ansi,
        };
        if (typeof e.label === 'string')
            cmd.label = e.label;
        // cwd — must be an absolute path. Relative paths like '../../../etc'
        // would silently escape the renderer's cwd; drop them to fall back to
        // process.cwd() instead of accepting hostile relative input.
        if (typeof e.cwd === 'string' && isAbsolute(e.cwd))
            cmd.cwd = e.cwd;
        if (typeof e.color === 'string' && CUSTOM_COMMAND_COLORS.includes(e.color)) {
            cmd.color = e.color;
        }
        // env — record of string→string, truncated to CUSTOM_COMMAND_MAX_ENV_ENTRIES
        if (e.env && typeof e.env === 'object' && !Array.isArray(e.env)) {
            const envOut = {};
            let count = 0;
            for (const [k, v] of Object.entries(e.env)) {
                if (count >= CUSTOM_COMMAND_MAX_ENV_ENTRIES)
                    break;
                if (typeof k !== 'string' || k.length === 0)
                    continue;
                if (typeof v !== 'string')
                    continue;
                envOut[k] = v;
                count++;
            }
            if (count > 0)
                cmd.env = envOut;
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
function resolveThresholds(rawWarn, rawCrit) {
    const hasWarn = typeof rawWarn === 'number' && Number.isFinite(rawWarn);
    const hasCrit = typeof rawCrit === 'number' && Number.isFinite(rawCrit);
    if (!hasWarn && !hasCrit) {
        return { warning: DEFAULT_CONTEXT_WARNING_THRESHOLD, critical: DEFAULT_CONTEXT_CRITICAL_THRESHOLD };
    }
    const warning = hasWarn ? clampPct(rawWarn) : DEFAULT_CONTEXT_WARNING_THRESHOLD;
    const critical = hasCrit ? clampPct(rawCrit) : DEFAULT_CONTEXT_CRITICAL_THRESHOLD;
    if (warning >= critical) {
        if (!thresholdWarningShown) {
            process.stderr.write(`[lumira] context thresholds invalid (warning=${warning}, critical=${critical}); ` +
                `falling back to defaults (${DEFAULT_CONTEXT_WARNING_THRESHOLD}/${DEFAULT_CONTEXT_CRITICAL_THRESHOLD})\n`);
            thresholdWarningShown = true;
        }
        return { warning: DEFAULT_CONTEXT_WARNING_THRESHOLD, critical: DEFAULT_CONTEXT_CRITICAL_THRESHOLD };
    }
    return { warning, critical };
}
export function loadConfig(configDir = join(homedir(), '.config', 'lumira')) {
    const p = join(configDir, 'config.json');
    if (!existsSync(p))
        return { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY }, customCommands: { enabled: false, commands: [] } };
    try {
        const raw = JSON.parse(readFileSync(p, 'utf8'));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            return { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY }, customCommands: { enabled: false, commands: [] } };
        return mergeConfig(raw);
    }
    catch {
        return { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY }, customCommands: { enabled: false, commands: [] } };
    }
}
function mergeConfig(rawIn) {
    let raw = rawIn;
    if (raw.preset === 'qwen') {
        if (!qwenWarningShown) {
            process.stderr.write("[lumira] 'qwen' preset is removed — using 'minimal' instead\n");
            qwenWarningShown = true;
        }
        raw = { ...raw, preset: 'minimal' };
    }
    const layout = ['multiline', 'singleline', 'auto'].includes(raw.layout) ? raw.layout : DEFAULT_CONFIG.layout;
    const colors = { ...DEFAULT_CONFIG.colors };
    if (raw.colors && typeof raw.colors === 'object') {
        const m = raw.colors.mode;
        if (['auto', 'named', '256', 'truecolor'].includes(m))
            colors.mode = m;
    }
    const result = {
        layout,
        gsd: typeof raw.gsd === 'boolean' ? raw.gsd : DEFAULT_CONFIG.gsd,
        display: { ...DEFAULT_DISPLAY },
        colors,
        customCommands: parseCustomCommands(raw.customCommands),
    };
    // Apply preset FIRST (sets layout + display defaults)
    const validPresets = ['full', 'balanced', 'minimal'];
    if (validPresets.includes(raw.preset))
        applyPreset(result, raw.preset);
    // Then overlay user's explicit display toggles (user wins over preset)
    if (raw.display && typeof raw.display === 'object') {
        const rawDisplay = raw.display;
        for (const k of Object.keys(DEFAULT_DISPLAY)) {
            if (typeof rawDisplay[k] === 'boolean')
                result.display[k] = rawDisplay[k];
        }
        const { warning, critical } = resolveThresholds(rawDisplay.contextWarningThreshold, rawDisplay.contextCriticalThreshold);
        result.display.contextWarningThreshold = warning;
        result.display.contextCriticalThreshold = critical;
    }
    if (typeof raw.theme === 'string' && raw.theme.length > 0)
        result.theme = raw.theme;
    const validIcons = ['nerd', 'emoji', 'none'];
    if (validIcons.includes(raw.icons))
        result.icons = raw.icons;
    if (raw.style === 'classic' || raw.style === 'powerline')
        result.style = raw.style;
    if (raw.powerline && typeof raw.powerline === 'object') {
        const plRaw = raw.powerline;
        if (POWERLINE_STYLE_NAMES.includes(plRaw.style)) {
            result.powerline = { style: plRaw.style };
        }
    }
    return result;
}
const PRESET_DEFS = {
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
        },
    },
};
export function applyPreset(r, preset) {
    const def = PRESET_DEFS[preset];
    r.preset = preset;
    r.layout = def.layout;
    // PRESET_DEFS only set boolean toggles — threshold numbers are not
    // overridable via preset. The runtime guard keeps the cast narrow and
    // catches accidental non-boolean entries in PRESET_DEFS.
    for (const [k, v] of Object.entries(def.display)) {
        if (typeof v === 'boolean')
            r.display[k] = v;
    }
}
export function mergeCliFlags(config, argv) {
    const r = { ...config, display: { ...config.display }, colors: { ...config.colors } };
    if (argv.includes('--gsd'))
        r.gsd = true;
    // Shorthand flags
    if (argv.includes('--minimal'))
        applyPreset(r, 'minimal');
    if (argv.includes('--balanced'))
        applyPreset(r, 'balanced');
    if (argv.includes('--full'))
        applyPreset(r, 'full');
    if (argv.includes('--powerline'))
        r.style = 'powerline';
    if (argv.includes('--classic'))
        r.style = 'classic';
    for (const arg of argv) {
        const presetMatch = arg.match(/^--preset=(full|balanced|minimal)$/);
        if (presetMatch) {
            applyPreset(r, presetMatch[1]);
            continue;
        }
        const iconsMatch = arg.match(/^--icons=(nerd|emoji|none)$/);
        if (iconsMatch) {
            r.icons = iconsMatch[1];
            continue;
        }
        // Build the alternation from POWERLINE_STYLE_NAMES so this regex stays
        // in sync when a new style is added — single source of truth in types.ts.
        // Escape regex metacharacters defensively in case a future style name
        // ever contains one (today they're all `[a-z]+`, but the safety is free).
        const escaped = POWERLINE_STYLE_NAMES.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const plStyleMatch = arg.match(new RegExp(`^--powerline-style=(${escaped.join('|')})$`));
        if (plStyleMatch) {
            r.style = 'powerline';
            r.powerline = { ...(r.powerline ?? {}), style: plStyleMatch[1] };
            continue;
        }
    }
    return r;
}
export function saveConfig(wizard, configPath) {
    mkdirSync(dirname(configPath), { recursive: true });
    let existing = {};
    if (existsSync(configPath)) {
        try {
            const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                existing = parsed;
            }
        }
        catch {
            existing = {};
        }
    }
    const merged = { ...existing, preset: wizard.preset, icons: wizard.icons };
    if (wizard.theme !== undefined)
        merged.theme = wizard.theme;
    else
        delete merged.theme;
    const tmp = configPath + '.tmp';
    writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
    renameSync(tmp, configPath);
}
//# sourceMappingURL=config.js.map