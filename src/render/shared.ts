import { NERD_ICONS, type IconSet } from './icons.js';
import { getContextColor, type Colors } from './colors.js';
import { formatTokens } from '../utils/format.js';
import type { ClaudeCodeInput, GitStatus } from '../types.js';
import type { NormalizedInput } from '../normalize.js';

export const SEP = ` \x1b[90m\u2502\x1b[0m `;
export const SEP_MINIMAL = ` \x1b[90m|\x1b[0m `;

export function getModelName(model: ClaudeCodeInput['model']): string {
  if (typeof model === 'string') return model;
  if (model && typeof model === 'object' && 'display_name' in model) return model.display_name;
  return '';
}

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
}

export function buildContextBar(pct: number, c: Colors, opts?: ContextBarOpts): string {
  const segments = opts?.segments ?? 20;
  const showIcons = opts?.showIcons ?? true;
  const showHint = opts?.showHint ?? true;
  const plain = opts?.plain ?? false;
  const ic = opts?.iconSet ?? NERD_ICONS;

  const filled = Math.round((pct / 100) * segments);
  const colorFn = c[getContextColor(pct)];
  // In plain mode the bar cells emit no ANSI — terminal default fg over
  // whatever bg the caller has set. The empty-cell `dim` is also suppressed
  // because `\x1b[2m...\x1b[0m` would still close out the caller's bg.
  const bar = plain
    ? ic.barFull.repeat(filled) + ic.barEmpty.repeat(segments - filled)
    : colorFn(ic.barFull.repeat(filled)) + c.dim(ic.barEmpty.repeat(segments - filled));

  let icon = '';
  if (showIcons) {
    if (pct >= 80) icon = c.blinkRed(ic.skull);
    else if (pct >= 65) icon = c.orange(ic.fire);
  }

  // Actionable hint at high fill — nudges the user to reclaim context before
  // the session stalls. Thresholds align with the color/icon tiers above.
  let hint = '';
  if (showHint) {
    if (pct >= 90) hint = ' ' + c.red('/compact!');
    else if (pct >= 80) hint = ' ' + c.dim('/compact?');
  }

  const pctStr = colorFn(`${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`);

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

export function formatGitChanges(git: GitStatus, c: Colors): string[] {
  const parts: string[] = [];
  if (git.staged > 0) parts.push(c.green(`+${git.staged}`));
  if (git.modified > 0) parts.push(c.yellow(`!${git.modified}`));
  if (git.untracked > 0) parts.push(c.gray(`?${git.untracked}`));
  return parts;
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
