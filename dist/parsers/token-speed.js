import { readTtlCache, writeTtlCache } from '../utils/cache.js';
import { tmpdir } from 'node:os';
const SPEED_CACHE_TTL = 2000;
export function getTokenSpeed(contextWindow, cacheDir = tmpdir()) {
    const cu = contextWindow?.current_usage;
    const outputTokens = typeof cu === "number" ? cu : cu?.output_tokens;
    if (typeof outputTokens !== 'number' || !Number.isFinite(outputTokens))
        return null;
    const now = Date.now();
    const previous = readTtlCache('speed', cacheDir, SPEED_CACHE_TTL);
    let speed = null;
    if (previous && outputTokens >= previous.outputTokens) {
        const deltaTokens = outputTokens - previous.outputTokens;
        const deltaMs = now - previous.timestamp;
        if (deltaTokens > 0 && deltaMs > 0 && deltaMs <= SPEED_CACHE_TTL) {
            speed = Math.round(deltaTokens / (deltaMs / 1000));
        }
    }
    writeTtlCache('speed', { outputTokens, timestamp: now }, cacheDir);
    return speed;
}
//# sourceMappingURL=token-speed.js.map