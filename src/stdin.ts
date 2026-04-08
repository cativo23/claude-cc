import type { Readable } from 'node:stream';
import type { ClaudeCodeInput } from './types.js';

export function readStdin(stream: Readable = process.stdin, firstByteTimeoutMs: number = 250, idleTimeoutMs: number = 30): Promise<ClaudeCodeInput> {
  return new Promise((resolve, reject) => {
    let input = '';
    let gotFirstByte = false;
    const firstByteTimer = setTimeout(() => { cleanup(); reject(new Error('stdin timeout')); }, firstByteTimeoutMs);
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => { clearTimeout(firstByteTimer); if (idleTimer) clearTimeout(idleTimer); stream.removeAllListeners(); };
    const tryParse = () => { try { const d = JSON.parse(input); cleanup(); resolve(d); return true; } catch { return false; } };

    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      if (!gotFirstByte) { gotFirstByte = true; clearTimeout(firstByteTimer); }
      input += chunk;
      if (tryParse()) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => tryParse(), idleTimeoutMs);
    });
    stream.on('end', () => { cleanup(); try { resolve(JSON.parse(input)); } catch (e) { reject(e); } });
    stream.on('error', (e) => { cleanup(); reject(e); });
  });
}
