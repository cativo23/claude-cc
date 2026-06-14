import { spawn } from 'node:child_process';
/** Pass-through env keys that should remain available to user commands. */
const CURATED_ENV_KEYS = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TZ', 'TERM'];
/** Grace window between SIGTERM and SIGKILL when force-killing on timeout. */
const SIGKILL_GRACE_MS = 200;
/** Max stderr we retain — keep it small; renderer only shows tail. */
const STDERR_CAP_BYTES = 1024;
function buildEnv(userEnv) {
    const out = {};
    for (const key of CURATED_ENV_KEYS) {
        const v = process.env[key];
        if (typeof v === 'string')
            out[key] = v;
    }
    if (userEnv) {
        for (const [k, v] of Object.entries(userEnv)) {
            if (typeof k === 'string' && k.length > 0 && typeof v === 'string') {
                out[k] = v;
            }
        }
    }
    return out;
}
/**
 * Best-effort group kill. We rely on `detached: true` at spawn so the child
 * leads its own process group; `process.kill(-pid, sig)` then reaches every
 * descendant. If the negative-pid form fails (process already gone or we're
 * on a platform that rejects it), fall back to the direct pid as a courtesy.
 */
function groupKill(pid, signal) {
    if (typeof pid !== 'number' || !Number.isFinite(pid))
        return;
    try {
        process.kill(-pid, signal);
    }
    catch {
        try {
            process.kill(pid, signal);
        }
        catch {
            /* already gone */
        }
    }
}
export async function execBg(input) {
    const start = Date.now();
    const elapsed = () => Date.now() - start;
    if (!Array.isArray(input.command) || input.command.length === 0) {
        return { kind: 'spawn-error', message: 'empty command', durationMs: elapsed() };
    }
    const [cmd, ...args] = input.command;
    const env = buildEnv(input.env);
    const cwd = input.cwd ?? process.cwd();
    return new Promise((resolve) => {
        let settled = false;
        let stdout = '';
        let stdoutBytes = 0;
        let stderr = '';
        let stderrBytes = 0;
        let truncated = false;
        let timedOut = false;
        let timeoutTimer = null;
        let killTimer = null;
        const settle = (result) => {
            if (settled)
                return;
            settled = true;
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
                timeoutTimer = null;
            }
            if (killTimer) {
                clearTimeout(killTimer);
                killTimer = null;
            }
            resolve(result);
        };
        let child;
        try {
            child = spawn(cmd, args, {
                cwd,
                env,
                detached: true,
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'spawn failed';
            settle({ kind: 'spawn-error', message, durationMs: elapsed() });
            return;
        }
        // Pipe stdin if provided. Swallow EPIPE — the child may have exited
        // before consuming everything.
        if (child.stdin) {
            child.stdin.on('error', () => { });
            if (typeof input.stdin === 'string') {
                try {
                    child.stdin.write(input.stdin);
                }
                catch { /* ignore */ }
            }
            try {
                child.stdin.end();
            }
            catch { /* ignore */ }
        }
        // Schedule SIGKILL after SIGTERM grace, clearing any previously scheduled
        // SIGKILL first. Without the clear, a byte-cap kill followed by a wall-time
        // kill (or vice versa) orphans the earlier timer — the SIGKILL we lose
        // reference to fires unconditionally and can't be cancelled by settle().
        const scheduleSigkill = () => {
            if (killTimer)
                clearTimeout(killTimer);
            killTimer = setTimeout(() => groupKill(child.pid, 'SIGKILL'), SIGKILL_GRACE_MS);
        };
        if (child.stdout) {
            child.stdout.on('data', (chunk) => {
                if (truncated)
                    return;
                const remaining = input.maxBytes - stdoutBytes;
                if (chunk.length <= remaining) {
                    stdout += chunk.toString('utf8');
                    stdoutBytes += chunk.length;
                    if (stdoutBytes >= input.maxBytes) {
                        truncated = true;
                        groupKill(child.pid, 'SIGTERM');
                        scheduleSigkill();
                    }
                }
                else {
                    stdout += chunk.slice(0, remaining).toString('utf8');
                    stdoutBytes = input.maxBytes;
                    truncated = true;
                    groupKill(child.pid, 'SIGTERM');
                    scheduleSigkill();
                }
            });
            child.stdout.on('error', () => { });
        }
        if (child.stderr) {
            child.stderr.on('data', (chunk) => {
                if (stderrBytes >= STDERR_CAP_BYTES)
                    return;
                const remaining = STDERR_CAP_BYTES - stderrBytes;
                const slice = chunk.length <= remaining ? chunk : chunk.slice(0, remaining);
                stderr += slice.toString('utf8');
                stderrBytes += slice.length;
            });
            child.stderr.on('error', () => { });
        }
        // Wall-clock timeout — group-kill then SIGKILL after grace.
        timeoutTimer = setTimeout(() => {
            timedOut = true;
            groupKill(child.pid, 'SIGTERM');
            scheduleSigkill();
        }, input.timeoutMs);
        child.on('error', (err) => {
            // Spawn-level failure (ENOENT, EACCES, ...). Only treat as spawn-error
            // before exit fires; after exit, errors are usually post-close noise.
            if (settled)
                return;
            settle({ kind: 'spawn-error', message: err.message || String(err.code ?? 'spawn error'), durationMs: elapsed() });
        });
        child.on('close', (code) => {
            if (settled)
                return;
            if (timedOut) {
                settle({ kind: 'timeout', stdout, durationMs: elapsed() });
                return;
            }
            if (code === 0) {
                settle({ kind: 'ok', stdout, truncated, exitCode: 0, durationMs: elapsed() });
                return;
            }
            // Non-zero or killed-by-signal (code === null) → treat as non-zero with
            // best-effort exit code. -1 signals "killed without numeric exit".
            const exitCode = typeof code === 'number' ? code : -1;
            settle({ kind: 'nonzero', stdout, stderr, exitCode, durationMs: elapsed() });
        });
    });
}
//# sourceMappingURL=exec-bg.js.map