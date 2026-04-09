import { describe, it, expect } from 'vitest';
import { formatTokens, formatDuration, formatCost, formatBurnRate } from '../../src/utils/format.js';

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
});
