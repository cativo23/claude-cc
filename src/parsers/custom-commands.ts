import {
  readFileSync,
  statSync,
  openSync,
  writeSync,
  closeSync,
  renameSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type {
  CustomCommand,
  CustomCommandsConfig,
  OnErrorBehavior,
} from '../types.js';
import { execBg } from '../utils/exec-bg.js';

/**
 * Parser orchestrator for the Custom Command widget (issue #143).
 *
 * Render contract: this function MUST behave synchronously from the
 * renderer's perspective. It reads the on-disk cache, returns whatever it
 * has for each configured command, and triggers a fire-and-forget refresh
 * when an entry is stale. The renderer never waits on a child process.
 *
 * Security gates (defense in depth, beyond what config validation does):
 * - `enabled !== true` short-circuits everything (no spawn, no FS access).
 * - World-writable config file aborts (someone could have injected commands).
 */

export interface CustomCommandOutput {
  /** Matches CustomCommand.id from the config. */
  id: string;
  /** Text to render (may be empty when state = 'hidden'). */
  text: string;
  /** State the command is in — drives renderer styling. */
  state: 'ok' | 'stale' | 'timeout' | 'error' | 'never-ran' | 'hidden';
  /** When the cached output was captured (ms epoch); absent for never-ran/hidden. */
  capturedAt?: number;
}

export interface GetCustomCommandOutputsInput {
  config: CustomCommandsConfig;
  /** Lumira normalized envelope (JSON) to pipe via child stdin. */
  stdin: string;
  /** Path to the cache file. Defaults to ~/.cache/lumira/custom-commands.json. */
  cachePath?: string;
  /**
   * Path to the user's lumira config — required for the world-writable
   * safety gate. Required (not optional) so that no caller can accidentally
   * bypass the security check by forgetting to pass the path. If you truly
   * have no config file path (e.g. config came from defaults), pass an empty
   * string; the parser will fail-closed and return [].
   */
  configFilePath: string;
  /** Now override for deterministic tests. Defaults to Date.now(). */
  now?: number;
}

/** Persisted cache entry. `state` captures the prior run's outcome. */
interface CacheEntry {
  text: string;
  capturedAt: number;
  state: 'ok' | 'nonzero' | 'timeout';
}

type CacheMap = Record<string, CacheEntry>;

/** Tracks which commands are currently being refreshed in-process. Prevents
 * the renderer firing N parallel refreshes when called in a tight loop. */
const refreshInFlight = new Set<string>();

function readCacheFile(path: string): CacheMap {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: CacheMap = {};
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.text !== 'string') continue;
      if (typeof e.capturedAt !== 'number' || !Number.isFinite(e.capturedAt)) continue;
      const s = e.state;
      if (s !== 'ok' && s !== 'nonzero' && s !== 'timeout') continue;
      out[id] = { text: e.text, capturedAt: e.capturedAt, state: s };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Write the cache atomically: dump to a temp file with mode 0600 + exclusive
 * open, then rename into place. The exclusive open (`wx`) prevents racing
 * symlink-following attacks on the temp file. We swallow all errors — a
 * failed cache write must NEVER affect the renderer.
 */
function writeCacheFile(path: string, data: CacheMap): void {
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    // Random suffix (vs. process.pid) defeats symlink TOCTOU: an attacker can
    // no longer pre-create a symlink at a predictable path. `wx` open already
    // refuses to open existing files, but it follows pre-existing symlinks; a
    // random unguessable name keeps the attacker from creating the symlink in
    // the first place.
    const tmp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
    try { unlinkSync(tmp); } catch { /* not present */ }
    const fd = openSync(tmp, 'wx', 0o600);
    try {
      writeSync(fd, JSON.stringify(data));
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  } catch {
    /* cache write best-effort */
  }
}

/** Stat-based world-writable check. Returns true ⇒ unsafe, caller aborts. */
function isWorldWritable(path: string): boolean {
  try {
    const s = statSync(path);
    return (s.mode & 0o002) !== 0;
  } catch {
    // File missing → treat as safe (config layer wouldn't have parsed it).
    return false;
  }
}

/** Extract the last non-empty line of stderr, capped to N chars, for the
 * `output` fallback behavior. */
function lastStderrLine(stderr: string, cap = 120): string {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const last = lines.length === 0 ? '' : lines[lines.length - 1];
  return last.length > cap ? last.slice(0, cap) : last;
}

/** Map a cached entry into the render-facing output, applying onError/onTimeout. */
function applyFallback(
  cmd: CustomCommand,
  entry: CacheEntry | undefined,
): CustomCommandOutput {
  if (!entry) {
    // No cache. Surface the never-ran state mapped through onError so the
    // renderer knows what to draw on the first render after enabling.
    return mapBehavior(cmd, cmd.onError, undefined, 'never-ran');
  }
  if (entry.state === 'ok') {
    return { id: cmd.id, text: entry.text, state: 'ok', capturedAt: entry.capturedAt };
  }
  if (entry.state === 'timeout') {
    return mapBehavior(cmd, cmd.onTimeout, entry, 'timeout');
  }
  // nonzero exit
  return mapBehavior(cmd, cmd.onError, entry, 'error');
}

function mapBehavior(
  cmd: CustomCommand,
  behavior: OnErrorBehavior,
  entry: CacheEntry | undefined,
  failureState: 'timeout' | 'error' | 'never-ran',
): CustomCommandOutput {
  switch (behavior) {
    case 'hide':
      return { id: cmd.id, text: '', state: 'hidden' };
    case 'placeholder': {
      const text = failureState === 'timeout' ? '…' : '?';
      return { id: cmd.id, text, state: failureState === 'never-ran' ? 'error' : failureState };
    }
    case 'stale':
      if (entry && entry.text.length > 0) {
        return {
          id: cmd.id,
          text: entry.text,
          state: failureState === 'never-ran' ? 'error' : failureState,
          capturedAt: entry.capturedAt,
        };
      }
      return { id: cmd.id, text: '', state: 'hidden' };
    case 'output':
      if (entry && entry.text.length > 0) {
        return {
          id: cmd.id,
          text: entry.text,
          state: failureState === 'never-ran' ? 'error' : failureState,
          capturedAt: entry.capturedAt,
        };
      }
      return { id: cmd.id, text: '', state: 'hidden' };
  }
}

/**
 * Fire-and-forget background refresh. Spawns the command, writes the result
 * into the cache file. Errors are swallowed — the renderer doesn't care.
 *
 * `inFlightKey` prevents the same id from racing itself if the renderer is
 * invoked twice within a single Node process before the first refresh lands.
 */
function fireRefresh(
  cmd: CustomCommand,
  stdin: string,
  cachePath: string,
  now: () => number,
): void {
  if (refreshInFlight.has(cmd.id)) return;
  refreshInFlight.add(cmd.id);

  // Detached from the call site — we don't await this and we don't surface errors.
  void (async (): Promise<void> => {
    try {
      const result = await execBg({
        command: cmd.command,
        timeoutMs: cmd.timeoutMs,
        maxBytes: cmd.maxBytes,
        env: cmd.env,
        cwd: cmd.cwd,
        stdin,
      });

      let entry: CacheEntry;
      switch (result.kind) {
        case 'ok':
          entry = { text: result.stdout, capturedAt: now(), state: 'ok' };
          break;
        case 'timeout':
          entry = { text: result.stdout, capturedAt: now(), state: 'timeout' };
          break;
        case 'nonzero': {
          // Honor onError: 'output' by storing the last stderr line; other
          // behaviors will still see this entry as `nonzero` and choose to
          // hide / placeholder / use stale, but `output` will surface text.
          const text = cmd.onError === 'output' ? lastStderrLine(result.stderr) : result.stdout;
          entry = { text, capturedAt: now(), state: 'nonzero' };
          break;
        }
        case 'spawn-error':
          entry = { text: '', capturedAt: now(), state: 'nonzero' };
          break;
      }

      // Read-modify-write the cache so concurrent commands don't clobber each
      // other's entries. The renamesync at the end is atomic on POSIX.
      const current = readCacheFile(cachePath);
      current[cmd.id] = entry;
      writeCacheFile(cachePath, current);
    } catch {
      /* swallow — render must never break */
    } finally {
      refreshInFlight.delete(cmd.id);
    }
  })();
}

export async function getCustomCommandOutputs(
  input: GetCustomCommandOutputsInput,
): Promise<CustomCommandOutput[]> {
  const { config } = input;
  // Security gate #1: opt-in required.
  if (!config || config.enabled !== true) return [];

  // Security gate #2: refuse to run if no config path was supplied (callers
  // must explicitly pass one — bypassing the gate by omission is not OK)
  // or if the supplied config file is world-writable.
  if (typeof input.configFilePath !== 'string' || input.configFilePath.length === 0) return [];
  if (isWorldWritable(input.configFilePath)) return [];

  if (!Array.isArray(config.commands) || config.commands.length === 0) return [];

  const cachePath = input.cachePath;
  if (typeof cachePath !== 'string' || cachePath.length === 0) {
    // Without a cache path we can't store anything. Return never-ran outputs
    // per command without spawning (no place to write the result).
    return config.commands.map((cmd) => applyFallback(cmd, undefined));
  }

  const cache = readCacheFile(cachePath);
  const now = typeof input.now === 'number' ? input.now : Date.now();
  const nowFn = (): number => (typeof input.now === 'number' ? input.now : Date.now());

  const outputs: CustomCommandOutput[] = [];
  for (const cmd of config.commands) {
    const entry = cache[cmd.id];
    const isStale = !entry || now - entry.capturedAt >= cmd.refreshMs;

    outputs.push(applyFallback(cmd, entry));

    if (isStale) {
      fireRefresh(cmd, input.stdin, cachePath, nowFn);
    }
  }

  return outputs;
}

/** Test-only — clears the in-process refresh-in-flight tracker. */
export function _resetRefreshState(): void {
  refreshInFlight.clear();
}
