import { ICONS } from './icons.js';
import { truncField } from './text.js';
import type { Colors } from './colors.js';
import type { GsdInfo } from '../types.js';

export function renderLine4(
  gsd: GsdInfo | null,
  c: Colors
): string {
  if (!gsd) return '';
  if (!gsd.currentTask && !gsd.updateAvailable) return '';

  const parts: string[] = [c.dim('GSD')];

  if (gsd.currentTask) {
    parts.push(c.bold(`${ICONS.hammer} ${truncField(gsd.currentTask, 40)}`));
  }

  if (gsd.updateAvailable) {
    parts.push(c.yellow(`${ICONS.warning} GSD update available`));
  }

  return parts.join(' ');
}
