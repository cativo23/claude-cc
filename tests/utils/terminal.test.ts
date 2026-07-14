import { describe, it, expect, vi, afterEach } from 'vitest';
import { getTermCols, getLayoutCols } from '../../src/utils/terminal.js';

// Helper that mimics the PPID extraction logic from terminal.ts so we can
// unit-test the parsing algorithm in isolation without touching /proc.
function extractPpid(stat: string): number {
  const tail = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return parseInt(tail[1], 10); // tail[0]=state, tail[1]=ppid
}

describe('getTermCols', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns a positive number', () => {
    expect(getTermCols()).toBeGreaterThan(0);
  });
});

describe('extractPpid from /proc/<pid>/stat', () => {
  it('extracts ppid from a simple comm field (no spaces)', () => {
    // Format: pid (comm) state ppid ...
    const stat = '1234 (bash) S 5678 1234 1234 ...';
    expect(extractPpid(stat)).toBe(5678);
  });

  it('extracts ppid when comm contains spaces', () => {
    // A process named "my process" shifts the naive split-by-space approach
    const stat = '1234 (my process name) S 9999 1234 1234 ...';
    expect(extractPpid(stat)).toBe(9999);
  });

  it('extracts ppid when comm contains spaces and parens-like text', () => {
    // Edge case: paren in process name — lastIndexOf(')') finds the closing paren
    const stat = '42 (node (v18)) R 100 42 42 ...';
    expect(extractPpid(stat)).toBe(100);
  });
});

describe('getLayoutCols', () => {
  it('returns raw cols when TTY', () => { expect(getLayoutCols(120, true)).toBe(120); });
  // Default is full width (1.0): CC renders its hints on a separate line, not
  // appended to the statusline row, so no chrome headroom is reserved.
  it('uses full width when not TTY (default factor 1.0, no chrome reservation)', () => {
    expect(getLayoutCols(120, false)).toBe(120);
  });
  it('applies custom reduction factor', () => { expect(getLayoutCols(100, false, 0.5)).toBe(50); });
  it('clamps factor between 0.3 and 1.0', () => {
    expect(getLayoutCols(100, false, 0.1)).toBe(30);
    expect(getLayoutCols(100, false, 2.0)).toBe(100);
  });
});
