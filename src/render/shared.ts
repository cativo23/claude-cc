import { NERD_ICONS, type IconSet } from './icons.js';
import { getContextColor, stripAnsi, type Colors } from './colors.js';
import { formatTokens } from '../utils/format.js';
import { DEFAULT_CONTEXT_WARNING_THRESHOLD, DEFAULT_CONTEXT_CRITICAL_THRESHOLD, type GitStatus, type TranscriptData, type CustomCommand } from '../types.js';
import type { NormalizedInput } from '../normalize.js';
import type { CustomCommandOutput } from '../parsers/custom-commands.js';

export const SEP = ` \x1b[90m\u2502\x1b[0m `;
export const SEP_MINIMAL = ` \x1b[90m|\x1b[0m `;

export const EXCLUDED_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate']);


export interface ContextBarOpts {
  segments?: number;
  showIcons?: boolean;
  iconSet?: IconSet;
  /** When true (default), append an actionable hint like `/compact?` at high fill. */
  showHint?: boolean;
  /**
   * When true, the bar cells are emitted without inline color escapes so the
   * surrounding background (e.g. a powerline segment bg) shows through. The
   * percentage and warning icon still keep their alarm colors — proportion
   * reads from cell length, urgency reads from the colored suffix. Set by
   * the powerline renderer; classic mode leaves it false.
   */
  plain?: boolean;
  /** Terminal width; used to pick an adaptive segment count when `segments` is not set. */
  cols?: number;
  /**
   * Percentage at which the bar turns orange and shows the fire icon. Default 70.
   * Note: yellow zone exists only when `warningThreshold > 50`; below that, the
   * bar jumps green→orange directly. See `getContextColor` for details.
   */
  warningThreshold?: number;
  /** Percentage at which the bar turns red/blinking and shows the skull icon. Default 85. */
  criticalThreshold?: number;
  /**
   * When true, emit a red warning glyph (⚠) alongside the fire/skull icon.
   * Indicates the context fill is in the 5pp window before auto-compact fires
   * (an immutable platform constant, independent of the user-configurable
   * warning/critical thresholds). Computed upstream by `normalize.ts`.
   */
  nearAutoCompact?: boolean;
}

function adaptiveSegments(cols?: number): number {
  if (cols == null || cols >= 100) return 20;
  if (cols >= 60) return 12;
  return 8;
}

export function buildContextBar(pct: number, c: Colors, opts?: ContextBarOpts): string {
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
    if (safePct >= critical) mainIcon = c.blinkRed(ic.skull);
    else if (safePct >= warning) mainIcon = c.orange(ic.fire);

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
    if (safePct >= critical + 5) hint = ' ' + c.red('/compact!');
    else if (safePct >= critical) hint = ' ' + c.dim('/compact?');
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

export function getActiveTodo(transcript: TranscriptData): string | undefined {
  const inProgress = transcript.todos.filter(t => t.status === 'in_progress');
  return inProgress[0]?.content;
}

export function formatGitChanges(git: GitStatus, c: Colors): string[] {
  const parts: string[] = [];
  if (git.staged > 0) parts.push(c.green(`+${git.staged}`));
  if (git.modified > 0) parts.push(c.yellow(`!${git.modified}`));
  if (git.untracked > 0) parts.push(c.gray(`?${git.untracked}`));
  return parts;
}

/**
 * Filter custom command outputs to those that should render on the given line.
 * Hidden-state outputs are dropped — they exist in the parser result so the
 * caller has full visibility, but renderers MUST treat them as if they were
 * absent. `undefined` ctx input is normalized to an empty array so test
 * fixtures without customCommands continue to work.
 */
export function getCustomCommandsForLine(
  outputs: CustomCommandOutput[] | undefined,
  line: 1 | 2 | 3 | 4,
): CustomCommandOutput[] {
  if (!outputs) return [];
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
export function renderCustomCommand(output: CustomCommandOutput, c: Colors): string {
  if (output.state === 'hidden') return '';

  // Strip ANSI from user output unless explicitly opted in. Stripping happens
  // *before* label concatenation so the label can't end up sandwiched inside
  // an unclosed escape sequence.
  let text = output.ansi ? output.text : stripAnsi(output.text);
  if (output.label) text = `${output.label} ${text}`;

  // Color is only applied when ansi=false; otherwise we'd be wrapping the
  // user's escapes in another escape, which most terminals render as garbage.
  let result = text;
  if (!output.ansi && output.color) {
    const colorMap: Record<NonNullable<CustomCommand['color']>, (s: string) => string> = {
      dim: c.dim, green: c.green, yellow: c.yellow, orange: c.orange,
      red: c.red, cyan: c.cyan, magenta: c.magenta,
    };
    const fn = colorMap[output.color];
    if (typeof fn === 'function') result = fn(text);
  }

  // Stale dimming is the last transform — it must wrap the colored result so
  // the "in-flight refresh" signal is visible regardless of the base color.
  if (output.state === 'stale') result = c.dim(result);

  return result;
}

/**
 * PR widget number prefix. CC's own UI shows GitHub pull requests as `#N` and
 * GitLab merge requests as `!N` — same `pr.{number,url,reviewState}` field,
 * platform inferred from the host in `pr.url`. Defaults to `#` (GitHub-style)
 * when the url is absent or unparseable, since that's the widget's original
 * and most common shape.
 */
export function getPrPrefix(url?: string): string {
  if (!url) return '#';
  try {
    const { hostname } = new URL(url);
    return hostname.includes('gitlab') ? '!' : '#';
  } catch {
    return '#';
  }
}

export function formatQwenMetrics(n: NormalizedInput, c: Colors, icons: IconSet): string[] {
  const parts: string[] = [];
  if (n.performance && n.performance.requests > 0) {
    let reqStr = `${n.performance.requests} req`;
    if (n.performance.errors > 0) reqStr += c.red(` (${n.performance.errors} err)`);
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
