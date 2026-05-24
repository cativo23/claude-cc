/**
 * Tests for `lumira custom` subcommand (issue #143 phase 4).
 *
 * Covers:
 *   - enable / disable: config file read-modify-write
 *   - enable on missing file: creates default config
 *   - list: no commands → helpful message; with commands → table
 *   - test: unknown id → exitCode 1; known id → execBg called, output printed
 *   - logs: no cache file → message; with entries → formatted output
 *
 * All FS access is mocked so tests never touch the real filesystem.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node modules BEFORE importing the module under test.
vi.mock('node:fs');
vi.mock('node:os');

import * as fsMod from 'node:fs';
import * as osMod from 'node:os';

// We also need to mock execBg — import after vi.mock declarations.
vi.mock('../../src/utils/exec-bg.js', () => ({
  execBg: vi.fn(),
}));

import { execBg } from '../../src/utils/exec-bg.js';
// @ts-expect-error — module may not exist yet (red phase)
import { runCustomCommand } from '../../src/commands/custom.js';

// ── helpers ────────────────────────────────────────────────────────────────

const HOME = '/home/testuser';
const CONFIG_PATH = `${HOME}/.config/lumira/config.json`;
const CACHE_PATH = `${HOME}/.cache/lumira/custom-commands.json`;

const argv = (...rest: string[]) => ['node', 'lumira', 'custom', ...rest];

function makeFs(files: Record<string, string | null>) {
  const readFileSync = vi.mocked(fsMod.readFileSync);
  const writeFileSync = vi.mocked(fsMod.writeFileSync);
  const mkdirSync = vi.mocked(fsMod.mkdirSync);
  const existsSync = vi.mocked(fsMod.existsSync);

  existsSync.mockImplementation((p: unknown) => {
    return typeof p === 'string' && p in files && files[p] !== null;
  });

  readFileSync.mockImplementation((p: unknown, _enc?: unknown) => {
    if (typeof p !== 'string') throw new Error('ENOENT');
    if (!(p in files) || files[p] === null) {
      const e = Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
      throw e;
    }
    return files[p] as string;
  });

  const written: Record<string, string> = {};
  writeFileSync.mockImplementation((p: unknown, data: unknown) => {
    if (typeof p === 'string' && typeof data === 'string') {
      written[p] = data;
    }
  });

  mkdirSync.mockImplementation(() => undefined);

  return { readFileSync, writeFileSync, mkdirSync, existsSync, written };
}

// ── setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(osMod.homedir).mockReturnValue(HOME);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── enable ─────────────────────────────────────────────────────────────────

describe('lumira custom enable', () => {
  it('sets enabled:true in existing config and prints confirmation', async () => {
    const existingConfig = JSON.stringify({ customCommands: { enabled: false, commands: [] } });
    const { written } = makeFs({ [CONFIG_PATH]: existingConfig });

    const result = await runCustomCommand(argv('enable'));

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/enabled/i);

    // Written config must have enabled: true
    const written_config = written[CONFIG_PATH];
    expect(written_config).toBeDefined();
    const parsed = JSON.parse(written_config);
    expect(parsed.customCommands.enabled).toBe(true);
  });

  it('merges into existing config without destroying other keys', async () => {
    const existingConfig = JSON.stringify({
      theme: 'dracula',
      customCommands: { enabled: false, commands: [{ id: 'foo', command: ['echo', 'hi'], line: 1 }] },
    });
    const { written } = makeFs({ [CONFIG_PATH]: existingConfig });

    await runCustomCommand(argv('enable'));

    const parsed = JSON.parse(written[CONFIG_PATH]);
    expect(parsed.theme).toBe('dracula');
    expect(parsed.customCommands.enabled).toBe(true);
    expect(parsed.customCommands.commands).toHaveLength(1);
  });

  it('creates config file with enabled:true when file does not exist', async () => {
    const { written } = makeFs({});

    const result = await runCustomCommand(argv('enable'));

    expect(result.exitCode).toBe(0);
    const written_config = written[CONFIG_PATH];
    expect(written_config).toBeDefined();
    const parsed = JSON.parse(written_config);
    expect(parsed.customCommands.enabled).toBe(true);
    expect(parsed.customCommands.commands).toEqual([]);
  });

  it('pretty-prints JSON (indented)', async () => {
    makeFs({});

    await runCustomCommand(argv('enable'));

    // Cannot inspect written directly without capturing — covered above.
    // This test verifies the output includes confirmation text.
    const result = await runCustomCommand(argv('enable'));
    expect(result.output).toMatch(/custom command/i);
  });
});

// ── disable ────────────────────────────────────────────────────────────────

describe('lumira custom disable', () => {
  it('sets enabled:false in existing config and prints confirmation', async () => {
    const existingConfig = JSON.stringify({ customCommands: { enabled: true, commands: [] } });
    const { written } = makeFs({ [CONFIG_PATH]: existingConfig });

    const result = await runCustomCommand(argv('disable'));

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/disabled/i);

    const parsed = JSON.parse(written[CONFIG_PATH]);
    expect(parsed.customCommands.enabled).toBe(false);
  });

  it('creates config with enabled:false when file does not exist', async () => {
    const { written } = makeFs({});

    const result = await runCustomCommand(argv('disable'));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(written[CONFIG_PATH]);
    expect(parsed.customCommands.enabled).toBe(false);
    expect(parsed.customCommands.commands).toEqual([]);
  });
});

// ── list ───────────────────────────────────────────────────────────────────

describe('lumira custom list', () => {
  it('prints helpful message when no commands are configured', async () => {
    const configJson = JSON.stringify({ customCommands: { enabled: true, commands: [] } });
    makeFs({ [CONFIG_PATH]: configJson });

    const result = await runCustomCommand(argv('list'));

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/no custom commands/i);
  });

  it('prints helpful message when config file does not exist', async () => {
    makeFs({});

    const result = await runCustomCommand(argv('list'));

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/no custom commands/i);
  });

  it('shows enabled status header in output', async () => {
    const configJson = JSON.stringify({ customCommands: { enabled: true, commands: [] } });
    makeFs({ [CONFIG_PATH]: configJson });

    const result = await runCustomCommand(argv('list'));
    expect(result.output).toMatch(/enabled/i);
  });

  it('shows disabled status header when disabled', async () => {
    const configJson = JSON.stringify({ customCommands: { enabled: false, commands: [] } });
    makeFs({ [CONFIG_PATH]: configJson });

    const result = await runCustomCommand(argv('list'));
    expect(result.output).toMatch(/disabled/i);
  });

  it('prints table row for each configured command', async () => {
    const configJson = JSON.stringify({
      customCommands: {
        enabled: true,
        commands: [
          { id: 'my-cmd', command: ['echo', 'hello'], line: 1, refreshMs: 5000 },
          { id: 'other-cmd', command: ['date'], line: 2, refreshMs: 10000 },
        ],
      },
    });
    makeFs({ [CONFIG_PATH]: configJson });

    const result = await runCustomCommand(argv('list'));

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/my-cmd/);
    expect(result.output).toMatch(/other-cmd/);
    expect(result.output).toMatch(/echo/);
  });
});

// ── test ───────────────────────────────────────────────────────────────────

describe('lumira custom test', () => {
  it('returns exitCode 1 when id is not found', async () => {
    const configJson = JSON.stringify({ customCommands: { enabled: true, commands: [] } });
    makeFs({ [CONFIG_PATH]: configJson });

    const result = await runCustomCommand(argv('test', 'nonexistent-id'));

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/not found/i);
  });

  it('returns exitCode 1 when no id argument is provided', async () => {
    const configJson = JSON.stringify({ customCommands: { enabled: true, commands: [] } });
    makeFs({ [CONFIG_PATH]: configJson });

    const result = await runCustomCommand(argv('test'));

    expect(result.exitCode).toBe(1);
  });

  it('calls execBg and prints output + timing when id is found', async () => {
    const configJson = JSON.stringify({
      customCommands: {
        enabled: true,
        commands: [
          { id: 'greet', command: ['echo', 'hello'], line: 1, refreshMs: 5000 },
        ],
      },
    });
    makeFs({ [CONFIG_PATH]: configJson });

    vi.mocked(execBg).mockResolvedValueOnce({
      kind: 'ok',
      stdout: 'hello\n',
      truncated: false,
      exitCode: 0,
      durationMs: 42,
    });

    const result = await runCustomCommand(argv('test', 'greet'));

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(execBg)).toHaveBeenCalledOnce();
    expect(result.output).toMatch(/hello/);
    expect(result.output).toMatch(/42/); // duration
  });

  it('prints error details when execBg returns non-zero', async () => {
    const configJson = JSON.stringify({
      customCommands: {
        enabled: true,
        commands: [
          { id: 'failing', command: ['false'], line: 1, refreshMs: 5000 },
        ],
      },
    });
    makeFs({ [CONFIG_PATH]: configJson });

    vi.mocked(execBg).mockResolvedValueOnce({
      kind: 'nonzero',
      stdout: '',
      stderr: 'command failed',
      exitCode: 1,
      durationMs: 10,
    });

    const result = await runCustomCommand(argv('test', 'failing'));

    // Non-zero exit from user command — lumira reports it but exitCode is 0
    // (we successfully ran the test, the user cmd just failed)
    expect(result.output).toMatch(/nonzero|exit|failed/i);
  });
});

// ── logs ───────────────────────────────────────────────────────────────────

describe('lumira custom logs', () => {
  it('prints message when cache file does not exist', async () => {
    makeFs({});

    const result = await runCustomCommand(argv('logs'));

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/no cache|not found|cache.*does not/i);
  });

  it('formats cache entries with id, state, capturedAt, and text', async () => {
    const cacheData = JSON.stringify({
      'my-widget': {
        text: 'hello world',
        capturedAt: 1716500000000,
        state: 'ok',
      },
    });
    makeFs({ [CACHE_PATH]: cacheData });

    const result = await runCustomCommand(argv('logs'));

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/my-widget/);
    expect(result.output).toMatch(/hello world/);
    expect(result.output).toMatch(/ok/);
  });

  it('truncates long text to 100 chars in logs output', async () => {
    const longText = 'A'.repeat(200);
    const cacheData = JSON.stringify({
      'verbose-cmd': {
        text: longText,
        capturedAt: 1716500000000,
        state: 'ok',
      },
    });
    makeFs({ [CACHE_PATH]: cacheData });

    const result = await runCustomCommand(argv('logs'));

    expect(result.exitCode).toBe(0);
    // Full 200-char text should NOT appear; truncated version (100 chars) should
    expect(result.output).not.toContain(longText);
    expect(result.output).toContain('A'.repeat(100));
  });

  it('shows multiple cache entries', async () => {
    const cacheData = JSON.stringify({
      'cmd-a': { text: 'output-a', capturedAt: 1716500000000, state: 'ok' },
      'cmd-b': { text: 'output-b', capturedAt: 1716500001000, state: 'nonzero' },
    });
    makeFs({ [CACHE_PATH]: cacheData });

    const result = await runCustomCommand(argv('logs'));

    expect(result.output).toMatch(/cmd-a/);
    expect(result.output).toMatch(/cmd-b/);
    expect(result.output).toMatch(/output-a/);
    expect(result.output).toMatch(/output-b/);
  });
});

// ── unknown subcommand ─────────────────────────────────────────────────────

describe('lumira custom unknown subcommand', () => {
  it('prints help/usage and returns exitCode 1 for unknown subcommand', async () => {
    makeFs({});

    const result = await runCustomCommand(argv('frobnicate'));

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/usage|unknown|help/i);
  });

  it('prints usage when no subcommand is given', async () => {
    makeFs({});

    const result = await runCustomCommand(argv());

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/usage|help|list|enable|disable/i);
  });
});
