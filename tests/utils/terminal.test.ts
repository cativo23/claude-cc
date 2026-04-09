import { describe, it, expect, vi, afterEach } from 'vitest';
import { getTermCols, getLayoutCols } from '../../src/utils/terminal.js';

describe('getTermCols', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns a positive number', () => {
    expect(getTermCols()).toBeGreaterThan(0);
  });
});

describe('getLayoutCols', () => {
  it('returns raw cols when TTY', () => { expect(getLayoutCols(120, true)).toBe(120); });
  it('applies 0.7 reduction when not TTY', () => { expect(getLayoutCols(120, false)).toBe(84); });
  it('applies custom reduction factor', () => { expect(getLayoutCols(100, false, 0.5)).toBe(50); });
  it('clamps factor between 0.3 and 1.0', () => {
    expect(getLayoutCols(100, false, 0.1)).toBe(30);
    expect(getLayoutCols(100, false, 2.0)).toBe(100);
  });
});
