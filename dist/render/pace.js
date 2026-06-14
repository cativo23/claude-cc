import { debug } from '../utils/debug.js';
import { computeBurnExtrapolation } from './burn-math.js';
const log = debug('pace');
export function computePaceDelta(usedPercentage, resetsAt, nowSec) {
    const now = nowSec ?? Date.now() / 1000;
    if (resetsAt === undefined || resetsAt <= now) {
        if (log.enabled)
            log({ reason: 'no resetsAt or already past', resetsAt, now });
        return null;
    }
    const totalWindowSec = 5 * 3600;
    const remainingSec = resetsAt - now;
    const elapsedSec = totalWindowSec - remainingSec;
    if (elapsedSec < 300) {
        if (log.enabled)
            log({ reason: 'insufficient data (<5min)', elapsedSec, remainingSec });
        return null;
    }
    const burn = computeBurnExtrapolation(usedPercentage, elapsedSec, remainingSec);
    const timeToExhaustion = burn.delta > 0 && usedPercentage > 0
        ? burn.timeToExhaustSec / 60
        : null;
    if (log.enabled) {
        const elapsedPct = (elapsedSec / totalWindowSec) * 100;
        log({
            usedPercentage,
            resetsAt,
            now,
            elapsedSec: Math.round(elapsedSec),
            elapsedMin: Math.round(elapsedSec / 60),
            remainingSec: Math.round(remainingSec),
            remainingMin: Math.round(remainingSec / 60),
            elapsedPct: Math.round(elapsedPct * 10) / 10,
            delta: Math.round(burn.delta * 10) / 10,
            timeToExhaustionMin: timeToExhaustion != null ? Math.round(timeToExhaustion) : null,
        });
    }
    return { delta: burn.delta, timeToExhaustion };
}
export function formatPaceDelta(pace) {
    const rounded = Math.round(pace.delta);
    if (pace.delta > -1 && pace.delta < 1)
        return 'on pace';
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
//# sourceMappingURL=pace.js.map