import { debug } from '../utils/debug.js';

const log = debug('quota-projection');

export interface QuotaProjection {
  /** Seconds from `now` until the quota is projected to hit 100% at current burn rate. */
  timeToExhaustSec: number;
  /** True when timeToExhaustSec is strictly less than the seconds remaining until resetsAt. */
  willExhaustBefore: boolean;
}

/**
 * Extrapolates current burn rate to when the quota would hit 100%.
 *
 * Window-agnostic: caller passes `windowSec` (e.g. 5*3600 for 5h, 7*24*3600 for 7d).
 * The 7d caller must override `minElapsedSec` to 3600 — the default 300s is the right
 * floor for a 5h window but too aggressive for 7d: a user who burns 10% in the first
 * hour would otherwise trigger projection warnings the steady-state rate won't sustain.
 */
export function computeQuotaProjection(
  usedPct: number,
  resetsAt: number | undefined,
  windowSec: number,
  nowSec?: number,
  minElapsedSec: number = 300,
): QuotaProjection | null {
  const now = nowSec ?? Date.now() / 1000;

  if (resetsAt === undefined || resetsAt <= now) {
    if (log.enabled) log({ reason: 'no resetsAt or already past', resetsAt, now });
    return null;
  }

  if (!Number.isFinite(usedPct) || usedPct <= 0 || usedPct >= 100) {
    if (log.enabled) log({ reason: 'usedPct out of projectable range', usedPct });
    return null;
  }

  const remainingSec = resetsAt - now;
  const elapsedSec = windowSec - remainingSec;

  if (elapsedSec < minElapsedSec) {
    if (log.enabled) log({ reason: 'insufficient elapsed', elapsedSec, minElapsedSec });
    return null;
  }

  // burnRate is in pct-per-second
  const burnRate = usedPct / elapsedSec;
  const timeToExhaustSec = (100 - usedPct) / burnRate;
  const willExhaustBefore = timeToExhaustSec < remainingSec;

  if (log.enabled) {
    log({
      usedPct,
      elapsedSec: Math.round(elapsedSec),
      remainingSec: Math.round(remainingSec),
      burnRate,
      timeToExhaustSec: Math.round(timeToExhaustSec),
      willExhaustBefore,
    });
  }

  return { timeToExhaustSec, willExhaustBefore };
}

/**
 * Renders a projection as a short warning string (e.g. "⚠ Mon", "🔥 ~12h").
 *
 * Returns "" when the projection does not predict exhaustion before reset. Caller
 * may still call with `willExhaustBefore=false`; nothing breaks, output is just empty.
 *
 * `timeZone` parameter is for test determinism — in production callers omit it so
 * weekday names render in the user's local TZ. Tests pin `timeZone='UTC'` to keep
 * snapshots reproducible across CI runners.
 */
export function formatProjectionWarning(
  proj: QuotaProjection,
  nowSec?: number,
  timeZone?: string,
): string {
  if (!proj.willExhaustBefore) return '';

  const tte = proj.timeToExhaustSec;
  const icon = tte < 12 * 3600 ? '🔥' : '⚠';

  if (tte < 3600) {
    // < 1h → minutes (ceil so sub-minute values don't render as "~0min")
    const mins = Math.max(1, Math.ceil(tte / 60));
    return `${icon} ~${mins}min`;
  }

  if (tte < 48 * 3600) {
    // 1h to <48h → hours
    const hours = Math.floor(tte / 3600);
    return `${icon} ~${hours}h`;
  }

  if (tte < 7 * 24 * 3600) {
    // 2d to <7d → days
    const days = Math.floor(tte / (24 * 3600));
    return `${icon} ~${days}d`;
  }

  // >= 7d → render weekday name. Pin locale to en-US so output is the same
  // 3-letter English abbreviation regardless of the user's system locale,
  // which prevents snapshot drift across machines.
  const now = nowSec ?? Date.now() / 1000;
  const exhaustDate = new Date((now + tte) * 1000);
  const formatOpts: Intl.DateTimeFormatOptions = { weekday: 'short' };
  if (timeZone) formatOpts.timeZone = timeZone;
  const weekday = exhaustDate.toLocaleDateString('en-US', formatOpts);
  return `${icon} ${weekday}`;
}
