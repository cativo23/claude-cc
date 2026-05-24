/**
 * Internal helper for the Custom Command widget (#143). Runs ONE custom
 * command and writes the result into the cache file. Intended to be
 * launched by the renderer as a detached child process so the renderer
 * itself can exit immediately without waiting on the spawned command
 * (B1: the original "fire and forget" via void async-IIFE still kept
 * the Node event loop refed because data listeners hold stdin/stdout
 * streams open until child exit + cache write).
 *
 * Wire protocol: a single JSON object on stdin describing the spawn
 * spec, cache path, and (optional) stdin envelope to forward to the
 * user command:
 *
 *   {
 *     "id": "k8s-context",
 *     "command": ["kubectl", "config", "current-context"],
 *     "timeoutMs": 1500,
 *     "maxBytes": 256,
 *     "env": { ... },           // optional
 *     "cwd": "/abs/path",       // optional
 *     "onError": "hide",        // 'hide' | 'placeholder' | 'output' | 'stale'
 *     "cachePath": "/abs/path/to/custom-commands.json",
 *     "stdin": "{}"             // optional
 *   }
 *
 * Errors are swallowed — this process must NEVER print to stdout or
 * crash visibly. The renderer doesn't read this process's exit code.
 */

import { execBg } from '../utils/exec-bg.js';
import {
  readFileSync,
  lstatSync,
  openSync,
  writeSync,
  closeSync,
  renameSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { OnErrorBehavior } from '../types.js';

interface RefreshSpec {
  id: string;
  command: string[];
  timeoutMs: number;
  maxBytes: number;
  env?: Record<string, string>;
  cwd?: string;
  onError: OnErrorBehavior;
  cachePath: string;
  stdin?: string;
}

interface CacheEntry {
  text: string;
  capturedAt: number;
  state: 'ok' | 'nonzero' | 'timeout';
}
type CacheMap = Record<string, CacheEntry>;

/** Symlink-safe cache read (mirrors the parser's readCacheFile). */
function readCacheFile(path: string): CacheMap {
  try {
    try {
      const st = lstatSync(path);
      if (st.isSymbolicLink()) return {};
    } catch { /* missing — fine */ }
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

/** Atomic cache write with random temp-file name (mirrors writeCacheFile). */
function writeCacheFile(path: string, data: CacheMap): void {
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
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

function lastStderrLine(stderr: string, cap = 120): string {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const last = lines.length === 0 ? '' : lines[lines.length - 1];
  return last.length > cap ? last.slice(0, cap) : last;
}

function isValidSpec(raw: unknown): raw is RefreshSpec {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== 'string' || s.id.length === 0) return false;
  if (!Array.isArray(s.command) || s.command.length === 0) return false;
  if (!s.command.every((x: unknown) => typeof x === 'string' && x.length > 0)) return false;
  if (typeof s.timeoutMs !== 'number' || !Number.isFinite(s.timeoutMs)) return false;
  if (typeof s.maxBytes !== 'number' || !Number.isFinite(s.maxBytes)) return false;
  if (typeof s.onError !== 'string') return false;
  if (typeof s.cachePath !== 'string' || s.cachePath.length === 0) return false;
  return true;
}

/**
 * Read the JSON spec from stdin, run the command via execBg, persist the
 * result. Never throws — every failure path returns silently.
 */
export async function runCustomRefresh(stdinPayload: string): Promise<void> {
  let spec: RefreshSpec;
  try {
    const parsed: unknown = JSON.parse(stdinPayload);
    if (!isValidSpec(parsed)) return;
    spec = parsed;
  } catch {
    return;
  }

  try {
    const result = await execBg({
      command: spec.command,
      timeoutMs: spec.timeoutMs,
      maxBytes: spec.maxBytes,
      env: spec.env,
      cwd: spec.cwd,
      stdin: spec.stdin,
    });

    const now = Date.now();
    let entry: CacheEntry;
    switch (result.kind) {
      case 'ok':
        entry = { text: result.stdout, capturedAt: now, state: 'ok' };
        break;
      case 'timeout':
        entry = { text: result.stdout, capturedAt: now, state: 'timeout' };
        break;
      case 'nonzero': {
        const text = spec.onError === 'output' ? lastStderrLine(result.stderr) : result.stdout;
        entry = { text, capturedAt: now, state: 'nonzero' };
        break;
      }
      case 'spawn-error':
        entry = { text: '', capturedAt: now, state: 'nonzero' };
        break;
    }

    const current = readCacheFile(spec.cachePath);
    current[spec.id] = entry;
    writeCacheFile(spec.cachePath, current);
  } catch {
    /* swallow — helper must never crash visibly */
  }
}

/**
 * CLI entrypoint used by the renderer. Reads stdin to EOF, then runs.
 * Wrapped in a Promise so the caller can await before exiting.
 */
export async function runCustomRefreshFromStdin(): Promise<void> {
  const chunks: Buffer[] = [];
  try {
    await new Promise<void>((resolve) => {
      process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
      process.stdin.on('end', () => resolve());
      process.stdin.on('error', () => resolve());
    });
  } catch {
    return;
  }
  const payload = Buffer.concat(chunks).toString('utf8');
  await runCustomRefresh(payload);
}
