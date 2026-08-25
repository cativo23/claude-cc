/**
 * `lumira widget` subcommand (issue #143 phase 4; renamed to "widget" branding
 * when value→icon/color tiers + description landed — see resolveWidgetsKey
 * in config.ts). `lumira custom` is a permanent, silent alias: invoking
 * either name runs the exact same code, only the printed name differs.
 *
 *   lumira widget list             List configured widgets from config file
 *   lumira widget enable           Set enabled:true in config file
 *   lumira widget disable          Set enabled:false in config file
 *   lumira widget test <id>        Run a widget once, print output + timing
 *   lumira widget logs             Show cached outputs from the cache file
 *
 * Design constraints:
 * - No runtime deps beyond Node built-ins.
 * - All FS reads in try/catch — graceful errors, exit 1 on failure.
 * - Color: process.stdout.isTTY ? 'named' : 'none'.
 * - Return type: Promise<{ output: string; exitCode: number }> so the
 *   dispatcher can set process.exitCode.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { execBg } from '../utils/exec-bg.js';
import { createColors, stripAnsi } from '../render/colors.js';
import { loadConfig, resolveWidgetsKey } from '../config.js';
import { parseWidgetValue, matchValueTier } from '../render/value-map.js';
import { toSingleLine } from '../utils/format.js';
import { readCacheFile } from '../utils/custom-cache.js';
// ── constants ──────────────────────────────────────────────────────────────
const CONFIG_FILE = 'config.json';
const CONFIG_DIR = join('.config', 'lumira');
const CACHE_FILE = 'custom-commands.json';
const CACHE_DIR = join('.cache', 'lumira');
// ── helpers ────────────────────────────────────────────────────────────────
function configPath() {
    return join(homedir(), CONFIG_DIR, CONFIG_FILE);
}
function cachePath() {
    return join(homedir(), CACHE_DIR, CACHE_FILE);
}
function ok(output) {
    return { output, exitCode: 0 };
}
function fail(output) {
    return { output, exitCode: 1 };
}
/**
 * Read the raw config JSON from disk. Returns an empty object `{}` if the
 * file doesn't exist, throws on malformed JSON so the caller can surface a
 * useful error.
 */
function readConfigRaw() {
    const p = configPath();
    if (!existsSync(p))
        return {};
    const raw = readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return {};
    return parsed;
}
/**
 * Write (or create) the config file. Creates the parent directory if needed.
 * The value is always pretty-printed with 2-space indents.
 */
function writeConfigRaw(value) {
    const p = configPath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
}
/**
 * Which key `enable`/`disable` should write to: whichever of
 * `customWidgets`/`customCommands` resolveWidgetsKey would already read from
 * (so editing an existing config never silently switches its key and orphans
 * the block the user is actually using), or `customWidgets` — the canonical
 * name going forward — when NEITHER key exists yet (a brand-new config).
 */
function widgetsWriteKey(raw) {
    if ('customWidgets' in raw || 'customCommands' in raw)
        return resolveWidgetsKey(raw);
    return 'customWidgets';
}
/**
 * Extract the widgets block (whichever key is authoritative for `raw`, per
 * widgetsWriteKey) from the raw config. Returns a minimal default when the
 * block is missing or malformed.
 */
function readWidgetsBlock(raw) {
    const key = widgetsWriteKey(raw);
    const block = raw[key];
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
        return { key, enabled: false, commands: [] };
    }
    const obj = block;
    const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : false;
    const commands = Array.isArray(obj.commands) ? obj.commands : [];
    return { key, enabled, commands };
}
// ── color ──────────────────────────────────────────────────────────────────
/**
 * Only use color when stdout is a real TTY and NO_COLOR is not set.
 * In pipe/test contexts or when NO_COLOR is in env, produces no escape
 * sequences, keeping output clean for programmatic use.
 */
function makeColors() {
    const noColor = 'NO_COLOR' in process.env || process.env.TERM === 'dumb';
    if (noColor || !process.stdout.isTTY)
        return null;
    return createColors('named');
}
// ── subcommands ────────────────────────────────────────────────────────────
async function cmdEnable(name) {
    try {
        const raw = readConfigRaw();
        const block = readWidgetsBlock(raw);
        const updated = {
            ...raw,
            [block.key]: { enabled: true, commands: block.commands },
        };
        writeConfigRaw(updated);
        return ok(`Custom widgets enabled.\nConfig written to: ${configPath()}\n`);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail(`lumira ${name} enable: ${msg}\n`);
    }
}
async function cmdDisable(name) {
    try {
        const raw = readConfigRaw();
        const block = readWidgetsBlock(raw);
        const updated = {
            ...raw,
            [block.key]: { enabled: false, commands: block.commands },
        };
        writeConfigRaw(updated);
        return ok(`Custom widgets disabled.\nConfig written to: ${configPath()}\n`);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail(`lumira ${name} disable: ${msg}\n`);
    }
}
async function cmdList(name) {
    const c = makeColors();
    let enabled = false;
    let commands = [];
    try {
        const cfg = loadConfig();
        enabled = cfg.customCommands.enabled;
        commands = cfg.customCommands.commands;
    }
    catch {
        // config unreadable — fall through with empty defaults
    }
    const statusLine = enabled
        ? `Custom widgets: ${c ? c.green('enabled') : 'enabled'}\n`
        : `Custom widgets: ${c ? c.yellow('disabled') : 'disabled'}\n`
            + `Run 'lumira ${name} enable' to turn it on.\n`;
    if (commands.length === 0) {
        return ok(statusLine
            + '\nNo custom widgets configured.\n'
            + `Add widgets to ${configPath()} under customWidgets.commands (or the legacy customCommands.commands — both work).\n`);
    }
    // Table: id | line | refresh | tiers | desc | cmd
    const header = `${'id'.padEnd(20)} ${'line'.padEnd(6)} ${'refresh'.padEnd(10)} ${'tiers'.padEnd(7)} ${'description'.padEnd(30)} cmd`;
    const sep = '-'.repeat(header.length);
    const rows = commands.map(cmd => {
        const id = cmd.id.padEnd(20);
        const line = String(cmd.line).padEnd(6);
        const refresh = `${cmd.refreshMs}ms`.padEnd(10);
        const tiers = (cmd.valueMap ? `${cmd.valueMap.length}` : '-').padEnd(7);
        const desc = (cmd.description ?? '').slice(0, 30).padEnd(30);
        const cmdStr = cmd.command.join(' ');
        return `${id} ${line} ${refresh} ${tiers} ${desc} ${cmdStr}`;
    });
    const table = [header, sep, ...rows].join('\n');
    return ok(`${statusLine}\n${table}\n`);
}
async function cmdTest(name, id) {
    if (!id) {
        return fail(`lumira ${name} test: missing command id.\n\n`
            + `Usage: lumira ${name} test <id>\n`
            + `Use 'lumira ${name} list' to see configured widget ids.\n`);
    }
    let commands;
    try {
        commands = loadConfig().customCommands.commands;
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return fail(`lumira ${name} test: could not read config: ${msg}\n`);
    }
    const cmd = commands.find(c => c.id === id);
    if (!cmd) {
        const knownIds = commands.map(c => c.id).join(', ');
        return fail(`lumira ${name} test: command id "${id}" not found.\n`
            + (knownIds ? `Known ids: ${knownIds}\n` : 'No commands configured.\n'));
    }
    // Pass env/cwd exactly like custom-refresh.ts does for the real background
    // run — omitting them here would let `widget test` print a different
    // value than the widget actually renders (e.g. a command reading $FOO or
    // relying on cwd), directly undermining this being the documented
    // diagnostic channel for "why doesn't my tier match".
    const result = await execBg({
        command: cmd.command,
        timeoutMs: cmd.timeoutMs,
        maxBytes: cmd.maxBytes,
        env: cmd.env,
        cwd: cmd.cwd,
    });
    const lines = [
        `Command: ${cmd.command.join(' ')}`,
        `Duration: ${result.durationMs}ms`,
    ];
    if (result.kind === 'ok') {
        lines.push(`Exit: 0 (ok)`);
        lines.push(`Output:\n${result.stdout || '(empty)'}`);
        // valueMap diagnostics — this is the intended debugging surface for
        // "why didn't my tier match", since config parsing never warns to
        // stderr on an invalid/non-matching valueMap (see parseValueMap).
        if (cmd.valueMap) {
            if (cmd.ansi) {
                // ansi:true bypasses valueMap at render time too (render/shared.ts)
                // — an ANSI-passthrough widget already owns its own colors. Say so
                // explicitly rather than silently printing nothing: the whole point
                // of this diagnostic is that it must never leave the user guessing
                // why a configured valueMap "doesn't do anything".
                lines.push('valueMap: ignored (ansi is true — an ANSI-passthrough widget owns its own colors)');
            }
            else {
                // Same sanitization the renderer applies before parsing (toSingleLine
                // then stripAnsi, see render/shared.ts) — parsing execBg's raw stdout
                // directly would report "not numeric" for output the renderer's tier
                // DOES match (e.g. colorized by the command itself, or with a
                // trailing newline).
                const sanitized = stripAnsi(toSingleLine(result.stdout));
                const parsedValue = parseWidgetValue(sanitized);
                if (parsedValue === null) {
                    lines.push(`Parsed value: not numeric (valueMap will not apply — static label/color used instead)`);
                }
                else {
                    const tier = matchValueTier(cmd.valueMap, parsedValue);
                    lines.push(`Parsed value: ${parsedValue}`);
                    lines.push(tier
                        ? `Matched tier: ${JSON.stringify(tier)}`
                        : 'Matched tier: none (value exceeds every "lt" and there is no catch-all tier — static label/color used instead)');
                }
            }
        }
    }
    else if (result.kind === 'nonzero') {
        lines.push(`Exit: ${result.exitCode} (nonzero)`);
        if (result.stdout)
            lines.push(`Stdout:\n${result.stdout}`);
        if (result.stderr)
            lines.push(`Stderr:\n${result.stderr}`);
    }
    else if (result.kind === 'timeout') {
        lines.push(`Exit: timeout (killed after ${cmd.timeoutMs}ms)`);
        if (result.stdout)
            lines.push(`Stdout (partial):\n${result.stdout}`);
    }
    else {
        // spawn-error
        lines.push(`Exit: spawn-error — ${result.message}`);
    }
    return ok(lines.join('\n') + '\n');
}
async function cmdLogs() {
    const p = cachePath();
    const cacheData = readCacheFile(p);
    const entries = Object.entries(cacheData);
    if (entries.length === 0) {
        return ok(`No cache file found at ${p}.\n`
            + "Run lumira once with custom widgets enabled to populate the cache.\n");
    }
    const lines = [`Cache: ${p}`, ''];
    for (const [id, entry] of entries) {
        const { text, capturedAt, state } = entry;
        const dateStr = capturedAt > 0
            ? new Date(capturedAt).toLocaleString()
            : 'unknown';
        const truncated = text.length > 100 ? text.slice(0, 100) + '…' : text;
        lines.push(`id: ${id}`);
        lines.push(`  state:      ${state}`);
        lines.push(`  capturedAt: ${dateStr}`);
        lines.push(`  text:       ${truncated || '(empty)'}`);
        lines.push('');
    }
    return ok(lines.join('\n'));
}
function helpText(name) {
    return [
        `Usage: lumira ${name} <subcommand>`,
        '',
        'Subcommands:',
        '  list               List configured custom widgets',
        '  enable             Enable custom widgets in config',
        '  disable            Disable custom widgets in config',
        '  test <id>          Run a widget once and print output + timing',
        '  logs               Show cached widget outputs',
        '',
    ].join('\n');
}
// ── entry point ────────────────────────────────────────────────────────────
/**
 * Execute `lumira widget [subcommand] [...args]` — or the `lumira custom`
 * alias, which runs identical code under a different printed name. argv is
 * the full process.argv; the invoked name ('widget' or 'custom') is at
 * argv[2], the subcommand at argv[3], additional arguments from argv[4].
 *
 * Returns `{ output, exitCode }` — the dispatcher writes output to stdout and
 * sets process.exitCode from the returned value.
 */
export async function runWidgetCommand(argv) {
    // Whitelisted, not echoed raw: argv[2] is external input, and this name
    // gets interpolated straight into help/error text below.
    const name = argv[2] === 'custom' ? 'custom' : 'widget';
    const sub = argv[3];
    switch (sub) {
        case 'enable':
            return cmdEnable(name);
        case 'disable':
            return cmdDisable(name);
        case 'list':
            return cmdList(name);
        case 'test':
            return cmdTest(name, argv[4]);
        case 'logs':
            return cmdLogs();
        default:
            return fail(helpText(name));
    }
}
//# sourceMappingURL=widget.js.map