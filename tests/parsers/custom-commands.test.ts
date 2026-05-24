import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getCustomCommandOutputs,
  _setRefreshStrategy,
  _resetRefreshState,
} from '../../src/parsers/custom-commands.js';
import { runCustomRefresh } from '../../src/commands/custom-refresh.js';
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

  // Track in-flight in-process refreshes so tests can wait on them. The
  // production strategy spawns a detached child process, which is great for
  // the renderer's exit time but lousy for deterministic test assertions —
  // we swap in an in-process strategy that drives runCustomRefresh directly
  // and records the resulting Promise so tests can await completion.
  const pendingRefreshes: Promise<void>[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lumira-custom-cmds-'));
    cachePath = join(dir, 'custom-commands.json');
    configPath = join(dir, 'config.json');
    writeFileSync(configPath, '{}', { mode: 0o600 });

    // I4: reset module-level state so tests don't leak refresh-in-flight
    // markers between cases.
    _resetRefreshState();
    pendingRefreshes.length = 0;

    _setRefreshStrategy((spec) => {
      // Serialize the spec exactly like the production strategy would, then
      // hand it to runCustomRefresh in-process. We don't await here (caller
      // is fire-and-forget) but we DO record the promise so tests that
      // care about completion can await it.
      const p = runCustomRefresh(JSON.stringify(spec)).catch(() => {});
      pendingRefreshes.push(p);
    });
  });
  afterEach(async () => {
    await Promise.all(pendingRefreshes).catch(() => {});
    _setRefreshStrategy(undefined);
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
    // H1: a past-refreshMs `ok` entry serves cached text but with state =
    // 'stale' (not 'ok') so the renderer can dim it while the bg refresh runs.
    expect(result[0].state).toBe('stale');

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

  // M2: clock-skew defensive clamp. If the system clock jumps backwards (NTP
  // correction, suspend/resume, manual change), `now - capturedAt` becomes a
  // large negative number. The clamp ensures we treat it as age=0 (still
  // fresh) rather than negative — no negative durations leaking into renderer
  // metadata, no weird isStale semantics. The entry is returned cleanly.
  it('does not crash or misbehave on future capturedAt (clock-skew clamp)', async () => {
    const cmd = makeCmd({ id: 'skew', refreshMs: 5000 });
    writeFileSync(cachePath, JSON.stringify({
      [cmd.id]: { text: 'cached-during-skew', capturedAt: FIXED_NOW + 60_000, state: 'ok' },
    }), { mode: 0o600 });

    const result = await getCustomCommandOutputs({
      config: makeConfig([cmd]),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW, // "earlier" than capturedAt → would compute negative age without clamp
    });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('cached-during-skew');
    expect(result[0].state).toBe('ok');
    // No crash, no weird state — just treats it as fresh.
  });

  // H2: each output carries renderer-facing metadata (line/label/color/ansi)
  // copied from the source CustomCommand. Phase 3 renderers need this and
  // shouldn't have to maintain a separate id→cmd map.
  it('propagates line / label / color / ansi from CustomCommand onto every output', async () => {
    const okCmd = makeCmd({
      id: 'ok-meta',
      command: ['node', '-e', "process.stdout.write('hi')"],
      line: 3,
      label: 'k8s:',
      color: 'cyan',
      ansi: true,
      refreshMs: 5000,
    });
    const hiddenCmd = makeCmd({
      id: 'hidden-meta',
      line: 2,
      label: 'gone',
      color: 'red',
      ansi: false,
      onError: 'hide',
    });
    writeFileSync(cachePath, JSON.stringify({
      [okCmd.id]: { text: 'cached', capturedAt: FIXED_NOW - 100, state: 'ok' },
    }), { mode: 0o600 });

    const result = await getCustomCommandOutputs({
      config: makeConfig([okCmd, hiddenCmd]),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW,
    });
    expect(result).toHaveLength(2);
    // ok entry — full metadata
    expect(result[0].id).toBe('ok-meta');
    expect(result[0].state).toBe('ok');
    expect(result[0].line).toBe(3);
    expect(result[0].label).toBe('k8s:');
    expect(result[0].color).toBe('cyan');
    expect(result[0].ansi).toBe(true);
    // hidden entry — metadata still populated even when text is empty
    expect(result[1].id).toBe('hidden-meta');
    expect(result[1].state).toBe('hidden');
    expect(result[1].line).toBe(2);
    expect(result[1].label).toBe('gone');
    expect(result[1].color).toBe('red');
    expect(result[1].ansi).toBe(false);
  });

  // M4: symlink-safe cache read. If an attacker can write into the cache dir
  // they could replace our cache file with a symlink targeting attacker-
  // controlled content. We refuse to read symlinked cache files.
  it('returns no cached data when cache file is a symlink (refuses to follow)', async () => {
    const cmd = makeCmd({ id: 'symlink-target', onError: 'placeholder' });
    // Create the real file with what would look like a cached entry…
    const realPath = join(dir, 'real-cache.json');
    writeFileSync(realPath, JSON.stringify({
      [cmd.id]: { text: 'leaked', capturedAt: FIXED_NOW, state: 'ok' },
    }), { mode: 0o600 });
    // …then symlink cachePath at it. The parser must refuse to follow.
    symlinkSync(realPath, cachePath);

    const result = await getCustomCommandOutputs({
      config: makeConfig([cmd]),
      stdin: '{}',
      cachePath,
      configFilePath: configPath,
      now: FIXED_NOW,
    });
    expect(result).toHaveLength(1);
    // No entry surfaced (symlink read aborts → never-ran path).
    expect(result[0].text).toBe('?');
    expect(result[0].state).toBe('error');
  });
});
