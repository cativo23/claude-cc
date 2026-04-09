import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

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
  confirm?: (prompt: string) => Promise<boolean>;
}

function defaultSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
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

// ── Install ─────────────────────────────────────────────────────────
export async function install(opts: InstallerOptions = {}): Promise<string> {
  const settingsPath = opts.settingsPath ?? defaultSettingsPath();
  const backupPath = settingsPath + '.lumira.bak';
  const confirm = opts.confirm ?? promptYN;
  const lines: string[] = [header()];

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
  lines.push(`\n  Restart Claude Code to see your statusline.\n`);
  return lines.join('\n') + '\n';
}
