/**
 * `lumira subagent` subcommand (issue #176 — `subagentStatusLine` renderer).
 *
 * Claude Code (≥ 2.1.x) lets a command customize how each subagent row renders
 * in the agent panel. CC pipes a JSON object on stdin describing every visible
 * subagent and expects ONE JSON line back per row (`{ id, content }`). Omitting
 * an id keeps CC's default rendering for that row; empty content hides it.
 *
 * Input schema (distinct from the main statusline's `RawInput`):
 *   { columns: number, tasks: [ { id, name, type, status, description,
 *                                 label, startTime, tokenCount, ... } ] }
 *
 * Icon choice is by STATE, not agent type. CC's `type` field is open-ended and
 * user-defined (dozens of agent types in a real setup), so there's no stable
 * type→glyph map to maintain — but `running/completed/error` map cleanly onto
 * glyphs lumira already ships across all three icon sets. The state also drives
 * the colour, so a glance tells you what's live vs done vs failed.
 *
 * Robustness contract: this runs inside CC's render loop. On ANY bad input
 * (unreadable stdin, malformed JSON, missing fields) it emits nothing and exits
 * 0 — CC then falls back to its default rows. It must never crash the panel.
 */
import { formatTokens } from '../utils/format.js';
import { displayWidth, truncField } from '../render/text.js';
import { resolveIcons } from '../render/icons.js';
import { createColors, detectColorMode } from '../render/colors.js';
import { loadConfig } from '../config.js';
import { readStdin } from '../stdin.js';
import { debug } from '../utils/debug.js';
/** Per-state presentation: glyph + colour + human label. */
function styleFor(status, icons, colors) {
    switch (status) {
        case 'running':
            return { icon: icons.clock, color: colors.cyan, label: 'running' };
        case 'completed':
            return { icon: icons.checkmark, color: colors.green, label: 'done' };
        case 'error':
        case 'failed':
            return { icon: icons.warning, color: colors.red, label: 'error' };
        default:
            // Unknown/absent state: no glyph, dim, pass the raw status through as the
            // label so a future CC state is still legible instead of being dropped.
            return { icon: '', color: colors.dim, label: status ?? '' };
    }
}
/**
 * Render the `content` string for a single subagent row:
 *   `<glyph> <name> · <tokens> · <state-label>`
 *
 * The glyph and label are state-coloured; tokens are dim. When `columns` is
 * given, the name is truncated (with an ellipsis) so the visible row fits,
 * reserving width for the fixed glyph/meta first.
 */
export function renderSubagentContent(task, icons, colors, columns) {
    const { icon, color, label } = styleFor(task.status, icons, colors);
    // Identity fallback. CC reports every Task subagent as the generic
    // `type: "local_agent"` with no `name`, so `description` (the dispatch arg) is
    // the only field that distinguishes rows — it must win over a generic type.
    // A *meaningful* type (a real agent_type, if CC ever exposes one) still wins
    // over description, and an explicit `name` wins over everything.
    const meaningfulType = task.type && task.type !== 'local_agent' ? task.type : '';
    const name = (task.name || meaningfulType || task.description || task.id || 'agent').trim();
    const tokens = Number.isFinite(task.tokenCount) ? `${formatTokens(task.tokenCount)} tok` : '';
    const prefix = icon ? `${color(icon)} ` : '';
    const prefixW = icon ? displayWidth(icon) + 1 : 0;
    // Plain (uncoloured) meta used both for measuring and for assembling the
    // coloured version, so width math and output never drift apart.
    const metaPlain = [tokens, label].filter(Boolean);
    const metaW = metaPlain.length ? displayWidth(` · ${metaPlain.join(' · ')}`) : 0;
    // Fit the name to whatever width is left after the fixed glyph + meta.
    let shownName = name;
    if (columns !== undefined && columns > 0) {
        const budget = columns - prefixW - metaW;
        if (budget < displayWidth(name))
            shownName = budget > 1 ? truncField(name, budget) : '';
    }
    const metaColored = [];
    if (tokens)
        metaColored.push(colors.dim(tokens));
    if (label)
        metaColored.push(color(label));
    const meta = metaColored.join(' · ');
    // Avoid a dangling " · " when the name was truncated away entirely.
    if (!shownName)
        return `${prefix}${meta}`.trimEnd();
    return meta ? `${prefix}${shownName} · ${meta}` : `${prefix}${shownName}`;
}
/**
 * Render the full CC response: one `{ id, content }` JSON line per addressable
 * task. Tasks without an id are skipped (CC keys rows by id, so a row we can't
 * address can't be overridden). Empty/missing task list → empty string.
 */
export function renderSubagentTasks(input, icons, colors) {
    const tasks = Array.isArray(input?.tasks) ? input.tasks : [];
    const columns = Number.isFinite(input?.columns) ? input.columns : undefined;
    const lines = [];
    for (const task of tasks) {
        if (!task || typeof task.id !== 'string' || task.id === '')
            continue;
        lines.push(JSON.stringify({ id: task.id, content: renderSubagentContent(task, icons, colors, columns) }));
    }
    return lines.join('\n');
}
/**
 * Wire stdin → config → render. Reuses the main `readStdin` (its only schema
 * assertion is "is a plain object", which our payload satisfies). Any failure
 * degrades to empty stdout + exit 0 so CC's panel is never broken.
 */
export async function runSubagentCommand(opts = {}) {
    const log = debug('subagent');
    let raw;
    try {
        raw = await readStdin(opts.stream ?? process.stdin);
    }
    catch (e) {
        log('stdin read failed:', e.message);
        return { stdout: '', stderr: '', exitCode: 0 };
    }
    if (log.enabled)
        log('payload:', raw);
    const config = opts.config ?? loadConfig();
    const icons = resolveIcons(config.icons);
    const mode = opts.colorMode
        ?? (config.colors?.mode && config.colors.mode !== 'auto' ? config.colors.mode : detectColorMode());
    const colors = createColors(mode);
    const out = renderSubagentTasks(raw, icons, colors);
    return { stdout: out ? `${out}\n` : '', stderr: '', exitCode: 0 };
}
//# sourceMappingURL=subagent.js.map