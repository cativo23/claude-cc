export function computeBurnExtrapolation(usedPct, elapsedSec, remainingSec) {
    const windowSec = elapsedSec + remainingSec;
    const elapsedPct = (elapsedSec / windowSec) * 100;
    const delta = usedPct - elapsedPct;
    const burnRateSec = usedPct / elapsedSec;
    const timeToExhaustSec = (100 - usedPct) / burnRateSec;
    const willExhaustBefore = timeToExhaustSec < remainingSec;
    return { burnRateSec, elapsedSec, remainingSec, delta, timeToExhaustSec, willExhaustBefore };
}
//# sourceMappingURL=burn-math.js.map