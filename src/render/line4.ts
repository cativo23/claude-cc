import { truncField } from './text.js';
import { getCustomCommandsForLine, renderCustomCommand } from './shared.js';
import type { Colors } from './colors.js';
import type { RenderContext } from '../types.js';

export function renderLine4(ctx: RenderContext, c: Colors): string {
  const { gsd, icons } = ctx;
  const parts: string[] = [];

  // GSD widget — only emit when GSD has something to display.
  if (gsd && (gsd.currentTask || gsd.updateAvailable)) {
    parts.push(c.dim('GSD'));
    if (gsd.currentTask) {
      parts.push(c.bold(`${icons.hammer} ${truncField(gsd.currentTask, 40)}`));
    }
    if (gsd.updateAvailable) {
      parts.push(c.yellow(`${icons.warning} GSD update available`));
    }
  }

  // Custom commands (issue #143 phase 3) — line 4 is the lowest-priority line
  // and previously empty when GSD is absent. Custom commands declared with
  // line: 4 now surface here so users can pin their own widgets on a quiet
  // line. If neither GSD nor custom commands have content, line returns ''
  // and is omitted by the line-joiner upstream.
  for (const out of getCustomCommandsForLine(ctx.customCommands, 4)) {
    const seg = renderCustomCommand(out, c);
    if (seg) parts.push(seg);
  }

  return parts.join(' ');
}
