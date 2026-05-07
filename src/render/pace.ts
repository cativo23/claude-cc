import { debug } from '../utils/debug.js';

const log = debug('pace');

export interface PaceDelta {
  delta: number;          // usedPct - elapsedPct (positive = ahead, negative = behind)
  timeToExhaustion: number | null;  // minutes remaining at current burn rate (null if behind pace)
}

export function computePaceDelta(
  usedPercentage: number,
  resetsAt: number | undefined,
  nowSec?: number,  // injectable for testing, defaults to Date.now()/1000
): PaceDelta | null {
  const now = nowSec ?? Date.now() / 1000;

  if (resetsAt === undefined || resetsAt <= now) {
    if (log.enabled) log({ reason: 'no resetsAt or already past', resetsAt, now });
    return null;
  }

  const totalWindowSec = 5 * 3600;
  const remainingSec = resetsAt - now;
  const elapsedSec = totalWindowSec - remainingSec;

  if (elapsedSec < 300) {
    if (log.enabled) log({ reason: 'insufficient data (<5min)', elapsedSec, remainingSec });
    return null;
  }

  const elapsedPct = (elapsedSec / totalWindowSec) * 100;
  const delta = usedPercentage - elapsedPct;

  let timeToExhaustion: number | null = null;
  if (delta > 0 && usedPercentage > 0) {
    // burn rate = usedPercentage / elapsedSec (pct per second)
    // time to exhaust remaining (100 - usedPercentage) pct at that rate
    timeToExhaustion = (100 - usedPercentage) / (usedPercentage / elapsedSec) / 60;
  }

  if (log.enabled) {
    log({
      usedPercentage,
      resetsAt,
      now,
      elapsedSec: Math.round(elapsedSec),
      elapsedMin: Math.round(elapsedSec / 60),
      remainingSec: Math.round(remainingSec),
      remainingMin: Math.round(remainingSec / 60),
      elapsedPct: Math.round(elapsedPct * 10) / 10,
      delta: Math.round(delta * 10) / 10,
      timeToExhaustionMin: timeToExhaustion != null ? Math.round(timeToExhaustion) : null,
    });
  }

  return { delta, timeToExhaustion };
}

export function formatPaceDelta(pace: PaceDelta): string {
  const rounded = Math.round(pace.delta);

  if (pace.delta > -1 && pace.delta < 1) return 'on pace';

  if (pace.delta > 0) {
    let suffix = '';
    if (pace.timeToExhaustion != null) {
      const mins = Math.round(pace.timeToExhaustion);
      if (mins > 0) {
        suffix = mins >= 60
          ? ` (~${Math.round(mins / 60)}h)`
          : ` (~${mins}min)`;
      }
    }
    return `+${rounded}%${suffix}`;
  }

  return `${rounded}%`;
}
