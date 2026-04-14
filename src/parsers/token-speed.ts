import { readTtlCache, writeTtlCache } from '../utils/cache.js';
import { tmpdir } from 'node:os';

const SPEED_CACHE_TTL = 2000;
interface SpeedCache { outputTokens: number; timestamp: number; }
// current_usage: Claude sends {output_tokens: number}, Qwen sends plain number (20369)
interface ContextWindow { used_percentage: number; remaining_percentage: number; current_usage?: number | { output_tokens: number }; }

export function getTokenSpeed(contextWindow: ContextWindow, cacheDir: string = tmpdir()): number | null {
  const cu = contextWindow?.current_usage;
  const outputTokens = typeof cu === "number" ? cu : cu?.output_tokens;
  if (typeof outputTokens !== 'number' || !Number.isFinite(outputTokens)) return null;

  const now = Date.now();
  const previous = readTtlCache<SpeedCache>('speed', cacheDir, SPEED_CACHE_TTL);

  let speed: number | null = null;
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
