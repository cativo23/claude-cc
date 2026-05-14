import { describe, it, expect } from 'vitest';
import { computeQuotaProjection, formatProjectionWarning } from '../../src/render/quota-projection.js';

// Deterministic clock for tests
const NOW = 1_000_000; // seconds since epoch
// 7d window in seconds
const WINDOW_7D = 7 * 24 * 3600;
// 5h window in seconds (used to verify the same module works for the shorter window)
const WINDOW_5H = 5 * 3600;

describe('computeQuotaProjection', () => {
  describe('null guards', () => {
    it('returns null when resetsAt is undefined', () => {
      expect(computeQuotaProjection(50, undefined, WINDOW_7D, NOW)).toBeNull();
    });

    it('returns null when resetsAt is in the past', () => {
      expect(computeQuotaProjection(50, NOW - 1, WINDOW_7D, NOW)).toBeNull();
    });

    it('returns null when resetsAt equals now (boundary)', () => {
      expect(computeQuotaProjection(50, NOW, WINDOW_7D, NOW)).toBeNull();
    });

    it('returns null when usedPct is 0 (no burn rate to project from)', () => {
      const resetsAt = NOW + (WINDOW_7D - 7200); // 2h elapsed
      expect(computeQuotaProjection(0, resetsAt, WINDOW_7D, NOW)).toBeNull();
    });

    it('returns null when usedPct is negative', () => {
      const resetsAt = NOW + (WINDOW_7D - 7200);
      expect(computeQuotaProjection(-5, resetsAt, WINDOW_7D, NOW)).toBeNull();
    });

    it('returns null when usedPct is NaN', () => {
      const resetsAt = NOW + (WINDOW_7D - 7200);
      expect(computeQuotaProjection(Number.NaN, resetsAt, WINDOW_7D, NOW)).toBeNull();
    });

    it('returns null when usedPct is Infinity', () => {
      const resetsAt = NOW + (WINDOW_7D - 7200);
      expect(computeQuotaProjection(Number.POSITIVE_INFINITY, resetsAt, WINDOW_7D, NOW)).toBeNull();
    });

    it('returns null when usedPct >= 100 (already exhausted)', () => {
      const resetsAt = NOW + (WINDOW_7D - 7200);
      expect(computeQuotaProjection(100, resetsAt, WINDOW_7D, NOW)).toBeNull();
      expect(computeQuotaProjection(101, resetsAt, WINDOW_7D, NOW)).toBeNull();
    });
  });

  describe('minElapsedSec guard', () => {
    it('returns null when elapsedSec < default minElapsedSec (300)', () => {
      // 4 minutes elapsed (240s)
      const resetsAt = NOW + (WINDOW_7D - 240);
      expect(computeQuotaProjection(10, resetsAt, WINDOW_7D, NOW)).toBeNull();
    });

    it('returns non-null at exactly default minElapsedSec (300s) elapsed', () => {
      const resetsAt = NOW + (WINDOW_7D - 300);
      const result = computeQuotaProjection(10, resetsAt, WINDOW_7D, NOW);
      expect(result).not.toBeNull();
    });

    it('returns null when elapsedSec < custom minElapsedSec (3600 for 7d window)', () => {
      // 30 minutes elapsed
      const resetsAt = NOW + (WINDOW_7D - 1800);
      expect(computeQuotaProjection(10, resetsAt, WINDOW_7D, NOW, 3600)).toBeNull();
    });

    it('returns non-null at exactly custom minElapsedSec (3600s) elapsed', () => {
      const resetsAt = NOW + (WINDOW_7D - 3600);
      const result = computeQuotaProjection(10, resetsAt, WINDOW_7D, NOW, 3600);
      expect(result).not.toBeNull();
    });

    it('high burn-rate trap: 10% burned in 1h with minElapsed=300 would project exhaust, but minElapsed=3600 hides it', () => {
      // 1h elapsed of 7d window, 10% used.
      // burnRate = 10 / 3600 pct/s → TTE = 90 / (10/3600) = 32400s (9h). Way before reset (7d).
      // willExhaustBefore=true, BUT this is too aggressive — minElapsed=3600 should suppress.
      const resetsAt = NOW + (WINDOW_7D - 3600);
      // With default (300): would compute and warn
      expect(computeQuotaProjection(10, resetsAt, WINDOW_7D, NOW)).not.toBeNull();
      // With 7d override (3600): exactly at boundary, computes
      expect(computeQuotaProjection(10, resetsAt, WINDOW_7D, NOW, 3600)).not.toBeNull();
      // With 3601 minElapsed: blocked
      expect(computeQuotaProjection(10, resetsAt, WINDOW_7D, NOW, 3601)).toBeNull();
    });
  });

  describe('willExhaustBefore', () => {
    it('willExhaustBefore=true when projected exhaustion is before resetsAt', () => {
      // 1d elapsed of 7d → 86400s elapsed, 518400s remaining
      // 50% used → burnRate = 50/86400 → TTE = 50 / (50/86400) = 86400s = 1d. < 6d remaining.
      const elapsedSec = 86400;
      const resetsAt = NOW + (WINDOW_7D - elapsedSec);
      const result = computeQuotaProjection(50, resetsAt, WINDOW_7D, NOW, 3600);
      expect(result).not.toBeNull();
      expect(result!.willExhaustBefore).toBe(true);
    });

    it('willExhaustBefore=false when projected exhaustion is after resetsAt', () => {
      // 6d elapsed of 7d → 518400s elapsed, 86400s remaining
      // 5% used → burnRate very low → TTE = 95 / (5/518400) = 9849600s = 114d. >> 1d remaining.
      const elapsedSec = 518400; // 6 days
      const resetsAt = NOW + (WINDOW_7D - elapsedSec);
      const result = computeQuotaProjection(5, resetsAt, WINDOW_7D, NOW, 3600);
      expect(result).not.toBeNull();
      expect(result!.willExhaustBefore).toBe(false);
    });

    it('willExhaustBefore=false at exact boundary (TTE === remainingSec)', () => {
      // Construct a case where TTE exactly equals remainingSec.
      // 50% elapsed of window, 50% used → burnRate matches → TTE = remaining exactly.
      // elapsedSec = WINDOW_7D / 2 = 302400; remaining = 302400
      // TTE = (100 - 50) / (50 / 302400) = 50 / 0.0001653... = 302400s exactly.
      const elapsedSec = WINDOW_7D / 2;
      const resetsAt = NOW + (WINDOW_7D - elapsedSec);
      const result = computeQuotaProjection(50, resetsAt, WINDOW_7D, NOW, 3600);
      expect(result).not.toBeNull();
      // Exactly at boundary: NOT strictly before → false
      expect(result!.willExhaustBefore).toBe(false);
    });
  });

  describe('timeToExhaustSec computation', () => {
    it('25% elapsed at 50% used → burn 2x → TTE = elapsed (since 50% remaining at burn rate that did 50% in elapsed)', () => {
      // elapsedSec = WINDOW_7D / 4 = 151200s; 50% used
      // burnRate = 50/151200 pct/s
      // TTE = (100 - 50) / (50 / 151200) = 151200s
      const elapsedSec = WINDOW_7D / 4;
      const resetsAt = NOW + (WINDOW_7D - elapsedSec);
      const result = computeQuotaProjection(50, resetsAt, WINDOW_7D, NOW, 3600);
      expect(result).not.toBeNull();
      expect(result!.timeToExhaustSec).toBeCloseTo(151200, 0);
    });

    it('works for 5h window too (module is window-agnostic)', () => {
      // 1h elapsed of 5h, 25% used → TTE = (100 - 25) / (25 / 3600) = 75 * 3600 / 25 = 10800s = 3h
      // Remaining = 4h. 3h < 4h → willExhaustBefore=true.
      const elapsedSec = 3600;
      const resetsAt = NOW + (WINDOW_5H - elapsedSec);
      const result = computeQuotaProjection(25, resetsAt, WINDOW_5H, NOW);
      expect(result).not.toBeNull();
      expect(result!.timeToExhaustSec).toBeCloseTo(10800, 0);
      expect(result!.willExhaustBefore).toBe(true);
    });

    it('nowSec is injectable — deterministic across runs', () => {
      const elapsedSec = 86400;
      const resetsAt = NOW + (WINDOW_7D - elapsedSec);
      const a = computeQuotaProjection(40, resetsAt, WINDOW_7D, NOW, 3600);
      const b = computeQuotaProjection(40, resetsAt, WINDOW_7D, NOW, 3600);
      expect(a).toEqual(b);
    });
  });
});

describe('formatProjectionWarning', () => {
  // Helper to construct a QuotaProjection without going through compute (lets us
  // exercise format ranges directly).
  const proj = (timeToExhaustSec: number) => ({ timeToExhaustSec, willExhaustBefore: true });

  describe('icon tier', () => {
    it('uses 🔥 when timeToExhaustSec < 12h (critical)', () => {
      const out = formatProjectionWarning(proj(6 * 3600));
      expect(out).toContain('🔥');
      expect(out).not.toContain('⚠');
    });

    it('uses ⚠ when timeToExhaustSec >= 12h (warning)', () => {
      const out = formatProjectionWarning(proj(13 * 3600));
      expect(out).toContain('⚠');
      expect(out).not.toContain('🔥');
    });

    it('uses ⚠ at exactly 12h boundary (boundary is non-critical)', () => {
      const out = formatProjectionWarning(proj(12 * 3600));
      expect(out).toContain('⚠');
      expect(out).not.toContain('🔥');
    });
  });

  describe('time formatting', () => {
    it('< 1h → "~Xmin"', () => {
      expect(formatProjectionWarning(proj(45 * 60))).toBe('🔥 ~45min');
      expect(formatProjectionWarning(proj(59 * 60))).toBe('🔥 ~59min');
    });

    it('rounds sub-minute up to nearest minute', () => {
      expect(formatProjectionWarning(proj(90))).toBe('🔥 ~2min'); // 90s → 2min
    });

    it('1h to <48h → "~Xh"', () => {
      expect(formatProjectionWarning(proj(60 * 60))).toBe('🔥 ~1h');
      expect(formatProjectionWarning(proj(11 * 3600))).toBe('🔥 ~11h');
      expect(formatProjectionWarning(proj(24 * 3600))).toBe('⚠ ~24h');
      expect(formatProjectionWarning(proj(47 * 3600))).toBe('⚠ ~47h');
    });

    it('2d to <7d → "~Xd"', () => {
      expect(formatProjectionWarning(proj(2 * 24 * 3600))).toBe('⚠ ~2d');
      expect(formatProjectionWarning(proj(5 * 24 * 3600))).toBe('⚠ ~5d');
      expect(formatProjectionWarning(proj(6 * 24 * 3600 + 12 * 3600))).toBe('⚠ ~6d'); // 6.5d → 6d (floor)
    });

    it('>= 7d → weekday name in en-US (pinned locale)', () => {
      // Use timeZone=UTC for determinism — pin both locale and tz in tests.
      // Pick a "now" we can verify: 2026-01-05 is a Monday in UTC.
      // Unix epoch 1767571200 = 2026-01-05T00:00:00Z (Monday UTC).
      const mondayUtc = 1_767_571_200;
      // Project 8 days from "now" → 2026-01-13 = Tuesday UTC
      const out = formatProjectionWarning(
        proj(8 * 24 * 3600),
        mondayUtc,
        'UTC',
      );
      expect(out).toBe('⚠ Tue');
    });

    it('exactly 7d → weekday format (not "~7d")', () => {
      const mondayUtc = 1_767_571_200; // 2026-01-05 Mon UTC
      // 7d from now → 2026-01-12 = Monday UTC
      const out = formatProjectionWarning(
        proj(7 * 24 * 3600),
        mondayUtc,
        'UTC',
      );
      expect(out).toBe('⚠ Mon');
    });
  });

  describe('locale pin (en-US)', () => {
    it('returns 3-letter English short weekday regardless of system locale', () => {
      const mondayUtc = 1_767_571_200; // 2026-01-05 Mon UTC
      // 9 days later → Wed UTC
      const out = formatProjectionWarning(proj(9 * 24 * 3600), mondayUtc, 'UTC');
      // 3-letter English short weekday
      expect(out).toMatch(/^⚠ (Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
      expect(out).toBe('⚠ Wed');
    });
  });

  describe('willExhaustBefore=false', () => {
    it('returns empty string when willExhaustBefore is false', () => {
      const out = formatProjectionWarning({ timeToExhaustSec: 999999, willExhaustBefore: false });
      expect(out).toBe('');
    });
  });
});
