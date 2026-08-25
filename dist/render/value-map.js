/**
 * Custom-widget value parsing (see CustomCommandValueTier in types.ts).
 *
 * Deliberately strict, no extraction: accepts ONLY a string that IS a
 * number (optionally with a trailing `%`), never a number embedded in
 * richer text (`"cpu 42"`, `"42ms"`). A widget that needs a number out of
 * noisier output is expected to do that extraction itself (`awk`, `grep
 * -oP`, ...) — same "keep lumira's surface small, push complexity to the
 * user's own script" philosophy as `command` being an argv array with no
 * shell expansion. Total-parse-or-nothing avoids the ambiguity of partial
 * matches (`"1,024"` — 1 or 1024? `"1e3"` — scientific notation or a typo?).
 */
const NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/;
export function parseWidgetValue(text) {
    const trimmed = text.trim();
    if (!NUMERIC_PATTERN.test(trimmed))
        return null;
    const n = Number(trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed);
    return Number.isFinite(n) ? n : null;
}
/**
 * Find the first tier whose exclusive upper bound (`lt`) the value falls
 * under, or the catch-all tier (no `lt`) if present. Callers are expected to
 * pass an already-normalized ladder — config parsing sorts ascending by `lt`
 * and forces the catch-all last — so this is a simple linear scan, not a
 * sort. Returns undefined only when nothing matches (value exceeds every
 * `lt` and there's no catch-all), which callers treat the same as "no
 * valueMap": render the plain text with the widget's static color/label.
 */
export function matchValueTier(tiers, value) {
    for (const tier of tiers) {
        if (tier.lt === undefined || value < tier.lt)
            return tier;
    }
    return undefined;
}
//# sourceMappingURL=value-map.js.map