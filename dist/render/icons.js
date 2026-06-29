import { QUOTA_CRITICAL } from '../types.js';
/**
 * Pick the Material Design Nerd Font battery glyph for a given percentage.
 *
 * Bucket dispatch uses `Math.round(pct)` to align with the `.toFixed(0)` text
 * rendered alongside the glyph: a payload of 99.7 displays as "100%" so it
 * must also pick the alert glyph — anything else creates a visible
 * contradiction (text says ceiling, shape doesn't).
 *
 * The alert glyph is reserved for the 100% ceiling — the moment quota is
 * actually exhausted. Below that, the level glyph reads naturally
 * (battery_80, battery_90...) and the urgency tier is carried by the colour
 * (yellow/orange/red via `getQuotaColor`). Color and glyph encode orthogonal
 * info: tier vs level. Alert at 100% says "you hit the ceiling".
 */
function nerdBattery(pct) {
    if (!Number.isFinite(pct) || pct < 0)
        return '\u{F008E}'; // outline — defensive last line
    const rounded = Math.round(pct);
    if (rounded >= 100)
        return '\u{F0083}'; // battery_alert — quota exhausted
    if (rounded >= 90)
        return '\u{F0082}';
    if (rounded >= 80)
        return '\u{F0081}';
    if (rounded >= 70)
        return '\u{F0080}';
    if (rounded >= 60)
        return '\u{F007F}';
    if (rounded >= 50)
        return '\u{F007E}';
    if (rounded >= 40)
        return '\u{F007D}';
    if (rounded >= 30)
        return '\u{F007C}';
    if (rounded >= 20)
        return '\u{F007B}';
    if (rounded >= 10)
        return '\u{F007A}';
    return '\u{F008E}'; // battery_outline — empty/unknown
}
export const NERD_ICONS = {
    model: '', // fa-robot
    branch: '', // dev-git-branch
    folder: '', // fa-folder-open
    fire: '', // fa-fire
    skull: '', // fa-skull
    comment: '', // fa-comment
    clock: '', // fa-clock
    bolt: '', // fa-bolt
    tree: '', // fa-tree
    cubes: '', // fa-cubes
    hammer: '', // fa-hammer
    warning: '', // fa-warning
    barFull: '█', // block full
    barEmpty: '░', // block light
    ellipsis: '…', // ...
    dash: '—', // em-dash
    checkmark: '✓', // checkmark
    car: '🏎️', // racing car — pace-ahead indicator
    turtle: '🐢', // turtle — pace-behind indicator
    lightning: '󱐋', // U+F140B — nerd lightning-bolt (was ⚡ emoji); cache hit rate
    pr: '', // nf-cod-git_pull_request
    repo: '', // U+EA62 nf-cod-repo
    thinking: '󰧑', // U+F09D1 — clearer "thinking" glyph; nf-md-brain (U+F1824) renders faint in many fonts
    battery: nerdBattery,
};
export const EMOJI_ICONS = {
    model: '\u{1F916}', // 🤖
    branch: '\u{1F33F}', // 🌿
    folder: '\u{1F4C2}', // 📂
    fire: '\u{1F525}', // 🔥
    skull: '\u{1F480}', // 💀
    comment: '\u{1F4AC}', // 💬
    clock: '\u{23F1}️', // ⏱️
    bolt: '⚡', // ⚡
    tree: '\u{1F332}', // 🌲
    cubes: '\u{1F4E6}', // 📦
    hammer: '\u{1F528}', // 🔨
    warning: '⚠️', // ⚠️
    barFull: '█',
    barEmpty: '░',
    ellipsis: '…',
    dash: '—',
    checkmark: '✅', // ✅
    car: '\u{1F3CE}️', // 🏎️ — racing car
    turtle: '\u{1F422}', // 🐢 — turtle
    lightning: '⚡', // ⚡ — cache hit rate
    pr: '\u{1F500}', // 🔀 — twisted rightwards arrows (PR)
    repo: '\u{1F4E6}', // 📦 — package (repository)
    thinking: '\u{1F4AD}', // 💭 — thought bubble
    battery: (pct) => {
        if (!Number.isFinite(pct) || pct < 0)
            return '\u{1F50B}'; // 🔋 — no data / invalid input
        if (Math.round(pct) >= 100)
            return '\u{1F480}'; // 💀 — quota exhausted
        if (pct >= QUOTA_CRITICAL)
            return '\u{1FAAB}'; // 🪫 — critical zone
        return '\u{1F50B}'; // 🔋 — normal
    },
};
export const NO_ICONS = {
    model: '',
    branch: '',
    folder: '',
    fire: '!',
    skull: '!!',
    comment: '',
    clock: '',
    bolt: '',
    tree: '',
    cubes: '',
    hammer: '',
    warning: '!',
    barFull: '█',
    barEmpty: '░',
    ellipsis: '…',
    dash: '—',
    checkmark: '✓',
    car: '',
    turtle: '',
    lightning: '',
    pr: 'PR',
    repo: '',
    thinking: 'think',
    // No-icon mode keeps the legacy bolt fallback (currently empty) so users who
    // opted out of icons see no shape change from this feature.
    battery: () => '',
};
/** Resolve icon set from config value */
export function resolveIcons(mode) {
    if (mode === 'emoji')
        return EMOJI_ICONS;
    if (mode === 'none')
        return NO_ICONS;
    return NERD_ICONS;
}
// Backward compat — default export is nerd icons
export const ICONS = NERD_ICONS;
//# sourceMappingURL=icons.js.map