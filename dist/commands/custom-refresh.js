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
import { isAbsolute } from 'node:path';
import { readCacheFile, writeCacheFile } from '../utils/custom-cache.js';
import { toSingleLine } from '../utils/format.js';
function isValidSpec(raw) {
    if (!raw || typeof raw !== 'object')
        return false;
    const s = raw;
    if (typeof s.id !== 'string' || s.id.length === 0)
        return false;
    if (!Array.isArray(s.command) || s.command.length === 0)
        return false;
    if (!s.command.every((x) => typeof x === 'string' && x.length > 0))
        return false;
    if (typeof s.timeoutMs !== 'number' || !Number.isFinite(s.timeoutMs) || s.timeoutMs > 2000)
        return false;
    if (typeof s.maxBytes !== 'number' || !Number.isFinite(s.maxBytes) || s.maxBytes > 4096)
        return false;
    if (typeof s.onError !== 'string')
        return false;
    if (typeof s.cachePath !== 'string' || s.cachePath.length === 0 || !isAbsolute(s.cachePath))
        return false;
    return true;
}
/**
 * Read the JSON spec from stdin, run the command via execBg, persist the
 * result. Never throws — every failure path returns silently.
 */
export async function runCustomRefresh(stdinPayload) {
    let spec;
    try {
        const parsed = JSON.parse(stdinPayload);
        if (!isValidSpec(parsed))
            return;
        spec = parsed;
    }
    catch {
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
        let entry;
        switch (result.kind) {
            case 'ok':
                entry = { text: toSingleLine(result.stdout), capturedAt: now, state: 'ok' };
                break;
            case 'timeout':
                entry = { text: toSingleLine(result.stdout), capturedAt: now, state: 'timeout' };
                break;
            case 'nonzero': {
                // For onError:'output' the renderer shows entry.text directly, so
                // store stdout (partial output before the command failed). For all
                // other strategies the text is not displayed — store stdout anyway
                // so the entry is useful if the strategy is later changed.
                entry = { text: toSingleLine(result.stdout), capturedAt: now, state: 'nonzero' };
                break;
            }
            case 'spawn-error':
                entry = { text: '', capturedAt: now, state: 'nonzero' };
                break;
        }
        const current = readCacheFile(spec.cachePath);
        current[spec.id] = entry;
        writeCacheFile(spec.cachePath, current);
    }
    catch {
        /* swallow — helper must never crash visibly */
    }
}
/**
 * CLI entrypoint used by the renderer. Reads stdin to EOF, then runs.
 * Wrapped in a Promise so the caller can await before exiting.
 */
export async function runCustomRefreshFromStdin() {
    const chunks = [];
    try {
        await new Promise((resolve) => {
            process.stdin.on('data', (chunk) => chunks.push(chunk));
            process.stdin.on('end', () => resolve());
            process.stdin.on('error', () => resolve());
        });
    }
    catch {
        return;
    }
    const payload = Buffer.concat(chunks).toString('utf8');
    await runCustomRefresh(payload);
}
//# sourceMappingURL=custom-refresh.js.map