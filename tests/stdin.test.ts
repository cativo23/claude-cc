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
});
