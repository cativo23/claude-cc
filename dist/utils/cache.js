import { readFileSync, statSync, unlinkSync, openSync, writeSync, closeSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { userInfo } from 'node:os';
function getUid() {
    if (process.getuid)
        return String(process.getuid());
    try {
        return userInfo().username ?? 'default';
    }
    catch {
        return 'default';
    }
}
function cacheDirPath(dir) {
    return join(dir, `lumira-${getUid()}`);
}
function ensureCacheDir(dir) {
    const cacheDir = cacheDirPath(dir);
    mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
    return cacheDir;
}
export function readTtlCache(key, dir, ttlMs = 5000) {
    const cacheDir = cacheDirPath(dir);
    const filePath = join(cacheDir, `${key}.json`);
    try {
        const stat = statSync(filePath);
        if (Date.now() - stat.mtimeMs > ttlMs)
            return null;
        return JSON.parse(readFileSync(filePath, 'utf8'));
    }
    catch {
        return null;
    }
}
export function writeTtlCache(key, data, dir) {
    const cacheDir = ensureCacheDir(dir);
    const filePath = join(cacheDir, `${key}.json`);
    try {
        // Remove existing file first (prevents symlink following)
        try {
            unlinkSync(filePath);
        }
        catch { }
        // Write with exclusive flag
        const fd = openSync(filePath, 'wx', 0o600);
        writeSync(fd, JSON.stringify(data));
        closeSync(fd);
    }
    catch { }
}
export function isMtimeFresh(filePath, cached) {
    try {
        const stat = statSync(filePath);
        return stat.mtimeMs === cached.mtime && stat.size === cached.size;
    }
    catch {
        return false;
    }
}
export function getMtimeState(filePath) {
    try {
        const stat = statSync(filePath);
        return { mtime: stat.mtimeMs, size: stat.size };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=cache.js.map