import { readFileSync, statSync, unlinkSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';

export function readTtlCache<T>(key: string, dir: string, ttlMs: number = 5000): T | null {
  const filePath = join(dir, `claude-cc-${key}.json`);
  try {
    const stat = statSync(filePath);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch { return null; }
}

export function writeTtlCache(key: string, data: unknown, dir: string): void {
  const filePath = join(dir, `claude-cc-${key}.json`);
  try {
    // Remove existing file first (prevents symlink following)
    try { unlinkSync(filePath); } catch {}
    // Write with exclusive flag
    const fd = openSync(filePath, 'wx', 0o600);
    writeSync(fd, JSON.stringify(data));
    closeSync(fd);
  } catch {}
}

export interface MtimeState {
  mtime: number;
  size: number;
}

export function isMtimeFresh(filePath: string, cached: MtimeState): boolean {
  try {
    const stat = statSync(filePath);
    return stat.mtimeMs === cached.mtime && stat.size === cached.size;
  } catch { return false; }
}

export function getMtimeState(filePath: string): MtimeState | null {
  try {
    const stat = statSync(filePath);
    return { mtime: stat.mtimeMs, size: stat.size };
  } catch { return null; }
}
