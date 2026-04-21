import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync, mkdirSync, rmdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { runWizard } from './installer-wizard.js';
import { saveConfig, loadConfig, type WizardResult } from './config.js';
import { getBanner, getSubtitle } from './tui/banner.js';

// ── ANSI helpers ────────────────────────────────────────────────────
const RST = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

const ok = (msg: string) => `${GREEN}✓${RST} ${msg}`;
const warn = (msg: string) => `${YELLOW}⚠${RST} ${msg}`;
const header = () => `\n${CYAN} lumira installer${RST}\n`;

// ── StatusLine value ────────────────────────────────────────────────
const LUMIRA_STATUSLINE = {
  type: 'command' as const,
  command: 'npx lumira@latest',
  padding: 0,
};

// ── Install options (DI for testing) ────────────────────────────────
export interface InstallerOptions {
  settingsPath?: string;
  configPath?: string;
  confirm?: (prompt: string) => Promise<boolean>;
  stdin?: NodeJS.ReadStream | (import('node:stream').Readable & {
    isTTY?: boolean;
    isRaw?: boolean;
    setRawMode?: (flag: boolean) => unknown;
  });
  stdout?: NodeJS.WriteStream | (import('node:stream').Writable & { columns?: number });
  homeOverride?: string;
}

function defaultSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

function defaultConfigPath(): string {
  return join(homedir(), '.config', 'lumira', 'config.json');
}

function isLumira(statusLine: unknown): boolean {
  if (!statusLine || typeof statusLine !== 'object') return false;
  const sl = statusLine as Record<string, unknown>;
  return typeof sl.command === 'string' && sl.command.includes('lumira');
}

// ── Prompt helper ───────────────────────────────────────────────────
export function promptYN(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ── Skill installer ─────────────────────────────────────────────────
function installSkill(opts: { homeOverride?: string } = {}): string[] {
  const lines: string[] = [];
  const home = opts.homeOverride ?? homedir();

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const srcFile = resolve(thisDir, '..', 'skills', 'lumira', 'SKILL.md');

  if (!existsSync(srcFile)) {
    lines.push(warn('Skill file not found in package — skipping /lumira skill'));
    return lines;
  }

  const destinations = [
    { label: 'claude', dir: join(home, '.claude') },
    { label: 'qwen',   dir: join(home, '.qwen')   },
  ];

  for (const { label, dir } of destinations) {
    if (label === 'qwen' && !existsSync(dir)) continue;
    const destDir = join(dir, 'skills', 'lumira');
    const destFile = join(destDir, 'SKILL.md');
    try {
      mkdirSync(destDir, { recursive: true });
      copyFileSync(srcFile, destFile);
      lines.push(ok(`Installed ${DIM}/lumira${RST} skill → ${DIM}${destDir}/${RST}`));
    } catch {
      lines.push(warn(`Could not install /lumira skill to ${destDir}`));
    }
  }

  return lines;
}

// ── Install ─────────────────────────────────────────────────────────
export async function install(opts: InstallerOptions = {}): Promise<string> {
  const settingsPath = opts.settingsPath ?? defaultSettingsPath();
  const backupPath = settingsPath + '.lumira.bak';
  const confirm = opts.confirm ?? promptYN;
  const lines: string[] = [];

  // ── Wizard / config path ─────────────────────────────────────────
  // When configPath is not provided, skip the wizard and config write
  // entirely (legacy path — preserves existing test behaviour).
  const runInteractive = opts.configPath !== undefined;

  if (runInteractive) {
    const configPath = opts.configPath as string;
    const stdin = opts.stdin ?? process.stdin;
    const stdout = opts.stdout ?? process.stdout;

    // Build banner prelude (shown on each wizard frame so it survives screen clears)
    let prelude = '';
    if (stdin?.isTTY) {
      const banner = getBanner({ width: (stdout as { columns?: number } | undefined)?.columns });
      if (banner) {
        const subtitle = getSubtitle();
        prelude = banner + '\n ' + subtitle + '\n\n';
      }
    }

    // Load existing config to pre-populate wizard selections
    const existingConfig = loadConfig(dirname(configPath));
    const current = {
      preset: existingConfig.preset,
      theme: existingConfig.theme,
      icons: existingConfig.icons,
    };

    // Determine wizard result
    let wizard: WizardResult;
    if (stdin?.isTTY) {
      const result = await runWizard({ current, prelude, stdin, stdout });
      if (result === null) {
        lines.push(`\n  Installation cancelled.\n`);
        return lines.join('\n') + '\n';
      }
      wizard = result;
    } else {
      // Non-TTY: use defaults
      wizard = { preset: 'balanced', icons: 'nerd' };
      lines.push(ok('Non-interactive mode — using defaults (preset: balanced, icons: nerd)'));
    }

    // ── settings.json read/replace/backup ──────────────────────────
    let settings: Record<string, unknown> = {};

    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      } catch {
        lines.push(warn('Could not parse existing settings.json, creating fresh'));
        settings = {};
      }
    }

    if (settings.statusLine) {
      if (isLumira(settings.statusLine)) {
        lines.push(ok('lumira is already configured as your statusline'));
        saveConfig(wizard, configPath);
        lines.push(ok(`Saved config → ${DIM}${configPath}${RST}`));
        lines.push(...installSkill({ homeOverride: opts.homeOverride }));
        return lines.join('\n') + '\n';
      }

      const currentCmd = (settings.statusLine as Record<string, unknown>).command ?? 'unknown';
      lines.push(warn(`Current statusline: ${YELLOW}${currentCmd}${RST}`));
      const accepted = await confirm('Replace with lumira?');
      if (!accepted) {
        lines.push(`\n  Aborted. No changes made.\n`);
        return lines.join('\n') + '\n';
      }

      copyFileSync(settingsPath, backupPath);
      lines.push(ok(`Backed up existing settings → ${DIM}settings.json.lumira.bak${RST}`));
    }

    settings.statusLine = { ...LUMIRA_STATUSLINE };
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
    lines.push(ok('Configured lumira as statusline'));

    saveConfig(wizard, configPath);
    lines.push(ok(`Saved config → ${DIM}${configPath}${RST}`));

    lines.push(...installSkill({ homeOverride: opts.homeOverride }));

    if (existsSync(join(opts.homeOverride ?? homedir(), '.qwen'))) {
      lines.push('');
      lines.push('  \u2139 Qwen Code detected — in Qwen sessions, lumira renders');
      lines.push('    single-line automatically. Your preset above applies to Claude Code.');
    }

    lines.push(`\n  Restart Claude Code to see your statusline.\n`);
    return lines.join('\n') + '\n';
  }

  // ── Legacy path (no configPath) — original behaviour ─────────────
  lines.push(header());

  let settings: Record<string, unknown> = {};

  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      lines.push(warn('Could not parse existing settings.json, creating fresh'));
      settings = {};
    }
  }

  if (settings.statusLine) {
    if (isLumira(settings.statusLine)) {
      lines.push(ok('lumira is already configured as your statusline'));
      lines.push(...installSkill({ homeOverride: opts.homeOverride }));
      return lines.join('\n') + '\n';
    }

    const current = (settings.statusLine as Record<string, unknown>).command ?? 'unknown';
    lines.push(warn(`Current statusline: ${YELLOW}${current}${RST}`));
    const accepted = await confirm('Replace with lumira?');
    if (!accepted) {
      lines.push(`\n  Aborted. No changes made.\n`);
      return lines.join('\n') + '\n';
    }

    copyFileSync(settingsPath, backupPath);
    lines.push(ok(`Backed up existing settings → ${DIM}settings.json.lumira.bak${RST}`));
  }

  settings.statusLine = { ...LUMIRA_STATUSLINE };
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
  lines.push(ok('Configured lumira as statusline'));

  lines.push(...installSkill({ homeOverride: opts.homeOverride }));
  lines.push(`\n  Restart Claude Code to see your statusline.\n`);
  return lines.join('\n') + '\n';
}

// ── Uninstall ───────────────────────────────────────────────────────
export function uninstall(opts: InstallerOptions = {}): string {
  const settingsPath = opts.settingsPath ?? defaultSettingsPath();
  const backupPath = settingsPath + '.lumira.bak';
  const home = opts.homeOverride ?? homedir();
  const lines: string[] = [header()];

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
            try { rmdirSync(dirname(skillFile)); } catch { /* dir not empty, ok */ }
          } catch { /* best effort */ }
        }
      }

      lines.push(`\n  Restart Claude Code to apply changes.\n`);
      return lines.join('\n') + '\n';
    } catch {
      lines.push(warn('Backup file is corrupt — skipping restore'));
      try { unlinkSync(backupPath); } catch {}
    }
  }

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    delete settings.statusLine;
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 });
    lines.push(ok('Removed lumira statusline from settings'));
  } catch {
    lines.push(warn('Could not parse settings.json'));
  }

  // Remove skill from both destinations (best effort)
  for (const root of [join(home, '.claude'), join(home, '.qwen')]) {
    const skillFile = join(root, 'skills', 'lumira', 'SKILL.md');
    if (existsSync(skillFile)) {
      try {
        unlinkSync(skillFile);
        try { rmdirSync(dirname(skillFile)); } catch { /* dir not empty, ok */ }
      } catch { /* best effort */ }
    }
  }

  lines.push(`\n  Restart Claude Code to apply changes.\n`);
  return lines.join('\n') + '\n';
}
