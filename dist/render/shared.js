import { NERD_ICONS } from './icons.js';
import { getContextColor, stripAnsi } from './colors.js';
import { formatTokens, toSingleLine } from '../utils/format.js';
import { DEFAULT_CONTEXT_WARNING_THRESHOLD, DEFAULT_CONTEXT_CRITICAL_THRESHOLD } from '../types.js';
export const SEP = ` \x1b[90m\u2502\x1b[0m `;
export const SEP_MINIMAL = ` \x1b[90m|\x1b[0m `;
export const EXCLUDED_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate']);
function adaptiveSegments(cols) {
    if (cols == null || cols >= 100)
        return 20;
    if (cols >= 60)
        return 12;
    return 8;
}
export function buildContextBar(pct, c, opts) {
    const segments = opts?.segments ?? adaptiveSegments(opts?.cols);
    const showIcons = opts?.showIcons ?? true;
    const showHint = opts?.showHint ?? true;
    const plain = opts?.plain ?? false;
    const ic = opts?.iconSet ?? NERD_ICONS;
    const warning = opts?.warningThreshold ?? DEFAULT_CONTEXT_WARNING_THRESHOLD;
    const critical = opts?.criticalThreshold ?? DEFAULT_CONTEXT_CRITICAL_THRESHOLD;
    const safePct = Number.isFinite(pct) ? pct : 0;
    const filled = Math.max(0, Math.min(segments, Math.round((safePct / 100) * segments)));
    const colorFn = c[getContextColor(safePct, warning, critical)];
    // In plain mode the bar cells emit no ANSI — terminal default fg over
    // whatever bg the caller has set. The empty-cell `dim` is also suppressed
    // because `\x1b[2m...\x1b[0m` would still close out the caller's bg.
    const bar = plain
        ? ic.barFull.repeat(filled) + ic.barEmpty.repeat(segments - filled)
        : colorFn(ic.barFull.repeat(filled)) + c.dim(ic.barEmpty.repeat(segments - filled));
    let icon = '';
    if (showIcons) {
        let mainIcon = '';
        if (safePct >= critical)
            mainIcon = c.blinkRed(ic.skull);
        else if (safePct >= warning)
            mainIcon = c.orange(ic.fire);
        // Auto-compact proximity warning — additive glyph, independent of color tier.
        // Decoupled from user thresholds because it reflects a platform constraint
        // (Claude reserves output buffer; Qwen has its own compression threshold).
        const compactIcon = opts?.nearAutoCompact ? c.red(ic.warning) : '';
        icon = [compactIcon, mainIcon].filter(Boolean).join(' ');
    }
    // Actionable hint at high fill — nudges the user to reclaim context before
    // the session stalls. Thresholds align with the color/icon tiers above.
    let hint = '';
    if (showHint) {
        if (safePct >= critical + 5)
            hint = ' ' + c.red('/compact!');
        else if (safePct >= critical)
            hint = ' ' + c.dim('/compact?');
    }
    const rounded = Math.round(safePct * 10) / 10;
    const pctStr = colorFn(`${rounded < 10 ? rounded.toFixed(1) : Math.round(rounded)}%`);
    const out = `${bar} ${pctStr}${icon ? ' ' + icon : ''}${hint}`;
    if (plain) {
        // Inside a powerline segment, a literal `\x1b[0m` would clear the
        // caller-set background and leak the terminal default bg through the
        // remaining segment text. Replace each full reset with a partial reset
        // that clears fg + intensity + blink but leaves bg untouched, so the
        // segment bg flows continuously across the colored % and warning glyph.
        return out.replace(/\x1b\[0m/g, '\x1b[39;22;25m');
    }
    return out;
}
export function getActiveTodo(transcript) {
    const inProgress = transcript.todos.filter(t => t.status === 'in_progress');
    return inProgress[0]?.content;
}
export function formatGitChanges(git, c) {
    const parts = [];
    if (git.staged > 0)
        parts.push(c.green(`+${git.staged}`));
    if (git.modified > 0)
        parts.push(c.yellow(`!${git.modified}`));
    if (git.untracked > 0)
        parts.push(c.gray(`?${git.untracked}`));
    return parts;
}
/**
 * Filter custom command outputs to those that should render on the given line.
 * Hidden-state outputs are dropped — they exist in the parser result so the
 * caller has full visibility, but renderers MUST treat them as if they were
 * absent. `undefined` ctx input is normalized to an empty array so test
 * fixtures without customCommands continue to work.
 */
export function getCustomCommandsForLine(outputs, line) {
    if (!outputs)
        return [];
    return outputs.filter(o => o.line === line && o.state !== 'hidden');
}
/**
 * Render a single CustomCommandOutput into a styled segment string.
 *
 * - `hidden`           → '' (caller should also have filtered via
 *                        getCustomCommandsForLine, but defensive empty here).
 * - `ansi: false`      → ANSI sequences are stripped from the raw text and the
 *                        configured `color` is applied. Default.
 * - `ansi: true`       → user-supplied ANSI is passed through verbatim;
 *                        `color` is intentionally NOT applied (we'd be
 *                        layering escapes over the user's existing ones).
 * - `state: 'stale'`   → entire rendered output is dimmed *after* any color
 *                        is applied. Mirrors the parser contract: stale means
 *                        a refresh is in flight and the value displayed may
 *                        be one tick old.
 * - `label`            → prepended with a single-space separator. Useful for
 *                        glyph prefixes (e.g. " " or "[ci]").
 *
 * Defensive about the color attr: when the parser emits an unrecognised value
 * (shouldn't happen given config validation, but the type isn't load-bearing
 * enough to assert at runtime), we fall through to no color rather than
 * throwing — the renderer must never crash on user data.
 */
export function renderCustomCommand(output, c) {
    if (output.state === 'hidden')
        return '';
    // Defense in depth: custom-refresh.ts already sanitizes newlines before
    // caching, but an entry cached before that existed can still carry a raw
    // `\n` until its next refresh (up to 24h on a long refreshMs) — collapsing
    // here too means the fix is immediate rather than waiting on cache TTL.
    // Safe regardless of `ansi`: no CSI/SGR/OSC escape sequence contains \r/\n.
    const sanitized = toSingleLine(output.text);
    // Strip ANSI from user output unless explicitly opted in. Stripping happens
    // *before* label concatenation so the label can't end up sandwiched inside
    // an unclosed escape sequence.
    let text = output.ansi ? sanitized : stripAnsi(sanitized);
    if (output.label)
        text = `${output.label} ${text}`;
    // Color is only applied when ansi=false; otherwise we'd be wrapping the
    // user's escapes in another escape, which most terminals render as garbage.
    let result = text;
    if (!output.ansi && output.color) {
        const colorMap = {
            dim: c.dim, green: c.green, yellow: c.yellow, orange: c.orange,
            red: c.red, cyan: c.cyan, magenta: c.magenta,
        };
        const fn = colorMap[output.color];
        if (typeof fn === 'function')
            result = fn(text);
    }
    // Stale dimming is the last transform — it must wrap the colored result so
    // the "in-flight refresh" signal is visible regardless of the base color.
    if (output.state === 'stale')
        result = c.dim(result);
    return result;
}
/**
 * PR widget number prefix. CC's own UI shows GitHub pull requests as `#N` and
 * GitLab merge requests as `!N` — same `pr.{number,url,reviewState}` field,
 * platform inferred from `pr.url`. Detection is path-shape-based
 * (`/pull/` vs `/-/merge_requests/`), not hostname-based: GitLab's merge
 * request path is stable across gitlab.com and any self-hosted instance
 * (`git.company.com`, `code.internal`, ...), whereas matching on a hostname
 * substring like "gitlab" both misses self-hosted instances that don't spell
 * the name and false-positives on unrelated hosts that happen to contain it
 * (e.g. a GitHub Pages site at `gitlab.github.io`). Falls back to a
 * gitlab.com hostname check only for the rare case of a non-standard path,
 * and defaults to `#` (GitHub-style) when the url is absent, unparseable, or
 * matches neither shape. `url` is expected to already be `https://`-absolute
 * — normalize.ts enforces that scheme before this ever sees the value — so a
 * scheme-relative or bare-host input isn't a real-world case, just a defensive
 * one covered by the try/catch.
 */
export function getPrPrefix(url) {
    if (!url)
        return '#';
    try {
        const { pathname, hostname } = new URL(url);
        if (pathname.includes('/-/merge_requests/'))
            return '!';
        if (pathname.includes('/pull/'))
            return '#';
        return hostname === 'gitlab.com' || hostname.endsWith('.gitlab.com') ? '!' : '#';
    }
    catch {
        return '#';
    }
}
export function formatQwenMetrics(n, c, icons) {
    const parts = [];
    if (n.performance && n.performance.requests > 0) {
        let reqStr = `${n.performance.requests} req`;
        if (n.performance.errors > 0)
            reqStr += c.red(` (${n.performance.errors} err)`);
        parts.push(c.dim(`${icons.bolt} ${reqStr}`));
    }
    if (n.platform === 'qwen-code' && n.tokens.cached != null && n.tokens.cached > 0) {
        parts.push(c.dim(`${icons.comment} ${formatTokens(n.tokens.cached)} cached`));
    }
    if (n.platform === 'qwen-code' && n.tokens.thoughts != null && n.tokens.thoughts > 0) {
        const label = n.tokens.thoughts === 1 ? 'thought' : 'thoughts';
        parts.push(c.dim(`^${formatTokens(n.tokens.thoughts)} ${label}`));
    }
    return parts;
}
//# sourceMappingURL=shared.js.map