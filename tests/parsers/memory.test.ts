import { describe, it, expect } from 'vitest';
import { getMemoryInfo } from '../../src/parsers/memory.js';

describe('getMemoryInfo', () => {
  it('returns valid memory info or null on current platform', () => {
    const info = getMemoryInfo();
    // May be null if parsing fails, but when present it should be valid
    if (info === null) return;
    expect(info.totalBytes).toBeGreaterThan(0);
    expect(info.percentage).toBeGreaterThanOrEqual(0);
    expect(info.percentage).toBeLessThanOrEqual(100);
    expect(info.usedBytes).toBeGreaterThanOrEqual(0);
  });
});
