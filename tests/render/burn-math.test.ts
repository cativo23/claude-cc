import { describe, it, expect } from 'vitest';
import { computeBurnExtrapolation } from '../../src/render/burn-math.js';

const NOW = 1_000_000;
const WINDOW_5H = 5 * 3600;  // 18000s
const WINDOW_7D = 7 * 24 * 3600;  // 604800s

describe('computeBurnExtrapolation', () => {
  describe('basic math', () => {
    it('computes burnRateSec as usedPct / elapsedSec', () => {
      // 25% of 5h elapsed (4500s), 50% used → burnRate = 50/4500
      const elapsedSec = WINDOW_5H * 0.25;
      const result = computeBurnExtrapolation(50, elapsedSec, WINDOW_5H - elapsedSec);
      expect(result.burnRateSec).toBeCloseTo(50 / 4500, 10);
    });

    it('returns elapsedSec and remainingSec unchanged', () => {
      const elapsedSec = 3600;
      const remainingSec = WINDOW_5H - elapsedSec;
      const result = computeBurnExtrapolation(25, elapsedSec, remainingSec);
      expect(result.elapsedSec).toBe(elapsedSec);
      expect(result.remainingSec).toBe(remainingSec);
    });

    it('computes delta = usedPct - elapsedPct', () => {
      // 25% elapsed of 5h, 50% used → elapsedPct = 25, delta = 25
      const elapsedSec = WINDOW_5H * 0.25;
      const remainingSec = WINDOW_5H - elapsedSec;
      const result = computeBurnExtrapolation(50, elapsedSec, remainingSec);
      expect(result.delta).toBeCloseTo(25, 5);
    });

    it('computes negative delta when usage is below pace', () => {
      // 75% elapsed, 25% used → delta = 25 - 75 = -50
      const elapsedSec = WINDOW_5H * 0.75;
      const remainingSec = WINDOW_5H - elapsedSec;
      const result = computeBurnExtrapolation(25, elapsedSec, remainingSec);
      expect(result.delta).toBeCloseTo(-50, 5);
    });

    it('delta is near zero when on pace', () => {
      const elapsedSec = WINDOW_5H * 0.5;
      const remainingSec = WINDOW_5H - elapsedSec;
      const result = computeBurnExtrapolation(50, elapsedSec, remainingSec);
      expect(Math.abs(result.delta)).toBeLessThan(0.01);
    });

    it('computes timeToExhaustSec = (100 - usedPct) / burnRateSec', () => {
      // 50% used at 4500s elapsed → burnRate = 50/4500 → TTE = 50 / (50/4500) = 4500s
      const elapsedSec = WINDOW_5H * 0.25;
      const remainingSec = WINDOW_5H - elapsedSec;
      const result = computeBurnExtrapolation(50, elapsedSec, remainingSec);
      expect(result.timeToExhaustSec).toBeCloseTo(4500, 0);
    });

    it('TTE in seconds matches pace.ts timeToExhaustion * 60', () => {
      // 50% used at 4500s elapsed → TTE = 4500s = 75 min
      const elapsedSec = 4500;
      const remainingSec = WINDOW_5H - elapsedSec;
      const result = computeBurnExtrapolation(50, elapsedSec, remainingSec);
      expect(result.timeToExhaustSec / 60).toBeCloseTo(75, 5);
    });

    it('willExhaustBefore=true when TTE < remainingSec', () => {
      // 1d elapsed of 7d, 50% used → TTE = 86400s < 518400s remaining
      const elapsedSec = 86400;
      const remainingSec = WINDOW_7D - elapsedSec;
      const result = computeBurnExtrapolation(50, elapsedSec, remainingSec);
      expect(result.willExhaustBefore).toBe(true);
    });

    it('willExhaustBefore=false when TTE > remainingSec', () => {
      // 6d elapsed, 5% used → TTE >> 1d remaining
      const elapsedSec = 518400;
      const remainingSec = WINDOW_7D - elapsedSec;
      const result = computeBurnExtrapolation(5, elapsedSec, remainingSec);
      expect(result.willExhaustBefore).toBe(false);
    });

    it('willExhaustBefore=false when TTE === remainingSec (strict less than)', () => {
      // 50% elapsed, 50% used → TTE = elapsedSec = remainingSec exactly
      const elapsedSec = WINDOW_7D / 2;
      const remainingSec = WINDOW_7D - elapsedSec;
      const result = computeBurnExtrapolation(50, elapsedSec, remainingSec);
      expect(result.willExhaustBefore).toBe(false);
    });
  });

  describe('delta > 0 ↔ willExhaustBefore equivalence', () => {
    it('delta > 0 implies willExhaustBefore=true', () => {
      // 50% used at 25% elapsed → delta = +25
      const elapsedSec = WINDOW_7D * 0.25;
      const remainingSec = WINDOW_7D - elapsedSec;
      const result = computeBurnExtrapolation(50, elapsedSec, remainingSec);
      expect(result.delta).toBeGreaterThan(0);
      expect(result.willExhaustBefore).toBe(true);
    });

    it('delta < 0 implies willExhaustBefore=false', () => {
      // 25% used at 75% elapsed → delta = -50
      const elapsedSec = WINDOW_7D * 0.75;
      const remainingSec = WINDOW_7D - elapsedSec;
      const result = computeBurnExtrapolation(25, elapsedSec, remainingSec);
      expect(result.delta).toBeLessThan(0);
      expect(result.willExhaustBefore).toBe(false);
    });

    it('delta === 0 (exactly on pace) implies willExhaustBefore=false', () => {
      // 50% used at 50% elapsed → delta = 0, TTE = remainingSec exactly
      const elapsedSec = WINDOW_7D / 2;
      const remainingSec = WINDOW_7D - elapsedSec;
      const result = computeBurnExtrapolation(50, elapsedSec, remainingSec);
      expect(result.delta).toBeCloseTo(0, 10);
      expect(result.willExhaustBefore).toBe(false);
    });

    it('delta > 0 and willExhaustBefore always agree across multiple scenarios', () => {
      const scenarios = [
        { usedPct: 10, elapsedFrac: 0.5 },   // delta < 0
        { usedPct: 60, elapsedFrac: 0.5 },   // delta > 0
        { usedPct: 99, elapsedFrac: 0.1 },   // delta >> 0
        { usedPct: 1,  elapsedFrac: 0.9 },   // delta << 0
      ];
      for (const { usedPct, elapsedFrac } of scenarios) {
        const elapsedSec = WINDOW_7D * elapsedFrac;
        const remainingSec = WINDOW_7D - elapsedSec;
        const r = computeBurnExtrapolation(usedPct, elapsedSec, remainingSec);
        expect(r.delta > 0).toBe(r.willExhaustBefore);
      }
    });
  });

  describe('edge cases', () => {
    it('usedPct = 100 → TTE = 0, willExhaustBefore=true (TTE 0 < any positive remainingSec)', () => {
      const elapsedSec = WINDOW_5H * 0.5;
      const remainingSec = WINDOW_5H - elapsedSec;
      const result = computeBurnExtrapolation(100, elapsedSec, remainingSec);
      expect(result.timeToExhaustSec).toBeCloseTo(0, 5);
      expect(result.willExhaustBefore).toBe(true);
    });

    it('usedPct = 0 → burnRateSec = 0, timeToExhaustSec = Infinity, willExhaustBefore=false', () => {
      const elapsedSec = WINDOW_5H * 0.5;
      const remainingSec = WINDOW_5H - elapsedSec;
      const result = computeBurnExtrapolation(0, elapsedSec, remainingSec);
      expect(result.burnRateSec).toBe(0);
      expect(result.timeToExhaustSec).toBe(Infinity);
      expect(result.willExhaustBefore).toBe(false);
    });

    it('windowSec passed indirectly via elapsedSec+remainingSec: different windows produce same math given same fractions', () => {
      // The function only needs elapsedSec, remainingSec — not windowSec directly
      const elapsedFrac = 0.25;
      const usedPct = 50;

      const elapsed5h = WINDOW_5H * elapsedFrac;
      const result5h = computeBurnExtrapolation(usedPct, elapsed5h, WINDOW_5H - elapsed5h);

      const elapsed7d = WINDOW_7D * elapsedFrac;
      const result7d = computeBurnExtrapolation(usedPct, elapsed7d, WINDOW_7D - elapsed7d);

      // delta is the same (purely from fraction)
      expect(result5h.delta).toBeCloseTo(result7d.delta, 5);
      // Both are ahead → willExhaustBefore=true
      expect(result5h.willExhaustBefore).toBe(true);
      expect(result7d.willExhaustBefore).toBe(true);
    });

    it('deterministic — same inputs same output', () => {
      const elapsedSec = 3600;
      const remainingSec = WINDOW_5H - elapsedSec;
      const a = computeBurnExtrapolation(40, elapsedSec, remainingSec);
      const b = computeBurnExtrapolation(40, elapsedSec, remainingSec);
      expect(a).toEqual(b);
    });

    it('very small elapsedSec (1s) does not throw or produce NaN for normal usedPct', () => {
      const result = computeBurnExtrapolation(1, 1, WINDOW_5H - 1);
      expect(Number.isFinite(result.burnRateSec)).toBe(true);
      expect(Number.isFinite(result.timeToExhaustSec)).toBe(true);
      expect(Number.isFinite(result.delta)).toBe(true);
    });
  });
});
