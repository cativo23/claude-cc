import type { Readable } from 'node:stream';
import type { RawInput } from './types.js';

const MAX_INPUT_BYTES = 1024 * 1024; // 1 MiB — Claude Code payloads are tiny; reject runaway producers

/** Thrown when stdin contains valid JSON but not a plain object (null, array, scalar). */
export class StdinParseError extends SyntaxError {}

function assertObject(d: unknown): RawInput {
  if (d === null || typeof d !== 'object' || Array.isArray(d)) {
    throw new StdinParseError(`stdin: expected JSON object, got ${d === null ? 'null' : Array.isArray(d) ? 'array' : typeof d}`);
  }
  return d as RawInput;
}

export function readStdin(stream: Readable = process.stdin, firstByteTimeoutMs: number = 250, idleTimeoutMs: number = 30): Promise<RawInput> {
  return new Promise((resolve, reject) => {
    let input = '';
    let gotFirstByte = false;
    const firstByteTimer = setTimeout(() => { cleanup(); reject(new Error('stdin timeout')); }, firstByteTimeoutMs);
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => { clearTimeout(firstByteTimer); if (idleTimer) clearTimeout(idleTimer); stream.removeAllListeners(); };
    const tryParse = () => {
      try { const d = JSON.parse(input); const r = assertObject(d); cleanup(); resolve(r); return true; } catch { return false; }
    };

    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      if (!gotFirstByte) { gotFirstByte = true; clearTimeout(firstByteTimer); }
      input += chunk;
      if (input.length > MAX_INPUT_BYTES) { cleanup(); reject(new Error(`stdin: input exceeded ${MAX_INPUT_BYTES} bytes`)); return; }
      if (tryParse()) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => tryParse(), idleTimeoutMs);
    });
    stream.on('end', () => { cleanup(); try { resolve(assertObject(JSON.parse(input))); } catch (e) { reject(e); } });
    stream.on('error', (e) => { cleanup(); reject(e); });
  });
}
