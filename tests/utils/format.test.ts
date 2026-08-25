import { describe, it, expect } from 'vitest';
import { formatTokens, formatDuration, formatCost, formatBurnRate, toSingleLine } from '../../src/utils/format.js';

describe('formatTokens', () => {
  it('returns empty string for null/undefined', () => {
    expect(formatTokens(null as unknown as number)).toBe('');
    expect(formatTokens(undefined as unknown as number)).toBe('');
  });
  it('formats millions', () => {
    expect(formatTokens(1_234_567)).toBe('1.2M');
    expect(formatTokens(2_000_000)).toBe('2.0M');
  });
  it('formats thousands', () => {
    expect(formatTokens(131_000)).toBe('131k');
    expect(formatTokens(1_500)).toBe('2k');
  });
  it('formats small numbers as-is', () => {
    expect(formatTokens(456)).toBe('456');
    expect(formatTokens(0)).toBe('0');
  });
});

describe('formatDuration', () => {
  it('returns empty string for null/undefined', () => {
    expect(formatDuration(null as unknown as number)).toBe('');
  });
  it('formats hours and minutes', () => {
    expect(formatDuration(3_723_000)).toBe('1h02m');
    expect(formatDuration(7_200_000)).toBe('2h00m');
  });
  it('formats minutes and seconds', () => {
    expect(formatDuration(125_000)).toBe('2m05s');
    expect(formatDuration(60_000)).toBe('1m00s');
  });
  it('formats seconds only', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(0)).toBe('0s');
  });
});

describe('formatCost', () => {
  it('returns empty string for null/undefined', () => {
    expect(formatCost(null as unknown as number)).toBe('');
  });
  it('formats costs >= $0.01 with 2 decimals', () => {
    expect(formatCost(1.31)).toBe('$1.31');
    expect(formatCost(0.05)).toBe('$0.05');
  });
  it('formats costs < $0.01 with 4 decimals', () => {
    expect(formatCost(0.0012)).toBe('$0.0012');
    expect(formatCost(0.001)).toBe('$0.0010');
  });
});

describe('formatBurnRate', () => {
  it('returns null if duration <= 60s', () => {
    expect(formatBurnRate(1.0, 30_000)).toBeNull();
    expect(formatBurnRate(1.0, 60_000)).toBeNull();
  });
  it('calculates $/h for durations > 60s', () => {
    expect(formatBurnRate(1.0, 1_800_000)).toBe('$2.00/h');
  });
  it('returns null for zero cost', () => {
    expect(formatBurnRate(0, 120_000)).toBeNull();
  });
  it('returns null for negative cost', () => {
    expect(formatBurnRate(-5, 120_000)).toBeNull();
  });
});

describe('formatTokens — non-finite inputs', () => {
  it('returns empty string for NaN', () => { expect(formatTokens(NaN)).toBe(''); });
  it('returns empty string for Infinity', () => { expect(formatTokens(Infinity)).toBe(''); });
  it('returns empty string for -Infinity', () => { expect(formatTokens(-Infinity)).toBe(''); });
});

describe('formatDuration — non-finite inputs', () => {
  it('returns empty string for NaN', () => { expect(formatDuration(NaN)).toBe(''); });
  it('returns empty string for Infinity', () => { expect(formatDuration(Infinity)).toBe(''); });
});

describe('formatCost — non-finite inputs', () => {
  it('returns empty string for NaN', () => { expect(formatCost(NaN)).toBe(''); });
  it('returns empty string for Infinity', () => { expect(formatCost(Infinity)).toBe(''); });
  it('returns empty string for negative cost', () => { expect(formatCost(-0.5)).toBe(''); });
});

describe('toSingleLine', () => {
  it('strips a trailing newline', () => {
    expect(toSingleLine('up 3 days\n')).toBe('up 3 days');
  });

  it('collapses embedded newlines to a single space', () => {
    expect(toSingleLine('line one\nline two\n')).toBe('line one line two');
  });

  it('collapses CRLF (Windows line endings) without leaving a double space', () => {
    expect(toSingleLine('a\r\nb\r\n')).toBe('a b');
  });

  it('collapses vertical tab and form feed — xterm/VTE treat both as a line feed', () => {
    expect(toSingleLine('a\vb')).toBe('a b');
    expect(toSingleLine('a\fb')).toBe('a b');
  });

  it('collapses multiple consecutive line breaks into one space, not several', () => {
    expect(toSingleLine('a\n\n\nb')).toBe('a b');
  });

  it('trims leading and trailing whitespace', () => {
    expect(toSingleLine('   42   ')).toBe('42');
  });

  it('returns empty string for input that is only line breaks', () => {
    expect(toSingleLine('\n\n')).toBe('');
  });

  it('does not corrupt an ANSI SGR sequence — no escape contains \\r or \\n', () => {
    expect(toSingleLine('\x1b[32mfoo\nbar\x1b[0m\n')).toBe('\x1b[32mfoo bar\x1b[0m');
  });
});
