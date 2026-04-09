import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readTtlCache, writeTtlCache, isMtimeFresh } from '../../src/utils/cache.js';

describe('TTL cache', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ccpulse-test-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns null for missing cache', () => {
    expect(readTtlCache<{ x: number }>('nonexistent', dir)).toBeNull();
  });
  it('writes and reads fresh cache', () => {
    writeTtlCache('test-key', { value: 42 }, dir);
    const result = readTtlCache<{ value: number }>('test-key', dir, 5000);
    expect(result).toEqual({ value: 42 });
  });
  it('returns null for expired cache', () => {
    const filePath = join(dir, 'ccpulse-test-key.json');
    writeFileSync(filePath, JSON.stringify({ value: 42 }), { mode: 0o600 });
    const past = new Date(Date.now() - 10_000);
    utimesSync(filePath, past, past);
    const result = readTtlCache<{ value: number }>('test-key', dir, 5000);
    expect(result).toBeNull();
  });
});

describe('isMtimeFresh', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ccpulse-test-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns false for non-existent file', () => {
    expect(isMtimeFresh('/nonexistent/file', { mtime: 0, size: 0 })).toBe(false);
  });
  it('returns true when mtime and size match', () => {
    const filePath = join(dir, 'test.jsonl');
    writeFileSync(filePath, 'hello');
    const stat = statSync(filePath);
    expect(isMtimeFresh(filePath, { mtime: stat.mtimeMs, size: stat.size })).toBe(true);
  });
  it('returns false when file has changed', () => {
    const filePath = join(dir, 'test.jsonl');
    writeFileSync(filePath, 'hello');
    expect(isMtimeFresh(filePath, { mtime: 0, size: 0 })).toBe(false);
  });
});
