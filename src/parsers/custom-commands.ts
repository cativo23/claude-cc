import {
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type {
  CustomCommand,
  CustomCommandsConfig,
  CustomCommandValueTier,
  OnErrorBehavior,
  RefreshSpec,
} from '../types.js';
import { readCacheFile, type CacheEntry, type CacheMap } from '../utils/custom-cache.js';

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

/**
 * State emitted to the renderer.
 *  - `ok`      — cached output present and within refreshMs.
 *  - `stale`   — cached output present but past refreshMs; a background
 *                refresh has just been kicked off. Renderer can dim the
 *                text or render the previous value unchanged.
 *  - `timeout` — last run hit wall-clock timeout (onTimeout governs text).
 *  - `error`   — last run exited non-zero, spawn failed, or never-ran with
 *                onError != 'hide' (onError governs text).
 *  - `hidden`  — nothing should be rendered (empty text). Either explicit
 *                onError/onTimeout = 'hide', or no cached entry + onError =
 *                'hide' (collapses the old 'never-ran' state — same UI).
 */
export type CustomCommandState = 'ok' | 'stale' | 'timeout' | 'error' | 'hidden';

export interface CustomCommandOutput {
  /** Matches CustomCommand.id from the config. */
  id: string;
  /** Text to render (may be empty when state = 'hidden'). */
  text: string;
  /** State the command is in — drives renderer styling. */
  state: CustomCommandState;
  /** When the cached output was captured (ms epoch); absent when no cache entry. */
  capturedAt?: number;
  // ── Rendering metadata (copied from the CustomCommand config) ─────
  // These are propagated here so renderers don't have to maintain a
  // separate id→cmd lookup just to know which line / color / glyph to use.
  /** Which statusline line to render on. */
  line: 1 | 2 | 3 | 4;
  /** Optional prefix label/glyph. */
  label?: string;
  /** Optional color (applied only when ansi = false). */
  color?: CustomCommand['color'];
  /** True if the command's stdout already contains ANSI escapes. */
  ansi: boolean;
  /** Value→icon/color tiers (custom widgets). Undefined when not configured. */
  valueMap?: CustomCommandValueTier[];
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

/** Tracks which commands are currently being refreshed in-process. Prevents
 * the renderer firing N parallel refreshes when called in a tight loop. */
const refreshInFlight = new Set<string>();

/** Default cache file location when caller doesn't supply one. */
function defaultCachePath(): string {
  return join(homedir(), '.cache', 'lumira', 'custom-commands.json');
}

// Cache writes happen exclusively in the detached refresh helper (see
// src/commands/custom-refresh.ts) so the renderer process never has to
// wait on disk IO. This parser only ever reads.

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

/**
 * Build the base render-metadata fields common to every output. Renderers
 * consume these directly instead of joining the output back against the
 * CustomCommand list — keeps the contract self-contained.
 */
function renderMeta(cmd: CustomCommand): Pick<CustomCommandOutput, 'line' | 'label' | 'color' | 'ansi' | 'valueMap'> {
  const meta: Pick<CustomCommandOutput, 'line' | 'label' | 'color' | 'ansi' | 'valueMap'> = {
    line: cmd.line,
    ansi: cmd.ansi,
  };
  if (cmd.label !== undefined) meta.label = cmd.label;
  if (cmd.color !== undefined) meta.color = cmd.color;
  if (cmd.valueMap !== undefined) meta.valueMap = cmd.valueMap;
  return meta;
}

/** Map a cached entry into the render-facing output, applying onError/onTimeout. */
function applyFallback(
  cmd: CustomCommand,
  entry: CacheEntry | undefined,
): CustomCommandOutput {
  if (!entry) {
    // No cache entry. The "never-ran" state is collapsed into the regular
    // error/hidden mapping per onError — the renderer just sees `hidden`
    // or `error` and renders accordingly (drops the dead `never-ran` arm).
    return mapBehavior(cmd, cmd.onError, undefined, 'error');
  }
  if (entry.state === 'ok') {
    return { ...renderMeta(cmd), id: cmd.id, text: entry.text, state: 'ok', capturedAt: entry.capturedAt };
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
  failureState: 'timeout' | 'error',
): CustomCommandOutput {
  const meta = renderMeta(cmd);
  switch (behavior) {
    case 'hide':
      return { ...meta, id: cmd.id, text: '', state: 'hidden' };
    case 'placeholder': {
      const text = failureState === 'timeout' ? '…' : '?';
      return { ...meta, id: cmd.id, text, state: failureState };
    }
    case 'stale':
    case 'output':
      // `stale` and `output` differ semantically but produce the same
      // render: previous cached text if any, otherwise hidden. Keeping
      // them in one arm avoids the dead `failureState === 'stale'` ===
      // failureState pun the old code accidentally relied on.
      if (entry && entry.text.length > 0) {
        return {
          ...meta,
          id: cmd.id,
          text: entry.text,
          state: failureState,
          capturedAt: entry.capturedAt,
        };
      }
      return { ...meta, id: cmd.id, text: '', state: 'hidden' };
  }
}

/**
 * Promote an `ok` output to `stale` when the cache entry is past refreshMs.
 * Renderers can dim or annotate stale entries while a background refresh
 * is in flight. `hidden` / `timeout` / `error` are left alone — their
 * staleness is governed by the user's onError/onTimeout choice, not here.
 */
function markStale(out: CustomCommandOutput): CustomCommandOutput {
  if (out.state !== 'ok') return out;
  return { ...out, state: 'stale' };
}

function buildSpec(cmd: CustomCommand, stdin: string, cachePath: string): RefreshSpec {
  const spec: RefreshSpec = {
    id: cmd.id,
    command: cmd.command,
    timeoutMs: cmd.timeoutMs,
    maxBytes: cmd.maxBytes,
    onError: cmd.onError,
    cachePath,
    stdin,
  };
  if (cmd.env) spec.env = cmd.env;
  if (cmd.cwd) spec.cwd = cmd.cwd;
  return spec;
}

/**
 * Refresh strategy — how to actually kick off the background work for a
 * stale command. Default strategy spawns a detached lumira sub-process
 * running the `__custom-refresh` helper so that this Node process can
 * exit immediately (B1). Tests inject an in-process strategy that
 * awaits execBg directly for deterministic assertions.
 */
export type RefreshStrategy = (spec: RefreshSpec) => void;

/**
 * Default strategy: spawn `node <lumira-entry> __custom-refresh`, write the
 * spec to its stdin, then detach so the renderer's event loop unrefs the
 * child immediately. The helper runs the user command, writes the cache,
 * and exits — but the renderer no longer waits on any of that work.
 */
function defaultRefreshStrategy(spec: RefreshSpec): void {
  try {
    // The renderer is normally lumira's compiled entry (dist/index.js). When
    // run from tests/dev we are likely executing TS via tsx/loaders; the env
    // var lets the test harness override the entry it points to.
    const entry = process.env.LUMIRA_CUSTOM_REFRESH_ENTRY
      ?? fileURLToPath(new URL('../index.js', import.meta.url));
    const child = spawn(process.execPath, [entry, '__custom-refresh'], {
      detached: true,
      // stdin pipes the spec; stdout/stderr discarded so we don't keep the
      // event loop refed waiting on output from the helper.
      stdio: ['pipe', 'ignore', 'ignore'],
      windowsHide: true,
    });
    // Unref so the parent process can exit while the helper continues.
    child.unref();
    if (child.stdin) {
      child.stdin.on('error', () => { /* helper may exit before we finish writing */ });
      try { child.stdin.write(JSON.stringify(spec)); } catch { /* ignore */ }
      try { child.stdin.end(); } catch { /* ignore */ }
    }
  } catch {
    /* swallow — render must never break because a helper failed to spawn */
  }
}

let activeRefreshStrategy: RefreshStrategy = defaultRefreshStrategy;

/**
 * Test-only: swap the refresh strategy. Pass `undefined` to restore the
 * default detached-spawn behavior. Use the in-process strategy in tests
 * that need to observe cache writes deterministically.
 */
export function _setRefreshStrategy(strategy: RefreshStrategy | undefined): void {
  activeRefreshStrategy = strategy ?? defaultRefreshStrategy;
}

/**
 * Fire-and-forget background refresh. Delegates to the active strategy.
 * `refreshInFlight` prevents the same id from racing itself if the
 * renderer is invoked twice within one Node process.
 */
function fireRefresh(
  cmd: CustomCommand,
  stdin: string,
  cachePath: string,
): void {
  if (refreshInFlight.has(cmd.id)) return;
  refreshInFlight.add(cmd.id);
  try {
    activeRefreshStrategy(buildSpec(cmd, stdin, cachePath));
  } catch {
    /* defensive */
  } finally {
    // Note: detached strategy completes the work asynchronously in another
    // process, so refreshInFlight is cleared as soon as the spawn has been
    // dispatched. The cross-process semantics mean we no longer "know" when
    // the helper finishes — but that's fine: stale-while-refreshing is the
    // designed behavior, and the next render that sees a fresh cache entry
    // will switch from `stale` back to `ok`.
    refreshInFlight.delete(cmd.id);
  }
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

  // M1: apply the documented default when the caller omits cachePath, rather
  // than silently degrading to never-ran for every command. The default
  // matches the JSDoc on cachePath: ~/.cache/lumira/custom-commands.json.
  const cachePath = typeof input.cachePath === 'string' && input.cachePath.length > 0
    ? input.cachePath
    : defaultCachePath();

  const cache = readCacheFile(cachePath);
  const now = typeof input.now === 'number' ? input.now : Date.now();

  const outputs: CustomCommandOutput[] = [];
  for (const cmd of config.commands) {
    const entry = cache[cmd.id];
    // M2: clamp age to 0. If the system clock skews backwards (NTP correction,
    // suspend/resume, manual change), `now - capturedAt` could be negative and
    // the entry would look fresh forever. Math.max guarantees we only ever
    // treat past-captured entries as having age >= 0.
    const age = entry ? Math.max(0, now - entry.capturedAt) : Infinity;
    const isStale = !entry || age >= cmd.refreshMs;

    const base = applyFallback(cmd, entry);
    // Promote `ok` to `stale` when a refresh is about to fire — the renderer
    // can then dim the entry while the new value lands on disk.
    outputs.push(isStale ? markStale(base) : base);

    if (isStale) {
      fireRefresh(cmd, input.stdin, cachePath);
    }
  }

  return outputs;
}

/** Test-only — clears the in-process refresh-in-flight tracker. */
export function _resetRefreshState(): void {
  refreshInFlight.clear();
}
