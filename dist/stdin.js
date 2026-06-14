const MAX_INPUT_BYTES = 1024 * 1024; // 1 MiB — Claude Code payloads are tiny; reject runaway producers
/** Thrown when stdin contains valid JSON but not a plain object (null, array, scalar). */
export class StdinParseError extends SyntaxError {
}
function assertObject(d) {
    if (d === null || typeof d !== 'object' || Array.isArray(d)) {
        throw new StdinParseError(`stdin: expected JSON object, got ${d === null ? 'null' : Array.isArray(d) ? 'array' : typeof d}`);
    }
    return d;
}
export function readStdin(stream = process.stdin, firstByteTimeoutMs = 250, idleTimeoutMs = 30) {
    return new Promise((resolve, reject) => {
        let input = '';
        let gotFirstByte = false;
        const firstByteTimer = setTimeout(() => { cleanup(); reject(new Error('stdin timeout')); }, firstByteTimeoutMs);
        let idleTimer = null;
        const cleanup = () => { clearTimeout(firstByteTimer); if (idleTimer)
            clearTimeout(idleTimer); stream.removeAllListeners(); };
        const tryParse = () => {
            try {
                const d = JSON.parse(input);
                const r = assertObject(d);
                cleanup();
                resolve(r);
                return true;
            }
            catch {
                return false;
            }
        };
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => {
            if (!gotFirstByte) {
                gotFirstByte = true;
                clearTimeout(firstByteTimer);
            }
            input += chunk;
            if (input.length > MAX_INPUT_BYTES) {
                cleanup();
                reject(new Error(`stdin: input exceeded ${MAX_INPUT_BYTES} bytes`));
                return;
            }
            if (tryParse())
                return;
            if (idleTimer)
                clearTimeout(idleTimer);
            idleTimer = setTimeout(() => tryParse(), idleTimeoutMs);
        });
        stream.on('end', () => { cleanup(); try {
            resolve(assertObject(JSON.parse(input)));
        }
        catch (e) {
            reject(e);
        } });
        stream.on('error', (e) => { cleanup(); reject(e); });
    });
}
//# sourceMappingURL=stdin.js.map