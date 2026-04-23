import { describe, it, expect } from 'vitest';
import { displayWidth, truncField, truncatePath, fitSegments, padLine } from '../../src/render/text.js';

describe('displayWidth', () => {
  it('measures plain ASCII', () => { expect(displayWidth('hello')).toBe(5); });
  it('strips ANSI codes', () => { expect(displayWidth('\x1b[36mhello\x1b[0m')).toBe(5); });
  it('counts zero-width chars as 0', () => { expect(displayWidth('a\u200Db')).toBe(2); });
  it('counts CJK as 2', () => { expect(displayWidth('\u4E16')).toBe(2); });
  it('counts emoji as 2', () => { expect(displayWidth('\u{1F600}')).toBe(2); });
  it('counts block chars as 1', () => { expect(displayWidth('\u2588\u2591')).toBe(2); });
});

describe('truncField', () => {
  it('returns string unchanged if within limit', () => { expect(truncField('hello', 10)).toBe('hello'); });
  it('truncates with ellipsis', () => { expect(truncField('hello world', 6)).toBe('hello\u2026'); });
  it('handles max=1', () => { expect(truncField('hello', 1)).toBe('\u2026'); });
});

describe('truncatePath', () => {
  it('returns short path unchanged', () => { expect(truncatePath('/a/b', 20)).toBe('/a/b'); });
  it('truncates with .../filename', () => { expect(truncatePath('/very/long/path/to/file.ts', 15)).toBe('.../file.ts'); });
  it('returns empty for empty input', () => { expect(truncatePath('', 20)).toBe(''); });
});

describe('fitSegments', () => {
  it('joins left and right when they fit', () => {
    const result = fitSegments(['A', 'B'], ['X', 'Y'], ' | ', 30);
    expect(result).toContain('A');
    expect(result).toContain('Y');
  });
  it('drops right segments when too wide', () => {
    const result = fitSegments(['AAAA'], ['XXXX', 'YYYY', 'ZZZZ'], ' | ', 20);
    expect(result).toContain('AAAA');
  });
  it('returns only left when nothing fits', () => {
    const result = fitSegments(['LEFT'], ['RIGHT'], ' | ', 10);
    expect(result).toContain('LEFT');
  });

  it('drops tail left segment when left alone overflows', () => {
    const model = 'A'.repeat(20);
    const branch = 'B'.repeat(85);
    const dir = 'C'.repeat(25);
    const result = fitSegments([model, branch, dir], [], ' | ', 120);
    expect(displayWidth(result)).toBeLessThanOrEqual(116);
    expect(result).toContain('A'.repeat(20));     // model kept
    expect(result).toContain('B'.repeat(85));     // branch kept
    expect(result).not.toContain('C'.repeat(25)); // dir dropped
  });

  it('last-resort: truncates single oversized segment without ANSI bleed', () => {
    const result = fitSegments(['X'.repeat(200)], [], ' | ', 50);
    expect(displayWidth(result)).toBeLessThanOrEqual(46);
    expect(result.endsWith('…')).toBe(true);
  });

  it('ANSI-colored left that overflows stays within displayWidth bounds', () => {
    const colored = `\x1b[36m${'B'.repeat(90)}\x1b[0m`;
    const result = fitSegments([colored], [], ' | ', 80);
    expect(displayWidth(result)).toBeLessThanOrEqual(76);
  });

  it('leftW === safeCols exactly returns left unchanged', () => {
    const left = 'A'.repeat(16); // safeCols = 20-4 = 16
    const result = fitSegments([left], [], ' | ', 20);
    expect(result).toBe(left);
  });
});

describe('padLine', () => {
  it('pads between left and right to fill cols', () => {
    const result = padLine('left', 'right', 20);
    expect(displayWidth(result)).toBe(20);
  });
});
