/**
 * Shared cache IO for the Custom Command widget (issue #143).
 *
 * Both the parser (src/parsers/custom-commands.ts, read-only) and the
 * refresh helper (src/commands/custom-refresh.ts, read+write) used to
 * duplicate these types and functions verbatim. This module is the single
 * source of truth.
 */
import { lstatSync, readFileSync, mkdirSync, openSync, writeSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
/**
 * Symlink-safe cache read. Returns an empty map when the file is missing,
 * is a symlink (security guard), or contains malformed JSON.
 */
export function readCacheFile(path) {
    try {
        // Symlink-safe: lstat first and refuse to read if the cache path itself
        // is a symlink. Otherwise an attacker who can write into the cache dir
        // could redirect our read to a file they control, then watch the cache
        // contents leak into the rendered statusline.
        try {
            const st = lstatSync(path);
            if (st.isSymbolicLink())
                return {};
        }
        catch {
            // File does not exist (or stat failed) — fall through; readFileSync
            // below will return an empty cache via its catch block.
        }
        const raw = readFileSync(path, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return {};
        const out = {};
        for (const [id, entry] of Object.entries(parsed)) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry))
                continue;
            const e = entry;
            if (typeof e.text !== 'string')
                continue;
            if (typeof e.capturedAt !== 'number' || !Number.isFinite(e.capturedAt))
                continue;
            const s = e.state;
            if (s !== 'ok' && s !== 'nonzero' && s !== 'timeout')
                continue;
            out[id] = { text: e.text, capturedAt: e.capturedAt, state: s };
        }
        return out;
    }
    catch {
        return {};
    }
}
/** Atomic cache write with random temp-file name. */
export function writeCacheFile(path, data) {
    try {
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        const tmp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
        try {
            unlinkSync(tmp);
        }
        catch { /* not present */ }
        const fd = openSync(tmp, 'wx', 0o600);
        try {
            writeSync(fd, JSON.stringify(data));
        }
        finally {
            closeSync(fd);
        }
        renameSync(tmp, path);
    }
    catch {
        /* cache write best-effort */
    }
}
//# sourceMappingURL=custom-cache.js.map