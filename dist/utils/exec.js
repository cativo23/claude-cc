import { execFile } from 'node:child_process';
export function safeExec(cmd, args, opts = {}) {
    const { cwd, timeoutMs = 2000 } = opts;
    return new Promise((resolve) => {
        execFile(cmd, args, { cwd, timeout: timeoutMs, encoding: 'utf8' }, (error, stdout) => {
            if (error) {
                resolve('');
                return;
            }
            resolve((stdout ?? '').trim());
        });
    });
}
//# sourceMappingURL=exec.js.map