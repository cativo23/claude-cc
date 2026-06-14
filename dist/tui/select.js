import readline from 'node:readline';
const SHOW_CURSOR = '\x1b[?25h';
const HIDE_CURSOR = '\x1b[?25l';
const CLEAR_SCREEN = '\x1b[2J\x1b[H';
// Module-level flag: guarantees the raw-mode cleanup exit handler is
// registered once per Node process. Process-scoped by design — tests must
// run in forked workers (see vitest.config.ts `pool: 'forks'`). Issue #20.
let exitHandlerInstalled = false;
// Active Promise resolver — set by interactiveSelect while it is waiting for
// input, cleared on settlement. SIGINT/SIGTERM handlers call this so the
// Promise always settles (resolves null = cancellation) before the process
// is re-killed. Without this, embedded/library callers would hang forever.
let activeFinish = null;
function installExitHandler(stdin, stdout) {
    if (exitHandlerInstalled)
        return;
    exitHandlerInstalled = true;
    const restoreTerminal = () => {
        try {
            if (typeof stdin.setRawMode === 'function' && stdin.isRaw)
                stdin.setRawMode(false);
            stdout.write?.(SHOW_CURSOR);
        }
        catch { /* best effort */ }
    };
    process.once('exit', restoreTerminal);
    // SIGINT/SIGTERM bypass the 'exit' handler — resolve any active Promise
    // (cancellation), restore terminal state, then re-raise so default signal
    // behaviour (process termination) still occurs.
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        process.once(sig, () => {
            if (activeFinish) {
                activeFinish(null);
                activeFinish = null;
            }
            restoreTerminal();
            process.kill(process.pid, sig);
        });
    }
}
export async function interactiveSelect(opts) {
    const stdin = (opts.stdin ?? process.stdin);
    const stdout = (opts.stdout ?? process.stdout);
    if (!stdin.isTTY)
        return null;
    installExitHandler(stdin, stdout);
    const options = opts.options;
    const initialIdx = options.findIndex((o) => o.value === opts.initial);
    let focus = initialIdx >= 0 ? initialIdx : 0;
    let keypressListener = null;
    let resizeListener = null;
    let endListener = null;
    const cleanup = () => {
        if (keypressListener)
            stdin.removeListener?.('keypress', keypressListener);
        if (resizeListener && typeof stdout.removeListener === 'function') {
            stdout.removeListener('resize', resizeListener);
        }
        if (endListener)
            stdin.removeListener?.('end', endListener);
        if (typeof stdin.setRawMode === 'function')
            stdin.setRawMode(false);
        stdin.pause?.();
        stdout.write?.(SHOW_CURSOR);
    };
    const render = () => {
        stdout.write?.(CLEAR_SCREEN);
        if (opts.prelude)
            stdout.write?.(opts.prelude);
        stdout.write?.(` ${opts.title}\n\n`);
        for (let i = 0; i < options.length; i++) {
            const o = options[i];
            const marker = i === focus ? ' ❯ ' : '   ';
            const desc = o.description ? '  ' + o.description : '';
            stdout.write?.(`${marker}${o.label}${desc}\n`);
        }
        stdout.write?.('\n');
        stdout.write?.(opts.preview(options[focus].value));
        stdout.write?.('\n');
    };
    try {
        readline.emitKeypressEvents(stdin);
        if (typeof stdin.setRawMode === 'function')
            stdin.setRawMode(true);
        stdin.resume?.();
        stdout.write?.(HIDE_CURSOR);
        render();
        return await new Promise((resolve) => {
            // Register the resolver so signal handlers can settle this Promise.
            activeFinish = resolve;
            const finish = (v) => {
                activeFinish = null; // clear before resolving to avoid double-call
                resolve(v);
            };
            keypressListener = (_str, key) => {
                if (!key || !key.name)
                    return;
                if (key.name === 'down' || key.name === 'j') {
                    focus = (focus + 1) % options.length;
                    render();
                    return;
                }
                if (key.name === 'up' || key.name === 'k') {
                    focus = (focus - 1 + options.length) % options.length;
                    render();
                    return;
                }
                if (key.name === 'return') {
                    finish(options[focus].value);
                    return;
                }
                if (key.name === 'escape' || key.name === 'q') {
                    finish(null);
                    return;
                }
                if (key.name === 'c' && key.ctrl) {
                    finish(null);
                    return;
                }
            };
            stdin.on('keypress', keypressListener);
            endListener = () => finish(null);
            stdin.on('end', endListener);
            resizeListener = () => render();
            if (typeof stdout.on === 'function') {
                stdout.on('resize', resizeListener);
            }
        });
    }
    finally {
        cleanup();
    }
}
//# sourceMappingURL=select.js.map