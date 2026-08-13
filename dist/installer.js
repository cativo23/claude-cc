import { readFileSync, existsSync, copyFileSync, unlinkSync, mkdirSync, rmdirSync, renameSync, openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { sanitizeTermString } from './normalize.js';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { runWizard } from './installer-wizard.js';
import { saveConfig, loadConfig } from './config.js';
import { getBanner, getSubtitle } from './tui/banner.js';
// ── ANSI helpers ────────────────────────────────────────────────────
const RST = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const ok = (msg) => `${GREEN}✓${RST} ${msg}`;
const warn = (msg) => `${YELLOW}⚠${RST} ${msg}`;
const header = () => `\n${CYAN} lumira installer${RST}\n`;
// ── StatusLine value ────────────────────────────────────────────────
// The per-render command. `lumira` (a real global bin) runs the compiled
// binary directly (~60ms). `npx lumira` resolves from cache (~150-300ms).
// `npx lumira@latest` hits the npm registry EVERY render (~600ms) — never
// write that form; it's the perf bug this installer migrates away from.
// `refreshInterval` is scoped to the MAIN statusLine only (see HudConfig
// JSDoc) — callers registering `subagentStatusLine` must omit it.
function makeStatusLine(command, refreshInterval) {
    return refreshInterval != null
        ? { type: 'command', command, padding: 0, refreshInterval }
        : { type: 'command', command, padding: 0 };
}
// Does the already-written statusLine's refreshInterval differ from what
// config.json now asks for? Drives the re-run-after-editing-config path so
// changing `refreshInterval` in config.json takes effect without forcing a
// full command rewrite. `desired: undefined` means "config.json doesn't
// manage this field" — NOT "remove it" — so a value the user added to
// settings.json by hand (or via an older lumira version) is left alone.
function refreshIntervalChanged(current, desired) {
    if (desired === undefined)
        return false;
    const currentValue = current && typeof current === 'object'
        ? current.refreshInterval
        : undefined;
    return currentValue !== desired;
}
/** Atomically write settings.json: temp file + fsync + rename, mode 0600. */
function writeSettingsAtomic(settings, settingsPath) {
    mkdirSync(dirname(settingsPath), { recursive: true });
    const tmp = `${settingsPath}.${process.pid}.${Date.now()}.lumira.tmp`;
    try {
        const fd = openSync(tmp, 'wx', 0o600);
        writeSync(fd, JSON.stringify(settings, null, 2) + '\n');
        fsyncSync(fd);
        closeSync(fd);
        renameSync(tmp, settingsPath);
    }
    catch (e) {
        try {
            unlinkSync(tmp);
        }
        catch { }
        throw e;
    }
}
// Rank a statusLine command by per-render speed (higher = faster).
//   3 = bare `lumira` binary — always resolves to the current installed version
//   2 = node /path/dist/index.js or plugin-cache path — fast but version-pinned
//   1 = npx, cached    (`npx lumira`)
//   0 = npx, registry  (`npx lumira@latest` / any pinned `@version`)
// Used to decide migration: only ever rewrite TOWARD a faster form.
// Speed 3 vs 2 distinction matters: a plugin-cache path (speed 2) can point to
// a stale version even after `npm i -g lumira`, so the installer must migrate it
// to the bare `lumira` binary when the global bin is available.
export function commandSpeed(command) {
    const c = command.trim();
    // `npx` as a bare word or a path basename (e.g. /usr/local/bin/npx, …\npx).
    if (/(^|[\s/\\])npx(\s|$)/.test(c)) {
        return /@(latest|\d)/.test(c) ? 0 : 1;
    }
    // Bare `lumira` (or platform-specific forms like `lumira.cmd`) — always current.
    if (/^lumira(\.cmd|\.exe)?$/.test(c))
        return 3;
    // node /path/dist/index.js or plugin-cache — version-pinned, may be stale.
    return 2;
}
// Is `lumira` resolvable as a global bin on PATH?
function defaultHasGlobalBin() {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    try {
        execFileSync(probe, ['lumira'], { stdio: 'ignore', timeout: 3000 });
        return true;
    }
    catch {
        return false;
    }
}
// Install lumira globally so the per-render command can invoke it directly.
function defaultInstallGlobal() {
    try {
        execFileSync('npm', ['install', '-g', 'lumira'], { stdio: 'inherit', timeout: 120000 });
        return true;
    }
    catch {
        return false;
    }
}
// Resolve the fastest statusLine command available in this environment.
// In a TTY with no global bin, offer to `npm i -g lumira` (confirmed) so the
// command can be the direct `lumira`; otherwise fall back to cached `npx lumira`.
async function resolveStatusLineCommand(ctx) {
    if (ctx.hasGlobalBin())
        return 'lumira';
    if (ctx.isTTY) {
        const accepted = await ctx.confirm('Install lumira globally for ~10× faster rendering (npm i -g lumira)?');
        if (accepted) {
            if (ctx.installGlobal()) {
                ctx.lines.push(ok('Installed lumira globally — statusline runs the compiled binary directly'));
                return 'lumira';
            }
            ctx.lines.push(warn('Global install failed — using npx for now (run npm i -g lumira later for full speed)'));
            return 'npx lumira';
        }
        ctx.lines.push(`  ${DIM}Tip: npm i -g lumira for ~10× faster rendering${RST}`);
    }
    return 'npx lumira';
}
function defaultSettingsPath() {
    return join(homedir(), '.claude', 'settings.json');
}
function defaultConfigPath() {
    return join(homedir(), '.config', 'lumira', 'config.json');
}
function isLumira(statusLine) {
    if (!statusLine || typeof statusLine !== 'object')
        return false;
    const sl = statusLine;
    return typeof sl.command === 'string' && sl.command.includes('lumira');
}
// ── Prompt helper ───────────────────────────────────────────────────
export function promptYN(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(`${question} (y/N) `, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'y');
        });
    });
}
// ── Skill installer ─────────────────────────────────────────────────
function installSkill(opts = {}) {
    const lines = [];
    const home = opts.homeOverride ?? homedir();
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const srcFile = resolve(thisDir, '..', 'skills', 'lumira', 'SKILL.md');
    if (!existsSync(srcFile)) {
        lines.push(warn('Skill file not found in package — skipping /lumira skill'));
        return lines;
    }
    const destinations = [
        { label: 'claude', dir: join(home, '.claude') },
        { label: 'qwen', dir: join(home, '.qwen') },
    ];
    for (const { label, dir } of destinations) {
        if (label === 'qwen' && !existsSync(dir))
            continue;
        const destDir = join(dir, 'skills', 'lumira');
        const destFile = join(destDir, 'SKILL.md');
        try {
            mkdirSync(destDir, { recursive: true });
            copyFileSync(srcFile, destFile);
            lines.push(ok(`Installed ${DIM}/lumira${RST} skill → ${DIM}${destDir}/${RST}`));
        }
        catch {
            lines.push(warn(`Could not install /lumira skill to ${destDir}`));
        }
    }
    return lines;
}
// Shared footer emitted at the end of every successful install path:
// skill install + Qwen-detected notice + restart message. Keeps the two
// success branches (already-configured vs fresh-install) from drifting.
function emitFooter(lines, homeOverride) {
    lines.push(...installSkill({ homeOverride }));
    if (existsSync(join(homeOverride ?? homedir(), '.qwen'))) {
        lines.push('');
        lines.push('  ℹ Qwen Code detected — in Qwen sessions, lumira renders');
        lines.push('    single-line automatically. Your preset above applies to Claude Code.');
    }
    lines.push(`  ${DIM}Tip: lumira custom enable to add user-defined statusline segments${RST}`);
    lines.push(`\n  Restart Claude Code to see your statusline.\n`);
}
// ── Install ─────────────────────────────────────────────────────────
/**
 * Optionally register Claude Code's `subagentStatusLine` hook (CC ≥ 2.1.x)
 * alongside the main statusLine, pointing it at `<cmd> subagent`.
 *
 * Opt-in and interactive-only: we never add a second settings key without
 * explicit consent, and skip silently in non-TTY runs (so CI/scripted installs
 * stay predictable). No-op when it already points at lumira. Returns true when
 * the key was added, so the caller knows it must flush settings to disk.
 */
async function maybeRegisterSubagent(args) {
    const { settings, baseCmd, confirm, isTTY, lines } = args;
    // Only register when the key is absent. If it's already lumira there's nothing
    // to do; if it's a *foreign* command we leave it untouched rather than clobber
    // a user's own subagent renderer without an explicit backup/replace flow.
    if (settings.subagentStatusLine != null)
        return false;
    if (!isTTY)
        return false;
    const accepted = await confirm('Customize subagent panel rows too? (subagentStatusLine)');
    if (!accepted)
        return false;
    settings.subagentStatusLine = makeStatusLine(`${baseCmd} subagent`);
    lines.push(ok(`Configured subagentStatusLine → ${DIM}${baseCmd} subagent${RST}`));
    return true;
}
export async function install(opts = {}) {
    const settingsPath = opts.settingsPath ?? defaultSettingsPath();
    const configPath = opts.configPath ?? defaultConfigPath();
    const backupPath = settingsPath + '.lumira.bak';
    const confirm = opts.confirm ?? promptYN;
    const stdin = opts.stdin ?? process.stdin;
    const stdout = opts.stdout ?? process.stdout;
    const hasGlobalBin = opts.hasGlobalBin ?? defaultHasGlobalBin;
    const installGlobal = opts.installGlobal ?? defaultInstallGlobal;
    const lines = [];
    // Build banner prelude (shown on each wizard frame so it survives screen clears)
    let prelude = '';
    if (stdin?.isTTY) {
        const banner = getBanner({ width: stdout?.columns });
        if (banner) {
            const subtitle = getSubtitle();
            prelude = banner + '\n ' + subtitle + '\n\n';
        }
    }
    // ── settings.json read + early replacement confirmation ───────
    // Read settings and confirm before running the wizard, so the user
    // doesn't waste time configuring preset/theme/icons only to decline
    // the replacement at the end.
    let settings = {};
    if (existsSync(settingsPath)) {
        try {
            const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                settings = parsed;
            }
            else {
                lines.push(warn('Could not parse existing settings.json, creating fresh'));
                settings = {};
            }
        }
        catch {
            lines.push(warn('Could not parse existing settings.json, creating fresh'));
            settings = {};
        }
    }
    const hasForeignStatusLine = settings.statusLine && !isLumira(settings.statusLine);
    if (hasForeignStatusLine) {
        const rawCmd = settings.statusLine.command ?? 'unknown';
        const currentCmd = sanitizeTermString(String(rawCmd));
        lines.push(warn(`Current statusline: ${YELLOW}${currentCmd}${RST}`));
        const accepted = await confirm('Replace with lumira?');
        if (!accepted) {
            lines.push(`\n  Aborted. No changes made.\n`);
            return lines.join('\n') + '\n';
        }
    }
    // Load existing config to pre-populate wizard selections
    const existingConfig = loadConfig(dirname(configPath));
    const current = {
        preset: existingConfig.preset,
        theme: existingConfig.theme,
        icons: existingConfig.icons,
    };
    const desiredRefreshInterval = existingConfig.refreshInterval;
    // Determine wizard result
    let wizard;
    if (stdin?.isTTY) {
        const result = await runWizard({ current, prelude, stdin, stdout });
        if (result === null) {
            lines.push(`\n  Installation cancelled.\n`);
            return lines.join('\n') + '\n';
        }
        wizard = result;
    }
    else {
        // Non-TTY: use defaults
        wizard = { preset: 'balanced', icons: 'nerd' };
        lines.push(ok('Non-interactive mode — using defaults (preset: balanced, icons: nerd)'));
    }
    // Save config + emit footer + render output. Shared by every exit below.
    const finalize = () => {
        saveConfig(wizard, configPath);
        lines.push(ok(`Saved config → ${DIM}${configPath}${RST}`));
        emitFooter(lines, opts.homeOverride);
        return lines.join('\n') + '\n';
    };
    // ── settings.json replace / backup / migrate ───────────────────
    const existingIsLumira = !!settings.statusLine && isLumira(settings.statusLine);
    const existingCmd = existingIsLumira
        ? String(settings.statusLine.command ?? '')
        : '';
    // Already on the bare `lumira` binary — optimal, nothing to rewrite.
    // A node /path/dist/index.js or plugin-cache path (speed 2) is NOT skipped
    // here — it may point to a stale version and should be migrated to `lumira`.
    if (existingIsLumira && commandSpeed(existingCmd) >= 3) {
        lines.push(ok('lumira is already configured (optimal command)'));
        // Command needs no rewrite, but refreshInterval may have changed in
        // config.json since the last install — keep it in sync either way.
        let needsWrite = false;
        if (refreshIntervalChanged(settings.statusLine, desiredRefreshInterval)) {
            // Patch the field in place — never rebuild the object wholesale here,
            // or any other key already on statusLine (a custom `padding`, a
            // foreign extension field) would be silently discarded.
            settings.statusLine = { ...settings.statusLine, refreshInterval: desiredRefreshInterval };
            needsWrite = true;
        }
        // A returning user may still want to opt into the subagent hook — offer
        // it and flush only if they accept.
        const added = await maybeRegisterSubagent({ settings, baseCmd: existingCmd, confirm, isTTY: !!stdin?.isTTY, lines });
        if (added || needsWrite)
            writeSettingsAtomic(settings, settingsPath);
        return finalize();
    }
    // Resolve the fastest per-render command this environment can offer.
    const resolvedCmd = await resolveStatusLineCommand({
        isTTY: !!stdin?.isTTY, confirm, hasGlobalBin, installGlobal, lines,
    });
    if (existingIsLumira) {
        // Existing lumira command (npx form) — only rewrite if strictly faster,
        // so we never downgrade a user's direct binary to npx.
        if (commandSpeed(resolvedCmd) <= commandSpeed(existingCmd)) {
            lines.push(ok('lumira is already configured'));
            let needsWrite = false;
            if (refreshIntervalChanged(settings.statusLine, desiredRefreshInterval)) {
                // Patch in place — see the identical rationale in the branch above.
                settings.statusLine = { ...settings.statusLine, refreshInterval: desiredRefreshInterval };
                needsWrite = true;
            }
            const added = await maybeRegisterSubagent({ settings, baseCmd: existingCmd, confirm, isTTY: !!stdin?.isTTY, lines });
            if (added || needsWrite)
                writeSettingsAtomic(settings, settingsPath);
            return finalize();
        }
    }
    else if (settings.statusLine) {
        // Foreign statusLine already confirmed above — back it up and replace.
        copyFileSync(settingsPath, backupPath);
        lines.push(ok(`Backed up existing settings → ${DIM}settings.json.lumira.bak${RST}`));
    }
    // `desiredRefreshInterval` undefined means config.json doesn't manage this
    // field — fall back to whatever refreshInterval is already on the existing
    // lumira statusLine (if any) so an upgrade never silently deletes a value
    // the user set by hand (see refreshIntervalChanged's doc above).
    const existingRefreshInterval = existingIsLumira
        ? settings.statusLine.refreshInterval
        : undefined;
    settings.statusLine = makeStatusLine(resolvedCmd, desiredRefreshInterval ?? existingRefreshInterval);
    await maybeRegisterSubagent({ settings, baseCmd: resolvedCmd, confirm, isTTY: !!stdin?.isTTY, lines });
    writeSettingsAtomic(settings, settingsPath);
    lines.push(ok(existingIsLumira
        ? `Upgraded statusline command → ${DIM}${resolvedCmd}${RST} (faster)`
        : 'Configured lumira as statusline'));
    return finalize();
}
// ── Uninstall ───────────────────────────────────────────────────────
export function uninstall(opts = {}) {
    const settingsPath = opts.settingsPath ?? defaultSettingsPath();
    const backupPath = settingsPath + '.lumira.bak';
    const home = opts.homeOverride ?? homedir();
    const lines = [header()];
    if (!existsSync(settingsPath)) {
        lines.push(ok('Nothing to uninstall — no settings.json found'));
        return lines.join('\n') + '\n';
    }
    if (existsSync(backupPath)) {
        try {
            JSON.parse(readFileSync(backupPath, 'utf8'));
            copyFileSync(backupPath, settingsPath);
            unlinkSync(backupPath);
            lines.push(ok('Restored previous settings from backup'));
            // Remove skill from both destinations (best effort)
            for (const root of [join(home, '.claude'), join(home, '.qwen')]) {
                const skillFile = join(root, 'skills', 'lumira', 'SKILL.md');
                if (existsSync(skillFile)) {
                    try {
                        unlinkSync(skillFile);
                        try {
                            rmdirSync(dirname(skillFile));
                        }
                        catch { /* dir not empty, ok */ }
                        try {
                            rmdirSync(dirname(dirname(skillFile)));
                        }
                        catch { /* parent skills/ not empty, ok */ }
                    }
                    catch { /* best effort */ }
                }
            }
            lines.push(`\n  Restart Claude Code to apply changes.\n`);
            return lines.join('\n') + '\n';
        }
        catch {
            lines.push(warn('Backup file is corrupt — skipping restore'));
            try {
                unlinkSync(backupPath);
            }
            catch { }
        }
    }
    let uninstSettings;
    try {
        uninstSettings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    }
    catch {
        lines.push(warn('Could not parse settings.json'));
        lines.push(`\n  Restart Claude Code to apply changes.\n`);
        return lines.join('\n') + '\n';
    }
    delete uninstSettings.statusLine;
    // Only remove the subagent hook if it's ours — never wipe a foreign renderer.
    if (isLumira(uninstSettings.subagentStatusLine))
        delete uninstSettings.subagentStatusLine;
    writeSettingsAtomic(uninstSettings, settingsPath);
    lines.push(ok('Removed lumira statusline from settings'));
    // Remove skill from both destinations (best effort)
    for (const root of [join(home, '.claude'), join(home, '.qwen')]) {
        const skillFile = join(root, 'skills', 'lumira', 'SKILL.md');
        if (existsSync(skillFile)) {
            try {
                unlinkSync(skillFile);
                try {
                    rmdirSync(dirname(skillFile));
                }
                catch { /* dir not empty, ok */ }
                try {
                    rmdirSync(dirname(dirname(skillFile)));
                }
                catch { /* parent skills/ not empty, ok */ }
            }
            catch { /* best effort */ }
        }
    }
    lines.push(`\n  Restart Claude Code to apply changes.\n`);
    return lines.join('\n') + '\n';
}
//# sourceMappingURL=installer.js.map