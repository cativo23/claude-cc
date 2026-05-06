import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStdin } from '../src/stdin.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

describe('readStdin', () => {
  it('parses valid JSON', async () => {
    const json = readFileSync(join(FIXTURES, 'sample-input.json'), 'utf8');
    const result = await readStdin(Readable.from([json]));
    expect(result.model).toBe('Opus 4.6 (1M context)');
    expect(result.context_window.used_percentage).toBe(5.2);
  });
  it('throws on invalid JSON', async () => { await expect(readStdin(Readable.from(['not json']))).rejects.toThrow(); });
  it('throws on timeout', async () => { await expect(readStdin(new Readable({ read() {} }), 50)).rejects.toThrow(); });

  it('handles chunked JSON delivery', async () => {
    const json = readFileSync(join(FIXTURES, 'sample-input.json'), 'utf8');
    const mid = Math.floor(json.length / 2);
    const chunk1 = json.slice(0, mid);
    const chunk2 = json.slice(mid);
    const stream = new Readable({ read() {} });
    const promise = readStdin(stream, 500, 100);
    stream.push(chunk1);
    setTimeout(() => { stream.push(chunk2); stream.push(null); }, 10);
    const result = await promise;
    expect(result.model).toBe('Opus 4.6 (1M context)');
  });

  it('rejects on stream error', async () => {
    const stream = new Readable({ read() {} });
    const promise = readStdin(stream, 500);
    stream.destroy(new Error('pipe broken'));
    await expect(promise).rejects.toThrow('pipe broken');
  });

  it('rejects when JSON is valid but not an object (null)', async () => {
    await expect(readStdin(Readable.from(['null']))).rejects.toThrow();
  });

  it('rejects when JSON is valid but not an object (array)', async () => {
    await expect(readStdin(Readable.from(['[1,2,3]']))).rejects.toThrow();
  });

  it('rejects when JSON is valid but not an object (string)', async () => {
    await expect(readStdin(Readable.from(['"hello"']))).rejects.toThrow();
  });

  it('rejects when input exceeds 1 MiB', async () => {
    const large = 'x'.repeat(1024 * 1024 + 1);
    const stream = new Readable({ read() {} });
    const promise = readStdin(stream, 500);
    stream.push(large);
    await expect(promise).rejects.toThrow();
  });
});
