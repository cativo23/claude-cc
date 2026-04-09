import { describe, it, expect } from 'vitest';
import { getMemoryInfo } from '../../src/parsers/memory.js';

describe('getMemoryInfo', () => {
  it('returns valid memory info or null', () => {
    const info = getMemoryInfo();
    if (info === null) return;
    expect(info.totalBytes).toBeGreaterThan(0);
    expect(info.percentage).toBeGreaterThanOrEqual(0);
    expect(info.percentage).toBeLessThanOrEqual(100);
  });
});
