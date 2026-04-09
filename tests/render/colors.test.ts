import { describe, it, expect, vi, afterEach } from 'vitest';
import { createColors, stripAnsi, detectColorMode, getContextColor, getQuotaColor } from '../../src/render/colors.js';

describe('stripAnsi', () => {
  it('removes ANSI escape codes', () => {
    expect(stripAnsi('\x1b[36mhello\x1b[0m')).toBe('hello');
    expect(stripAnsi('\x1b[38;5;208mworld\x1b[0m')).toBe('world');
    expect(stripAnsi('\x1b[38;2;255;0;0mred\x1b[0m')).toBe('red');
  });
  it('returns plain string unchanged', () => { expect(stripAnsi('hello world')).toBe('hello world'); });
});

describe('detectColorMode', () => {
  it('always returns named by default (respects terminal theme)', () => {
    expect(detectColorMode()).toBe('named');
  });
});

describe('createColors', () => {
  it('wraps text with named ANSI codes', () => {
    const c = createColors('named');
    expect(c.cyan('test')).toBe('\x1b[36mtest\x1b[0m');
    expect(c.red('err')).toBe('\x1b[31merr\x1b[0m');
  });
  it('creates 256-color output', () => {
    const c = createColors('256');
    expect(c.orange('warn')).toContain('\x1b[38;5;208m');
  });
});

describe('getContextColor', () => {
  it('returns green for <50%', () => { expect(getContextColor(30)).toBe('green'); });
  it('returns yellow for 50-64%', () => { expect(getContextColor(55)).toBe('yellow'); });
  it('returns orange for 65-79%', () => { expect(getContextColor(70)).toBe('orange'); });
  it('returns blinkRed for >=80%', () => { expect(getContextColor(85)).toBe('blinkRed'); });
});

describe('getQuotaColor', () => {
  it('returns green for <50%', () => { expect(getQuotaColor(30)).toBe('green'); });
  it('returns yellow for 50-69%', () => { expect(getQuotaColor(55)).toBe('yellow'); });
  it('returns orange for 70-84%', () => { expect(getQuotaColor(75)).toBe('orange'); });
  it('returns blinkRed for >=85%', () => { expect(getQuotaColor(90)).toBe('blinkRed'); });
});
