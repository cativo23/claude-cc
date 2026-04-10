import { truncField } from './text.js';
import type { Colors } from './colors.js';
import type { RenderContext } from '../types.js';

export function renderLine4(ctx: RenderContext, c: Colors): string {
  const { gsd, icons } = ctx;
  if (!gsd) return '';
  if (!gsd.currentTask && !gsd.updateAvailable) return '';

  const parts: string[] = [c.dim('GSD')];

  if (gsd.currentTask) {
    parts.push(c.bold(`${icons.hammer} ${truncField(gsd.currentTask, 40)}`));
  }

  if (gsd.updateAvailable) {
    parts.push(c.yellow(`${icons.warning} GSD update available`));
  }

  return parts.join(' ');
}
