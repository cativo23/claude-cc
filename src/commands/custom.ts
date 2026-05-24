/**
 * `lumira custom` subcommand (issue #143 phase 4).
 *
 * Provides a CLI interface for managing the custom commands feature:
 *
 *   lumira custom list             List configured commands from config file
 *   lumira custom enable           Set enabled:true in config file
 *   lumira custom disable          Set enabled:false in config file
 *   lumira custom test <id>        Run a command once, print output + timing
 *   lumira custom logs             Show cached outputs from the cache file
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
import { createColors } from '../render/colors.js';
import type { CustomCommandsConfig, CustomCommand } from '../types.js';

// ── constants ──────────────────────────────────────────────────────────────

const CONFIG_FILE = 'config.json';
const CONFIG_DIR = join('.config', 'lumira');

const CACHE_FILE = 'custom-commands.json';
const CACHE_DIR = join('.cache', 'lumira');

// ── helpers ────────────────────────────────────────────────────────────────

function configPath(): string {
  return join(homedir(), CONFIG_DIR, CONFIG_FILE);
}

function cachePath(): string {
  return join(homedir(), CACHE_DIR, CACHE_FILE);
}

type Result = { output: string; exitCode: number };

function ok(output: string): Result {
  return { output, exitCode: 0 };
}

function fail(output: string): Result {
  return { output, exitCode: 1 };
}

/**
 * Read the raw config JSON from disk. Returns an empty object `{}` if the
 * file doesn't exist, throws on malformed JSON so the caller can surface a
 * useful error.
 */
function readConfigRaw(): Record<string, unknown> {
  const p = configPath();
  if (!existsSync(p)) return {};
  const raw = readFileSync(p, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

/**
 * Write (or create) the config file. Creates the parent directory if needed.
 * The value is always pretty-printed with 2-space indents.
 */
function writeConfigRaw(value: Record<string, unknown>): void {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(value, null, 2), 'utf8');
}

/**
 * Extract the `customCommands` block from the raw config. Returns a minimal
 * default when the block is missing or malformed.
 */
function readCustomCommandsBlock(
  raw: Record<string, unknown>,
): { enabled: boolean; commands: unknown[] } {
  const cc = raw.customCommands;
  if (!cc || typeof cc !== 'object' || Array.isArray(cc)) {
    return { enabled: false, commands: [] };
  }
  const obj = cc as Record<string, unknown>;
  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : false;
  const commands = Array.isArray(obj.commands) ? obj.commands : [];
  return { enabled, commands };
}

/**
 * Lightweight parse of customCommands.commands from raw config for `list` and
 * `test`. We only need id, command, line, and refreshMs — enough to display a
 * table or run a test. We don't re-validate all fields here; we let the user
 * see whatever is configured, including invalid entries (so they can debug).
 */
function parseCommandsForDisplay(
  raw: Record<string, unknown>,
): Array<{ id: string; command: string[]; line: number; refreshMs: number; timeoutMs: number; maxBytes: number }> {
  const { commands } = readCustomCommandsBlock(raw);
  const out: Array<{ id: string; command: string[]; line: number; refreshMs: number; timeoutMs: number; maxBytes: number }> = [];

  for (const entry of commands) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || e.id.length === 0) continue;
    if (!Array.isArray(e.command) || e.command.length === 0) continue;
    const command = (e.command as unknown[]).every(s => typeof s === 'string')
      ? (e.command as string[])
      : [];
    if (command.length === 0) continue;
    const line = typeof e.line === 'number' ? e.line : 1;
    const refreshMs = typeof e.refreshMs === 'number' ? e.refreshMs : 5000;
    const timeoutMs = typeof e.timeoutMs === 'number' ? e.timeoutMs : 1500;
    const maxBytes = typeof e.maxBytes === 'number' ? e.maxBytes : 256;
    out.push({ id: e.id, command, line, refreshMs, timeoutMs, maxBytes });
  }

  return out;
}

// ── color ──────────────────────────────────────────────────────────────────

/**
 * Only use color when stdout is a real TTY. In pipe/test contexts this
 * produces no escape sequences, keeping output clean for programmatic use.
 */
function makeColors() {
  const isTTY = !!process.stdout.isTTY;
  return isTTY ? createColors('named') : null;
}

// ── subcommands ────────────────────────────────────────────────────────────

async function cmdEnable(): Promise<Result> {
  try {
    const raw = readConfigRaw();
    const cc = readCustomCommandsBlock(raw);
    const updated: Record<string, unknown> = {
      ...raw,
      customCommands: {
        ...cc,
        enabled: true,
      },
    };
    writeConfigRaw(updated);
    return ok(`Custom commands enabled.\nConfig written to: ${configPath()}\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(`lumira custom enable: ${msg}\n`);
  }
}

async function cmdDisable(): Promise<Result> {
  try {
    const raw = readConfigRaw();
    const cc = readCustomCommandsBlock(raw);
    const updated: Record<string, unknown> = {
      ...raw,
      customCommands: {
        ...cc,
        enabled: false,
      },
    };
    writeConfigRaw(updated);
    return ok(`Custom commands disabled.\nConfig written to: ${configPath()}\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(`lumira custom disable: ${msg}\n`);
  }
}

async function cmdList(): Promise<Result> {
  const c = makeColors();
  let raw: Record<string, unknown>;
  try {
    raw = readConfigRaw();
  } catch {
    raw = {};
  }

  const { enabled } = readCustomCommandsBlock(raw);
  const commands = parseCommandsForDisplay(raw);

  const statusLine = enabled
    ? `Custom commands: ${c ? c.green('enabled') : 'enabled'}\n`
    : `Custom commands: ${c ? c.yellow('disabled') : 'disabled'}\n`;

  if (commands.length === 0) {
    return ok(
      statusLine
      + '\nNo custom commands configured.\n'
      + `Add commands to ${configPath()} under customCommands.commands.\n`,
    );
  }

  // Table: id | line | refresh | cmd
  const header = `${'id'.padEnd(20)} ${'line'.padEnd(6)} ${'refresh'.padEnd(10)} cmd`;
  const sep = '-'.repeat(header.length);
  const rows = commands.map(cmd => {
    const id = cmd.id.padEnd(20);
    const line = String(cmd.line).padEnd(6);
    const refresh = `${cmd.refreshMs}ms`.padEnd(10);
    const cmdStr = cmd.command.join(' ');
    return `${id} ${line} ${refresh} ${cmdStr}`;
  });

  const table = [header, sep, ...rows].join('\n');
  return ok(`${statusLine}\n${table}\n`);
}

async function cmdTest(id: string | undefined): Promise<Result> {
  if (!id) {
    return fail(
      'lumira custom test: missing command id.\n\n'
      + 'Usage: lumira custom test <id>\n'
      + "Use 'lumira custom list' to see configured command ids.\n",
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = readConfigRaw();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(`lumira custom test: could not read config: ${msg}\n`);
  }

  const commands = parseCommandsForDisplay(raw);
  const cmd = commands.find(c => c.id === id);

  if (!cmd) {
    const knownIds = commands.map(c => c.id).join(', ');
    return fail(
      `lumira custom test: command id "${id}" not found.\n`
      + (knownIds ? `Known ids: ${knownIds}\n` : 'No commands configured.\n'),
    );
  }

  const result = await execBg({
    command: cmd.command,
    timeoutMs: cmd.timeoutMs,
    maxBytes: cmd.maxBytes,
  });

  const lines: string[] = [
    `Command: ${cmd.command.join(' ')}`,
    `Duration: ${result.durationMs}ms`,
  ];

  if (result.kind === 'ok') {
    lines.push(`Exit: 0 (ok)`);
    lines.push(`Output:\n${result.stdout || '(empty)'}`);
  } else if (result.kind === 'nonzero') {
    lines.push(`Exit: ${result.exitCode} (nonzero)`);
    if (result.stdout) lines.push(`Stdout:\n${result.stdout}`);
    if (result.stderr) lines.push(`Stderr:\n${result.stderr}`);
  } else if (result.kind === 'timeout') {
    lines.push(`Exit: timeout (killed after ${cmd.timeoutMs}ms)`);
    if (result.stdout) lines.push(`Stdout (partial):\n${result.stdout}`);
  } else {
    // spawn-error
    lines.push(`Exit: spawn-error — ${(result as { kind: 'spawn-error'; message: string; durationMs: number }).message}`);
  }

  return ok(lines.join('\n') + '\n');
}

interface CacheEntry {
  text: string;
  capturedAt: number;
  state: string;
}

async function cmdLogs(): Promise<Result> {
  const p = cachePath();

  let raw: unknown;
  try {
    if (!existsSync(p)) {
      return ok(
        `No cache file found at ${p}.\n`
        + "Run lumira once with custom commands enabled to populate the cache.\n",
      );
    }
    raw = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(`lumira custom logs: could not read cache: ${msg}\n`);
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return ok('Cache file is empty or malformed.\n');
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    return ok('Cache file exists but contains no entries.\n');
  }

  const lines: string[] = [`Cache: ${p}`, ''];

  for (const [id, entry] of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    const text = typeof e.text === 'string' ? e.text : '';
    const capturedAt = typeof e.capturedAt === 'number' ? e.capturedAt : 0;
    const state = typeof e.state === 'string' ? e.state : 'unknown';

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

function helpText(): string {
  return [
    'Usage: lumira custom <subcommand>',
    '',
    'Subcommands:',
    '  list               List configured custom commands',
    '  enable             Enable custom commands in config',
    '  disable            Disable custom commands in config',
    '  test <id>          Run a command once and print output + timing',
    '  logs               Show cached command outputs',
    '',
  ].join('\n');
}

// ── entry point ────────────────────────────────────────────────────────────

/**
 * Execute `lumira custom [subcommand] [...args]`.
 *
 * argv is the full process.argv; 'custom' starts at argv[2], the subcommand
 * at argv[3], additional arguments from argv[4] onward.
 *
 * Returns `{ output, exitCode }` — the dispatcher writes output to stdout and
 * sets process.exitCode from the returned value.
 */
export async function runCustomCommand(argv: string[]): Promise<Result> {
  const sub = argv[3];

  switch (sub) {
    case 'enable':
      return cmdEnable();
    case 'disable':
      return cmdDisable();
    case 'list':
      return cmdList();
    case 'test':
      return cmdTest(argv[4]);
    case 'logs':
      return cmdLogs();
    default:
      return fail(helpText());
  }
}
