/**
 * Tests for `lumira widget` subcommand (issue #143 phase 4; renamed from
 * `custom` when value→icon/color tiers + description landed).
 *
 * Covers:
 *   - enable / disable: config file read-modify-write, respecting whichever
 *     of customWidgets/customCommands is already in use
 *   - enable on missing file: creates a config under the new customWidgets key
 *   - list: no widgets → helpful message; with widgets → table
 *   - test: unknown id → exitCode 1; known id → execBg called, output printed
 *   - logs: no cache file → message; with entries → formatted output
 *   - alias: `lumira custom` runs identical code, only the printed name differs
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
import { runWidgetCommand } from '../../src/commands/widget.js';

// ── helpers ────────────────────────────────────────────────────────────────

const HOME = '/home/testuser';
const CONFIG_PATH = `${HOME}/.config/lumira/config.json`;
const CACHE_PATH = `${HOME}/.cache/lumira/custom-commands.json`;

const argv = (...rest: string[]) => ['node', 'lumira', 'widget', ...rest];
const argvAs = (invokedAs: string, ...rest: string[]) => ['node', 'lumira', invokedAs, ...rest];

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

describe('lumira widget enable', () => {
  it('sets enabled:true on an existing customCommands block, keeping the legacy key', async () => {
    const existingConfig = JSON.stringify({ customCommands: { enabled: false, commands: [] } });
    const { written } = makeFs({ [CONFIG_PATH]: existingConfig });

    const result = await runWidgetCommand(argv('enable'));

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/enabled/i);

    const parsed = JSON.parse(written[CONFIG_PATH]);
    expect(parsed.customCommands.enabled).toBe(true);
    expect(parsed.customWidgets).toBeUndefined();
  });

  it('sets enabled:true on an existing customWidgets block, keeping the new key', async () => {
    const existingConfig = JSON.stringify({ customWidgets: { enabled: false, commands: [] } });
    const { written } = makeFs({ [CONFIG_PATH]: existingConfig });

    await runWidgetCommand(argv('enable'));

    const parsed = JSON.parse(written[CONFIG_PATH]);
    expect(parsed.customWidgets.enabled).toBe(true);
    expect(parsed.customCommands).toBeUndefined();
  });

  it('merges into existing config without destroying other keys', async () => {
    const existingConfig = JSON.stringify({
      theme: 'dracula',
      customCommands: { enabled: false, commands: [{ id: 'foo', command: ['echo', 'hi'], line: 1 }] },
    });
    const { written } = makeFs({ [CONFIG_PATH]: existingConfig });

    await runWidgetCommand(argv('enable'));

    const parsed = JSON.parse(written[CONFIG_PATH]);
    expect(parsed.theme).toBe('dracula');
    expect(parsed.customCommands.enabled).toBe(true);
    expect(parsed.customCommands.commands).toHaveLength(1);
  });

  it('creates config under the new customWidgets key when neither key exists yet', async () => {
    const { written } = makeFs({});

    const result = await runWidgetCommand(argv('enable'));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(written[CONFIG_PATH]);
    expect(parsed.customWidgets.enabled).toBe(true);
    expect(parsed.customWidgets.commands).toEqual([]);
    expect(parsed.customCommands).toBeUndefined();
  });

  it('pretty-prints JSON (indented)', async () => {
    makeFs({});

    const result = await runWidgetCommand(argv('enable'));
    expect(result.output).toMatch(/custom widget/i);
  });
});

// ── disable ────────────────────────────────────────────────────────────────

describe('lumira widget disable', () => {
  it('sets enabled:false in existing config and prints confirmation', async () => {
    const existingConfig = JSON.stringify({ customCommands: { enabled: true, commands: [] } });
    const { written } = makeFs({ [CONFIG_PATH]: existingConfig });

    const result = await runWidgetCommand(argv('disable'));

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/disabled/i);

    const parsed = JSON.parse(written[CONFIG_PATH]);
    expect(parsed.customCommands.enabled).toBe(false);
  });

  it('creates config under the new customWidgets key with enabled:false when file does not exist', async () => {
    const { written } = makeFs({});

    const result = await runWidgetCommand(argv('disable'));

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(written[CONFIG_PATH]);
    expect(parsed.customWidgets.enabled).toBe(false);
    expect(parsed.customWidgets.commands).toEqual([]);
  });
});

// ── list ───────────────────────────────────────────────────────────────────

describe('lumira widget list', () => {
  it('prints helpful message when no widgets are configured', async () => {
    const configJson = JSON.stringify({ customCommands: { enabled: true, commands: [] } });
    makeFs({ [CONFIG_PATH]: configJson });

    const result = await runWidgetCommand(argv('list'));

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/no custom widgets/i);
  });

  it('prints helpful message when config file does not exist', async () => {
    makeFs({});

    const result = await runWidgetCommand(argv('list'));

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/no custom widgets/i);
  });

  it('shows enabled status header in output', async () => {
    const configJson = JSON.stringify({ customCommands: { enabled: true, commands: [] } });
    makeFs({ [CONFIG_PATH]: configJson });

    const result = await runWidgetCommand(argv('list'));
    expect(result.output).toMatch(/enabled/i);
  });

  it('shows disabled status header when disabled', async () => {
    const configJson = JSON.stringify({ customCommands: { enabled: false, commands: [] } });
    makeFs({ [CONFIG_PATH]: configJson });

    const result = await runWidgetCommand(argv('list'));
    expect(result.output).toMatch(/disabled/i);
  });

  it('hints the invoked name in the enable-it hint when disabled', async () => {
    const configJson = JSON.stringify({ customCommands: { enabled: false, commands: [] } });

    makeFs({ [CONFIG_PATH]: configJson });
    const asWidget = await runWidgetCommand(argvAs('widget', 'list'));
    expect(asWidget.output).toContain("lumira widget enable");

    makeFs({ [CONFIG_PATH]: configJson });
    const asCustom = await runWidgetCommand(argvAs('custom', 'list'));
    expect(asCustom.output).toContain("lumira custom enable");
  });

  it('prints table row for each configured widget', async () => {
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

    const result = await runWidgetCommand(argv('list'));

    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/my-cmd/);
    expect(result.output).toMatch(/other-cmd/);
    expect(result.output).toMatch(/echo/);
  });

  it('shows tier count and description for a widget with a valueMap', async () => {
    const configJson = JSON.stringify({
      customCommands: {
        enabled: true,
        commands: [
          {
            id: 'cpu',
            command: ['echo', '50'],
            line: 1,
            refreshMs: 5000,
            description: 'CPU load',
            valueMap: [{ lt: 60, icon: '🟢' }, { icon: '🔴', color: 'red' }],
          },
        ],
      },
    });
    makeFs({ [CONFIG_PATH]: configJson });

    const result = await runWidgetCommand(argv('list'));

    expect(result.output).toMatch(/cpu/);
    expect(result.output).toMatch(/CPU load/);
    expect(result.output).toMatch(/\b2\b/); // tier count
  });
});

// ── test ───────────────────────────────────────────────────────────────────

describe('lumira widget test', () => {
  it('returns exitCode 1 when id is not found', async () => {
    const configJson = JSON.stringify({ customCommands: { enabled: true, commands: [] } });
    makeFs({ [CONFIG_PATH]: configJson });

    const result = await runWidgetCommand(argv('test', 'nonexistent-id'));

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/not found/i);
  });

  it('returns exitCode 1 when no id argument is provided', async () => {
    const configJson = JSON.stringify({ customCommands: { enabled: true, commands: [] } });
    makeFs({ [CONFIG_PATH]: configJson });

    const result = await runWidgetCommand(argv('test'));

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

    const result = await runWidgetCommand(argv('test', 'greet'));

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

    const result = await runWidgetCommand(argv('test', 'failing'));

    // Non-zero exit from user command — lumira reports it but exitCode is 0
    // (we successfully ran the test, the user cmd just failed)
    expect(result.output).toMatch(/nonzero|exit|failed/i);
  });

  it('reports the matched valueMap tier when stdout parses as numeric', async () => {
    const configJson = JSON.stringify({
      customCommands: {
        enabled: true,
        commands: [
          {
            id: 'cpu', command: ['echo', '95'], line: 1, refreshMs: 5000,
            valueMap: [{ lt: 60, icon: '🟢' }, { icon: '🔴', color: 'red' }],
          },
        ],
      },
    });
    makeFs({ [CONFIG_PATH]: configJson });

    vi.mocked(execBg).mockResolvedValueOnce({
      kind: 'ok', stdout: '95', truncated: false, exitCode: 0, durationMs: 5,
    });

    const result = await runWidgetCommand(argv('test', 'cpu'));

    expect(result.output).toMatch(/Parsed value: 95/);
    expect(result.output).toMatch(/🔴/);
  });

  it('reports "not numeric" when stdout does not parse and a valueMap is configured', async () => {
    const configJson = JSON.stringify({
      customCommands: {
        enabled: true,
        commands: [
          { id: 'cpu', command: ['echo', 'busy'], line: 1, refreshMs: 5000, valueMap: [{ lt: 60, icon: '🟢' }] },
        ],
      },
    });
    makeFs({ [CONFIG_PATH]: configJson });

    vi.mocked(execBg).mockResolvedValueOnce({
      kind: 'ok', stdout: 'busy', truncated: false, exitCode: 0, durationMs: 5,
    });

    const result = await runWidgetCommand(argv('test', 'cpu'));

    expect(result.output).toMatch(/not numeric/i);
  });

  it('matches a tier against ANSI/multi-line stdout the same way the renderer would (sanitizes before parsing)', async () => {
    // Regression: cmdTest used to parse raw execBg stdout, while the
    // renderer parses stripAnsi(toSingleLine(...)) — so a widget whose tier
    // DOES apply at render time could get a false "not numeric" here, the
    // one channel the docs name for diagnosing a non-matching tier.
    const configJson = JSON.stringify({
      customCommands: {
        enabled: true,
        commands: [
          { id: 'cpu', command: ['echo'], line: 1, refreshMs: 5000, valueMap: [{ lt: 60, icon: '🟢' }, { icon: '🔴', color: 'red' }] },
        ],
      },
    });
    makeFs({ [CONFIG_PATH]: configJson });

    vi.mocked(execBg).mockResolvedValueOnce({
      kind: 'ok', stdout: '\x1b[32m95\x1b[0m\n', truncated: false, exitCode: 0, durationMs: 5,
    });

    const result = await runWidgetCommand(argv('test', 'cpu'));

    expect(result.output).toMatch(/Parsed value: 95/);
    expect(result.output).toMatch(/🔴/);
  });

  it('reports valueMap as explicitly ignored (not silently skipped) for an ansi:true widget', async () => {
    const configJson = JSON.stringify({
      customCommands: {
        enabled: true,
        commands: [
          { id: 'cpu', command: ['echo'], line: 1, refreshMs: 5000, ansi: true, valueMap: [{ lt: 60, icon: '🟢' }, { icon: '🔴', color: 'red' }] },
        ],
      },
    });
    makeFs({ [CONFIG_PATH]: configJson });

    vi.mocked(execBg).mockResolvedValueOnce({
      kind: 'ok', stdout: '95', truncated: false, exitCode: 0, durationMs: 5,
    });

    const result = await runWidgetCommand(argv('test', 'cpu'));

    expect(result.output).not.toMatch(/Parsed value|Matched tier/);
    expect(result.output).toMatch(/valueMap: ignored.*ansi/i);
  });

  it('passes env and cwd through to execBg, matching what the real background run uses', async () => {
    const configJson = JSON.stringify({
      customCommands: {
        enabled: true,
        commands: [
          { id: 'envy', command: ['echo', '$FOO'], line: 1, refreshMs: 5000, env: { FOO: 'bar' }, cwd: '/tmp' },
        ],
      },
    });
    makeFs({ [CONFIG_PATH]: configJson });

    vi.mocked(execBg).mockResolvedValueOnce({
      kind: 'ok', stdout: 'bar', truncated: false, exitCode: 0, durationMs: 5,
    });

    await runWidgetCommand(argv('test', 'envy'));

    expect(vi.mocked(execBg)).toHaveBeenCalledWith(
      expect.objectContaining({ env: { FOO: 'bar' }, cwd: '/tmp' }),
    );
  });
});

// ── logs ───────────────────────────────────────────────────────────────────

describe('lumira widget logs', () => {
  it('prints message when cache file does not exist', async () => {
    makeFs({});

    const result = await runWidgetCommand(argv('logs'));

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

    const result = await runWidgetCommand(argv('logs'));

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

    const result = await runWidgetCommand(argv('logs'));

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

    const result = await runWidgetCommand(argv('logs'));

    expect(result.output).toMatch(/cmd-a/);
    expect(result.output).toMatch(/cmd-b/);
    expect(result.output).toMatch(/output-a/);
    expect(result.output).toMatch(/output-b/);
  });
});

// ── unknown subcommand ─────────────────────────────────────────────────────

describe('lumira widget unknown subcommand', () => {
  it('prints help/usage and returns exitCode 1 for unknown subcommand', async () => {
    makeFs({});

    const result = await runWidgetCommand(argv('frobnicate'));

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/usage|unknown|help/i);
  });

  it('prints usage when no subcommand is given', async () => {
    makeFs({});

    const result = await runWidgetCommand(argv());

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/usage|help|list|enable|disable/i);
  });
});

// ── custom alias ───────────────────────────────────────────────────────────

describe('lumira custom (alias for widget)', () => {
  it('runs the exact same enable behavior, with "custom" in the usage/help text', async () => {
    makeFs({});

    const result = await runWidgetCommand(argvAs('custom', 'frobnicate'));

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('lumira custom <subcommand>');
  });

  it('invoked as widget, the usage text says "widget" instead', async () => {
    makeFs({});

    const result = await runWidgetCommand(argvAs('widget', 'frobnicate'));

    expect(result.output).toContain('lumira widget <subcommand>');
  });

  it('produces the same functional result for enable regardless of invoked name', async () => {
    const { written: writtenAsCustom } = makeFs({});
    await runWidgetCommand(argvAs('custom', 'enable'));
    const parsedAsCustom = JSON.parse(writtenAsCustom[CONFIG_PATH]);

    const { written: writtenAsWidget } = makeFs({});
    await runWidgetCommand(argvAs('widget', 'enable'));
    const parsedAsWidget = JSON.parse(writtenAsWidget[CONFIG_PATH]);

    expect(parsedAsCustom).toEqual(parsedAsWidget);
  });

  it('does not accept an arbitrary argv[2] as the printed name (whitelisted to widget/custom only)', async () => {
    makeFs({});

    const result = await runWidgetCommand(['node', 'lumira', '; rm -rf /', 'frobnicate']);

    expect(result.output).toContain('lumira widget <subcommand>');
    expect(result.output).not.toContain('rm -rf');
  });
});
