import { NERD_ICONS, type IconSet } from './icons.js';
import { getContextColor, type Colors } from './colors.js';
import { formatTokens } from '../utils/format.js';
import type { GitStatus } from '../types.js';
import type { NormalizedInput } from '../normalize.js';

export const SEP = ` \x1b[90m\u2502\x1b[0m `;
export const SEP_MINIMAL = ` \x1b[90m|\x1b[0m `;

export interface ContextBarOpts {
  segments?: number;
  showIcons?: boolean;
  iconSet?: IconSet;
}

export function buildContextBar(pct: number, c: Colors, opts?: ContextBarOpts): string {
  const segments = opts?.segments ?? 20;
  const showIcons = opts?.showIcons ?? true;
  const ic = opts?.iconSet ?? NERD_ICONS;

  const filled = Math.round((pct / 100) * segments);
  const colorFn = c[getContextColor(pct)];
  const bar = colorFn(ic.barFull.repeat(filled)) + c.dim(ic.barEmpty.repeat(segments - filled));

  let icon = '';
  if (showIcons) {
    if (pct >= 80) icon = c.blinkRed(ic.skull);
    else if (pct >= 65) icon = c.orange(ic.fire);
  }

  const pctStr = colorFn(`${pct < 10 ? pct.toFixed(1) : pct.toFixed(0)}%`);

  return `${bar} ${pctStr}${icon ? ' ' + icon : ''}`;
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
