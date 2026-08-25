import { describe, it, expect } from 'vitest';
import { parseWidgetValue, matchValueTier } from '../../src/render/value-map.js';
import type { CustomCommandValueTier } from '../../src/types.js';

describe('parseWidgetValue', () => {
  it('parses a plain integer', () => {
    expect(parseWidgetValue('42')).toBe(42);
  });

  it('parses a decimal', () => {
    expect(parseWidgetValue('42.5')).toBe(42.5);
  });

  it('parses a leading-dot decimal', () => {
    expect(parseWidgetValue('.5')).toBe(0.5);
  });

  it('parses a negative number', () => {
    expect(parseWidgetValue('-3')).toBe(-3);
  });

  it('parses a percentage suffix', () => {
    expect(parseWidgetValue('87%')).toBe(87);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseWidgetValue(' 87% ')).toBe(87);
  });

  it('rejects a value with a unit suffix other than %', () => {
    expect(parseWidgetValue('42ms')).toBeNull();
  });

  it('rejects a number embedded in text', () => {
    expect(parseWidgetValue('cpu 42')).toBeNull();
  });

  it('rejects thousands separators', () => {
    expect(parseWidgetValue('1,024')).toBeNull();
  });

  it('rejects exponential notation', () => {
    expect(parseWidgetValue('1e3')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(parseWidgetValue('')).toBeNull();
  });

  it('rejects the literal string "NaN"', () => {
    expect(parseWidgetValue('NaN')).toBeNull();
  });

  it('rejects multi-line text', () => {
    expect(parseWidgetValue('line one\nline two')).toBeNull();
  });
});

describe('matchValueTier', () => {
  const tiers: CustomCommandValueTier[] = [
    { lt: 60, icon: '🟢' },
    { lt: 80, icon: '🟡', color: 'yellow' },
    { icon: '🔴', color: 'red' }, // catch-all, no lt
  ];

  it('matches the first tier when value is well below its bound', () => {
    expect(matchValueTier(tiers, 10)).toEqual({ lt: 60, icon: '🟢' });
  });

  it('does not match a tier at the exact boundary (lt is exclusive)', () => {
    // value === lt must fall through to the NEXT tier, not this one.
    expect(matchValueTier(tiers, 60)).toEqual({ lt: 80, icon: '🟡', color: 'yellow' });
  });

  it('matches the tier just below its boundary', () => {
    expect(matchValueTier(tiers, 59.9)).toEqual({ lt: 60, icon: '🟢' });
  });

  it('falls through to the catch-all tier for a value above every lt', () => {
    expect(matchValueTier(tiers, 95)).toEqual({ icon: '🔴', color: 'red' });
  });

  it('falls through to the catch-all tier at the last explicit boundary', () => {
    expect(matchValueTier(tiers, 80)).toEqual({ icon: '🔴', color: 'red' });
  });

  it('returns undefined when there is no catch-all and value exceeds every lt', () => {
    const noCatchAll: CustomCommandValueTier[] = [{ lt: 50, icon: '🟢' }];
    expect(matchValueTier(noCatchAll, 51)).toBeUndefined();
  });

  it('returns undefined for an empty tier list', () => {
    expect(matchValueTier([], 42)).toBeUndefined();
  });

  it('matches a negative value against the first tier with a high enough lt', () => {
    expect(matchValueTier(tiers, -100)).toEqual({ lt: 60, icon: '🟢' });
  });
});
