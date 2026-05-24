import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCustomCommandOutputs } from '../../src/parsers/custom-commands.js';
import type { CustomCommand, CustomCommandsConfig } from '../../src/types.js';

const FIXED_NOW = 1_700_000_000_000;

function makeCmd(overrides: Partial<CustomCommand> = {}): CustomCommand {
  return {
    id: 'test-cmd',
    command: ['node', '-e', "process.stdout.write('hello')"],
    line: 1,
    refreshMs: 5000,
    timeoutMs: 1500,
    maxBytes: 256,
    onError: 'hide',
    onTimeout: 'stale',
    ansi: false,
    ...overrides,
  };
}

function makeConfig(commands: CustomCommand[], enabled = true): CustomCommandsConfig {
  return { enabled, commands };
}

/** Wait briefly while polling a predicate. Used to wait for fire-and-forget refresh. */
async function waitFor(pred: () => boolean, timeoutMs = 2500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('getCustomCommandOutputs', () => {
  let dir: string;
  let cachePath: string;
  let configPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lumira-custom-cmds-'));
    cachePath = join(dir, 'custom-commands.json');
    configPath = join(dir, 'config.json');
    writeFileSync(configPath, '{}', { mode: 0o600 });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns [] when disabled (no spawn, no file access)', async () => {
    const cmd = makeCmd();
    const result = await getCustomCommandOutputs({
      config: makeConfig([cmd], false),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW,
    });
    expect(result).toEqual([]);
    expect(existsSync(cachePath)).toBe(false);
  });

  it('returns cached entry without spawning when within refreshMs', async () => {
    const cmd = makeCmd({ refreshMs: 5000 });
    writeFileSync(cachePath, JSON.stringify({
      [cmd.id]: { text: 'cached-text', capturedAt: FIXED_NOW - 1000, state: 'ok' },
    }), { mode: 0o600 });

    const result = await getCustomCommandOutputs({
      config: makeConfig([cmd]),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW,
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(cmd.id);
    expect(result[0].text).toBe('cached-text');
    expect(result[0].state).toBe('ok');
  }, 5000);

  it('returns stale entry and triggers background refresh when refreshMs exceeded', async () => {
    const cmd = makeCmd({
      id: 'refresh-me',
      command: ['node', '-e', "process.stdout.write('fresh')"],
      refreshMs: 5000,
    });
    writeFileSync(cachePath, JSON.stringify({
      [cmd.id]: { text: 'old-text', capturedAt: FIXED_NOW - 10_000, state: 'ok' },
    }), { mode: 0o600 });

    const result = await getCustomCommandOutputs({
      config: makeConfig([cmd]),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW,
    });

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('old-text');

    // Wait for fire-and-forget refresh to land on disk.
    await waitFor(() => {
      try {
        const raw = JSON.parse(readFileSync(cachePath, 'utf8'));
        return raw[cmd.id]?.text === 'fresh';
      } catch { return false; }
    });
    const final = JSON.parse(readFileSync(cachePath, 'utf8'));
    expect(final[cmd.id].text).toBe('fresh');
    expect(final[cmd.id].state).toBe('ok');
  }, 5000);

  it('maps never-ran to placeholder when onError = placeholder', async () => {
    const cmd = makeCmd({ id: 'no-cache', onError: 'placeholder' });
    const result = await getCustomCommandOutputs({
      config: makeConfig([cmd]),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW,
    });
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('error');
    expect(result[0].text).toBe('?');
  }, 5000);

  it('maps never-ran to hidden when onError = hide', async () => {
    const cmd = makeCmd({ id: 'no-cache-hide', onError: 'hide' });
    const result = await getCustomCommandOutputs({
      config: makeConfig([cmd]),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW,
    });
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('hidden');
    expect(result[0].text).toBe('');
  }, 5000);

  it('returns [] when config file is world-writable', async () => {
    chmodSync(configPath, 0o666);
    try {
      const result = await getCustomCommandOutputs({
        config: makeConfig([makeCmd()]),
        stdin: '{}',
        cachePath,
        configFilePath: configPath,
        now: FIXED_NOW,
      });
      expect(result).toEqual([]);
    } finally {
      chmodSync(configPath, 0o600);
    }
  });

  // I3: fail-closed if configFilePath is missing/empty so a caller can never
  // accidentally evaporate the world-writable safety gate by omission.
  it('returns [] when configFilePath is the empty string (fail-closed)', async () => {
    const result = await getCustomCommandOutputs({
      config: makeConfig([makeCmd()]),
      stdin: '{}',
      cachePath,
      configFilePath: '',
      now: FIXED_NOW,
    });
    expect(result).toEqual([]);
    expect(existsSync(cachePath)).toBe(false);
  });

  it('respects onTimeout=stale — returns cached text from previous timeout entry', async () => {
    const cmd = makeCmd({ id: 'timeout-cmd', onTimeout: 'stale', refreshMs: 5000 });
    writeFileSync(cachePath, JSON.stringify({
      [cmd.id]: { text: 'last-good', capturedAt: FIXED_NOW - 1000, state: 'timeout' },
    }), { mode: 0o600 });

    const result = await getCustomCommandOutputs({
      config: makeConfig([cmd]),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW,
    });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('last-good');
    // state should reflect timeout
    expect(result[0].state).toBe('timeout');
  }, 5000);

  it('respects onTimeout=hide on cached timeout entry', async () => {
    const cmd = makeCmd({ id: 'timeout-hide', onTimeout: 'hide', refreshMs: 5000 });
    writeFileSync(cachePath, JSON.stringify({
      [cmd.id]: { text: 'last-good', capturedAt: FIXED_NOW - 1000, state: 'timeout' },
    }), { mode: 0o600 });

    const result = await getCustomCommandOutputs({
      config: makeConfig([cmd]),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW,
    });
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('hidden');
    expect(result[0].text).toBe('');
  }, 5000);

  it('preserves declared order across mixed fresh/stale/never-ran states', async () => {
    const fresh = makeCmd({ id: 'a-fresh', refreshMs: 5000 });
    const stale = makeCmd({ id: 'b-stale', refreshMs: 5000 });
    const newCmd = makeCmd({ id: 'c-new', refreshMs: 5000, onError: 'placeholder' });

    writeFileSync(cachePath, JSON.stringify({
      [fresh.id]: { text: 'aaa', capturedAt: FIXED_NOW - 500, state: 'ok' },
      [stale.id]: { text: 'bbb', capturedAt: FIXED_NOW - 10_000, state: 'ok' },
    }), { mode: 0o600 });

    const result = await getCustomCommandOutputs({
      config: makeConfig([fresh, stale, newCmd]),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW,
    });

    expect(result.map((r) => r.id)).toEqual(['a-fresh', 'b-stale', 'c-new']);
    expect(result[0].text).toBe('aaa');
    expect(result[1].text).toBe('bbb'); // stale returned immediately
    expect(result[2].text).toBe('?'); // never-ran + placeholder
  }, 5000);

  it('background refresh writes cache after spawn completes', async () => {
    const cmd = makeCmd({
      id: 'bg-refresh',
      command: ['node', '-e', "process.stdout.write('hello')"],
    });
    expect(existsSync(cachePath)).toBe(false);

    const first = await getCustomCommandOutputs({
      config: makeConfig([cmd]),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW,
    });
    // No cache → never-ran (hide by default since onError defaults to 'hide').
    expect(first).toHaveLength(1);
    expect(first[0].state).toBe('hidden');

    await waitFor(() => {
      try {
        const raw = JSON.parse(readFileSync(cachePath, 'utf8'));
        return raw[cmd.id]?.text === 'hello';
      } catch { return false; }
    });
    const written = JSON.parse(readFileSync(cachePath, 'utf8'));
    expect(written[cmd.id].text).toBe('hello');
    expect(written[cmd.id].state).toBe('ok');
    expect(typeof written[cmd.id].capturedAt).toBe('number');
  }, 5000);

  it('treats malformed cache file as empty (no crash)', async () => {
    writeFileSync(cachePath, 'not-json-at-all', { mode: 0o600 });
    const cmd = makeCmd({ id: 'garbage-cache', onError: 'placeholder' });
    const result = await getCustomCommandOutputs({
      config: makeConfig([cmd]),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW,
    });
    expect(result).toHaveLength(1);
    expect(result[0].state).toBe('error');
    expect(result[0].text).toBe('?');
  });
});
