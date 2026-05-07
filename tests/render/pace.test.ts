import { describe, it, expect } from 'vitest';
import { computePaceDelta, formatPaceDelta } from '../../src/render/pace.js';

// A fixed "now" for deterministic tests: arbitrary Unix timestamp
const NOW = 1_000_000; // seconds

// Total window is 5h = 18000s
const WINDOW = 5 * 3600; // 18000

describe('computePaceDelta', () => {
  it('returns null when resetsAt is undefined', () => {
    expect(computePaceDelta(50, undefined, NOW)).toBeNull();
  });

  it('returns null when resetsAt is in the past', () => {
    expect(computePaceDelta(50, NOW - 1, NOW)).toBeNull();
  });

  it('returns null when resetsAt equals now (boundary)', () => {
    expect(computePaceDelta(50, NOW, NOW)).toBeNull();
  });

  it('returns null when less than 5 min has elapsed (elapsedSec < 300)', () => {
    // Only 4 minutes (240s) elapsed → resetsAt = now + (18000 - 240)
    const resetsAt = NOW + (WINDOW - 240);
    expect(computePaceDelta(50, resetsAt, NOW)).toBeNull();
  });

  it('returns null at exactly 299s elapsed (boundary below threshold)', () => {
    const resetsAt = NOW + (WINDOW - 299);
    expect(computePaceDelta(50, resetsAt, NOW)).toBeNull();
  });

  it('returns non-null at exactly 300s elapsed (threshold met)', () => {
    const resetsAt = NOW + (WINDOW - 300);
    expect(computePaceDelta(50, resetsAt, NOW)).not.toBeNull();
  });

  it('returns positive delta when used more than proportional time (ahead of pace)', () => {
    // 25% of window elapsed, but 50% used → delta = +25
    const elapsedSec = WINDOW * 0.25; // 4500s
    const resetsAt = NOW + (WINDOW - elapsedSec);
    const result = computePaceDelta(50, resetsAt, NOW);
    expect(result).not.toBeNull();
    expect(result!.delta).toBeGreaterThan(0);
  });

  it('returns negative delta when used less than proportional time (behind pace)', () => {
    // 75% of window elapsed, but only 25% used → delta = 25 - 75 = -50
    const elapsedSec = WINDOW * 0.75; // 13500s
    const resetsAt = NOW + (WINDOW - elapsedSec);
    const result = computePaceDelta(25, resetsAt, NOW);
    expect(result).not.toBeNull();
    expect(result!.delta).toBeLessThan(0);
  });

  it('returns near-zero delta when on pace', () => {
    // 50% elapsed, 50% used → delta ≈ 0
    const elapsedSec = WINDOW * 0.5; // 9000s
    const resetsAt = NOW + (WINDOW - elapsedSec);
    const result = computePaceDelta(50, resetsAt, NOW);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.delta)).toBeLessThan(0.01);
  });

  it('sets timeToExhaustion when delta > 0', () => {
    // Ahead of pace → TTE should be non-null
    const elapsedSec = WINDOW * 0.25;
    const resetsAt = NOW + (WINDOW - elapsedSec);
    const result = computePaceDelta(50, resetsAt, NOW);
    expect(result!.timeToExhaustion).not.toBeNull();
    expect(result!.timeToExhaustion).toBeGreaterThan(0);
  });

  it('sets timeToExhaustion to null when delta <= 0', () => {
    // Behind pace → TTE should be null
    const elapsedSec = WINDOW * 0.75;
    const resetsAt = NOW + (WINDOW - elapsedSec);
    const result = computePaceDelta(25, resetsAt, NOW);
    expect(result!.timeToExhaustion).toBeNull();
  });

  it('calculates correct delta: 50% used at 25% elapsed = +25% delta', () => {
    const elapsedSec = WINDOW * 0.25; // exactly 25% elapsed
    const resetsAt = NOW + (WINDOW - elapsedSec);
    const result = computePaceDelta(50, resetsAt, NOW);
    expect(result).not.toBeNull();
    expect(result!.delta).toBeCloseTo(25, 5);
  });

  it('nowSec is injectable — same inputs produce deterministic result', () => {
    const resetsAt = NOW + (WINDOW - 3600); // 1h elapsed
    const result1 = computePaceDelta(40, resetsAt, NOW);
    const result2 = computePaceDelta(40, resetsAt, NOW);
    expect(result1).toEqual(result2);
  });

  it('edge: usedPercentage = 0 with resetsAt far in future → negative delta, no TTE', () => {
    // 50% elapsed, 0% used → delta = -50, TTE = null
    const elapsedSec = WINDOW * 0.5;
    const resetsAt = NOW + (WINDOW - elapsedSec);
    const result = computePaceDelta(0, resetsAt, NOW);
    expect(result).not.toBeNull();
    expect(result!.delta).toBeLessThan(0);
    expect(result!.timeToExhaustion).toBeNull();
  });

  it('edge: usedPercentage = 100 → high positive delta and TTE near 0', () => {
    // 50% elapsed, 100% used → delta = 50, TTE = 0 remaining / burn_rate ≈ 0
    const elapsedSec = WINDOW * 0.5; // 9000s
    const resetsAt = NOW + (WINDOW - elapsedSec);
    const result = computePaceDelta(100, resetsAt, NOW);
    expect(result).not.toBeNull();
    expect(result!.delta).toBeGreaterThan(0);
    // TTE: (100 - 100) / (100 / 9000) / 60 = 0
    expect(result!.timeToExhaustion).toBeCloseTo(0, 5);
  });

  it('computes correct TTE: 50% used at 25% elapsed', () => {
    // burnRate = 50% / 4500s; remaining = 50%; TTE = 50 / (50/4500) / 60 = 4500/60 = 75 min
    const elapsedSec = WINDOW * 0.25; // 4500s
    const resetsAt = NOW + (WINDOW - elapsedSec);
    const result = computePaceDelta(50, resetsAt, NOW);
    expect(result!.timeToExhaustion).toBeCloseTo(75, 5);
  });
});

describe('formatPaceDelta', () => {
  it('returns "on pace" when delta is between -1 and 1 (exclusive)', () => {
    expect(formatPaceDelta({ delta: 0, timeToExhaustion: null })).toBe('on pace');
    expect(formatPaceDelta({ delta: 0.5, timeToExhaustion: null })).toBe('on pace');
    expect(formatPaceDelta({ delta: -0.99, timeToExhaustion: null })).toBe('on pace');
  });

  it('returns "on pace" at delta = 0 exactly', () => {
    expect(formatPaceDelta({ delta: 0, timeToExhaustion: null })).toBe('on pace');
  });

  it('formats ahead with TTE < 60 min as "+N% (~Xmin)"', () => {
    const result = formatPaceDelta({ delta: 15, timeToExhaustion: 45 });
    expect(result).toBe('+15% (~45min)');
  });

  it('formats ahead with TTE >= 60 min as "+N% (~Xh)"', () => {
    const result = formatPaceDelta({ delta: 10, timeToExhaustion: 120 });
    expect(result).toBe('+10% (~2h)');
  });

  it('formats ahead with null TTE as "+N%" (no suffix)', () => {
    const result = formatPaceDelta({ delta: 20, timeToExhaustion: null });
    expect(result).toBe('+20%');
  });

  it('formats behind pace as "-N%" (no TTE suffix)', () => {
    const result = formatPaceDelta({ delta: -15, timeToExhaustion: null });
    expect(result).toBe('-15%');
  });

  it('formats large positive value: +50%', () => {
    const result = formatPaceDelta({ delta: 50, timeToExhaustion: null });
    expect(result).toBe('+50%');
  });

  it('formats large negative value: -30%', () => {
    const result = formatPaceDelta({ delta: -30, timeToExhaustion: null });
    expect(result).toBe('-30%');
  });

  it('rounds fractional delta values', () => {
    expect(formatPaceDelta({ delta: 15.6, timeToExhaustion: null })).toBe('+16%');
    expect(formatPaceDelta({ delta: -15.4, timeToExhaustion: null })).toBe('-15%');
  });

  it('rounds TTE minutes when formatting suffix', () => {
    // TTE = 45.7 → rounds to 46
    const result = formatPaceDelta({ delta: 10, timeToExhaustion: 45.7 });
    expect(result).toBe('+10% (~46min)');
  });

  it('rounds TTE hours: 90 min → ~2h', () => {
    const result = formatPaceDelta({ delta: 10, timeToExhaustion: 90 });
    expect(result).toBe('+10% (~2h)');
  });

  it('delta at boundary 1.0 is NOT "on pace" (exclusive upper)', () => {
    // delta >= 1 should produce a formatted string, not "on pace"
    expect(formatPaceDelta({ delta: 1, timeToExhaustion: null })).toBe('+1%');
  });

  it('delta at boundary -1.0 is NOT "on pace" (exclusive lower)', () => {
    expect(formatPaceDelta({ delta: -1, timeToExhaustion: null })).toBe('-1%');
  });

  it('suppresses suffix when TTE rounds to zero (usedPercentage = 100 edge case)', () => {
    // TTE = 0 means quota already exhausted — showing "~0min" is misleading
    const result = formatPaceDelta({ delta: 50, timeToExhaustion: 0 });
    expect(result).toBe('+50%');
  });

  it('suppresses suffix when TTE is sub-minute (rounds to 0)', () => {
    const result = formatPaceDelta({ delta: 50, timeToExhaustion: 0.3 });
    expect(result).toBe('+50%');
  });
});
