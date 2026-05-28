export interface BurnExtrapolation {
  burnRateSec: number;
  elapsedSec: number;
  remainingSec: number;
  delta: number;
  timeToExhaustSec: number;
  willExhaustBefore: boolean;
}

export function computeBurnExtrapolation(
  usedPct: number,
  elapsedSec: number,
  remainingSec: number,
): BurnExtrapolation {
  const windowSec = elapsedSec + remainingSec;
  const elapsedPct = (elapsedSec / windowSec) * 100;
  const delta = usedPct - elapsedPct;
  const burnRateSec = usedPct / elapsedSec;
  const timeToExhaustSec = (100 - usedPct) / burnRateSec;
  const willExhaustBefore = timeToExhaustSec < remainingSec;

  return { burnRateSec, elapsedSec, remainingSec, delta, timeToExhaustSec, willExhaustBefore };
}
