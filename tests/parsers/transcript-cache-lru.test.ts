import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseTranscript,
  _transcriptCacheSize,
  _transcriptCacheKeys,
  _clearTranscriptCache,
  TRANSCRIPT_CACHE_CAP,
} from '../../src/parsers/transcript.js';

const TEST_DIR = join(tmpdir(), `lumira-cache-lru-${process.pid}`);

function writeFixture(name: string): string {
  const path = join(TEST_DIR, name);
  writeFileSync(path, '{"timestamp":"2026-04-08T10:00:00Z","message":{"content":[]}}\n');
  return path;
}

describe('transcript cache LRU', () => {
  beforeEach(() => {
    _clearTranscriptCache();
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('exposes a fixed cap', () => {
    expect(TRANSCRIPT_CACHE_CAP).toBeGreaterThan(0);
    expect(TRANSCRIPT_CACHE_CAP).toBeLessThanOrEqual(50);
  });

  it('never grows past the cap', async () => {
    const overflow = TRANSCRIPT_CACHE_CAP + 5;
    for (let i = 0; i < overflow; i++) {
      await parseTranscript(writeFixture(`t${i}.jsonl`));
    }
    expect(_transcriptCacheSize()).toBe(TRANSCRIPT_CACHE_CAP);
  });

  it('evicts the least-recently-used path when cap exceeded', async () => {
    const { resolve } = await import('node:path');
    const oldestPath = writeFixture('oldest.jsonl');
    await parseTranscript(oldestPath);

    const middle: string[] = [];
    for (let i = 0; i < TRANSCRIPT_CACHE_CAP - 1; i++) {
      const p = writeFixture(`mid${i}.jsonl`);
      middle.push(p);
      await parseTranscript(p);
    }
    expect(_transcriptCacheSize()).toBe(TRANSCRIPT_CACHE_CAP);

    const newestPath = writeFixture('newest.jsonl');
    await parseTranscript(newestPath);

    const keys = _transcriptCacheKeys();
    expect(_transcriptCacheSize()).toBe(TRANSCRIPT_CACHE_CAP);
    expect(keys).not.toContain(resolve(oldestPath));
    expect(keys).toContain(resolve(newestPath));
    for (const m of middle) expect(keys).toContain(resolve(m));
  });

  it('refreshes recency on cache hit', async () => {
    const { resolve } = await import('node:path');
    const touched = writeFixture('touched.jsonl');
    await parseTranscript(touched);

    const middle: string[] = [];
    for (let i = 0; i < TRANSCRIPT_CACHE_CAP - 1; i++) {
      const p = writeFixture(`mid${i}.jsonl`);
      middle.push(p);
      await parseTranscript(p);
    }

    // Re-touch the otherwise-oldest entry → moves it to most-recent end.
    await parseTranscript(touched);

    const newestPath = writeFixture('newest.jsonl');
    await parseTranscript(newestPath);

    const keys = _transcriptCacheKeys();
    expect(_transcriptCacheSize()).toBe(TRANSCRIPT_CACHE_CAP);
    // The touched entry survived because it was refreshed.
    expect(keys).toContain(resolve(touched));
    // middle[0] (the oldest non-touched) was evicted instead.
    expect(keys).not.toContain(resolve(middle[0]));
    // The newest entry made it in.
    expect(keys).toContain(resolve(newestPath));
  });

  it('returns a defensive copy so caller mutations do not corrupt the cache', async () => {
    const path = writeFixture('shared.jsonl');
    const first = await parseTranscript(path);

    // Caller goes wild: mutates everything they got.
    first.tools.push({ id: 'fake', name: 'EVIL', target: undefined, status: 'running', startTime: new Date() });
    first.agents.push({ id: 'fake', type: 'EVIL', status: 'running', startTime: new Date() });
    first.todos.push({ id: 'fake', content: 'EVIL', status: 'pending' });

    const second = await parseTranscript(path);
    expect(second.tools.find(t => t.id === 'fake')).toBeUndefined();
    expect(second.agents.find(a => a.id === 'fake')).toBeUndefined();
    expect(second.todos.find(t => t.id === 'fake')).toBeUndefined();
  });
});
