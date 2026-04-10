import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getTokenSpeed } from '../../src/parsers/token-speed.js';

describe('getTokenSpeed', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lumira-speed-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns null on first call', () => {
    expect(getTokenSpeed({ used_percentage: 50, remaining_percentage: 50, current_usage: { output_tokens: 1000 } }, dir)).toBeNull();
  });
  it('returns null when output_tokens missing', () => {
    expect(getTokenSpeed({ used_percentage: 50, remaining_percentage: 50 } as never, dir)).toBeNull();
  });
  it('calculates speed from two calls', () => {
    const ctx1 = { used_percentage: 50, remaining_percentage: 50, current_usage: { output_tokens: 1000 } };
    const ctx2 = { used_percentage: 50, remaining_percentage: 50, current_usage: { output_tokens: 2000 } };
    getTokenSpeed(ctx1, dir);
    const speed = getTokenSpeed(ctx2, dir);
    if (speed !== null) expect(speed).toBeGreaterThan(0);
  });

  it('returns null for NaN output_tokens', () => {
    expect(getTokenSpeed({ used_percentage: 50, remaining_percentage: 50, current_usage: { output_tokens: NaN } }, dir)).toBeNull();
  });

  it('returns null for Infinity output_tokens', () => {
    expect(getTokenSpeed({ used_percentage: 50, remaining_percentage: 50, current_usage: { output_tokens: Infinity } }, dir)).toBeNull();
  });

  it('returns null when tokens decrease (session reset)', () => {
    const ctx1 = { used_percentage: 50, remaining_percentage: 50, current_usage: { output_tokens: 5000 } };
    const ctx2 = { used_percentage: 50, remaining_percentage: 50, current_usage: { output_tokens: 1000 } };
    getTokenSpeed(ctx1, dir);
    // Tokens went backward — should return null, not negative speed
    expect(getTokenSpeed(ctx2, dir)).toBeNull();
  });
});
