/**
 * API latency widget — exposes the ratio of API wait time to wall-clock session
 * duration as an integer percentage: "API 73%".
 *
 * Distinguishes "API is slow" from "Claude is thinking or running tools" —
 * a signal no competing statusline currently surfaces.
 */
/**
 * Compute the API latency percentage.
 *
 * Returns null (nothing renders) when:
 *   - durationMs is undefined or zero (no wall-clock data)
 *   - apiDurationMs is undefined (field absent from payload — old CC version)
 *
 * Returns 0 when apiDurationMs is 0 and durationMs > 0 (legitimate: only
 * local work so far — do not fabricate "API 0%" from a missing field).
 *
 * Clamps result to [0, 100] to handle clock skew where api > wall-clock.
 */
export function computeApiLatency(durationMs, apiDurationMs) {
    // Defend at the boundary against NaN/Infinity from malformed payloads — without
    // Number.isFinite, NaN flows through Math.round + Math.min/max and renders
    // "API NaN%" to the user. Matches the defensive pattern at colors.ts:149 and
    // line2.ts:175 for rate-limit usedPercentage.
    if (!durationMs || !Number.isFinite(durationMs))
        return null;
    if (apiDurationMs === undefined || !Number.isFinite(apiDurationMs))
        return null;
    const raw = (apiDurationMs / durationMs) * 100;
    return Math.max(0, Math.min(100, Math.round(raw)));
}
/** Format as "API N%" matching the "MCP N" / "on pace" plain-prefix pattern. */
export function formatApiLatency(pct) {
    return `API ${pct}%`;
}
//# sourceMappingURL=api-latency.js.map