import { NERD_ICONS, type IconSet } from './icons.js';
import { getContextColor, type Colors } from './colors.js';
import type { GitStatus } from '../types.js';

export const SEP = ` \x1b[90m\u2502\x1b[0m `;
export const SEP_MINIMAL = ` \x1b[90m|\x1b[0m `;

export interface ContextBarOpts {
  segments?: number;
  showIcons?: boolean;
  pctInsideBar?: boolean;
  iconSet?: IconSet;
}

export function buildContextBar(pct: number, c: Colors, opts?: ContextBarOpts): string {
  const segments = opts?.segments ?? 20;
  const showIcons = opts?.showIcons ?? true;
  const pctInsideBar = opts?.pctInsideBar ?? false;
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

  if (pctInsideBar) {
    return `${bar} ${pctStr}${icon ? ' ' + icon : ''}`;
  }
  return `${bar} ${pctStr}${icon ? ' ' + icon : ''}`;
}

export function formatGitChanges(git: GitStatus, c: Colors): string[] {
  const parts: string[] = [];
  if (git.staged > 0) parts.push(c.green(`+${git.staged}`));
  if (git.modified > 0) parts.push(c.yellow(`!${git.modified}`));
  if (git.untracked > 0) parts.push(c.gray(`?${git.untracked}`));
  return parts;
}
