import { truncField } from './text.js';
import { getCustomCommandsForLine, renderCustomCommand } from './shared.js';
import type { Colors } from './colors.js';
import type { RenderContext } from '../types.js';

export function renderLine4(ctx: RenderContext, c: Colors): string {
  const { gsd, icons } = ctx;
  const parts: string[] = [];

  // GSD widget — only emit when GSD has something to display. Text and glyphs
  // mirror GSD's own statusline (gsd-statusline.js) so the integration reads
  // identically. The update/stale-hooks indicators render even without a
  // current task, so a GSD update is visible in any project (gated only on the
  // update-check cache, not on being inside a GSD project).
  if (gsd && (gsd.currentTask || gsd.updateAvailable || gsd.staleHooks)) {
    parts.push(c.dim('GSD'));
    if (gsd.currentTask) {
      parts.push(c.bold(`${icons.hammer} ${truncField(gsd.currentTask, 60)}`));
    }
    // Resume-point indicator (gsd-core ≥ 1.4.x). A ↩ glyph signals STATE.md has
    // an active `.continue-here`/spec resume file — a cue that work can be picked
    // up where it left off. Cyan: informational, distinct from update/stale warns.
    if (gsd.hasResume) {
      parts.push(c.cyan('↩'));
    }
    if (gsd.updateAvailable) {
      parts.push(c.yellow('⬆ /gsd:update'));
    }
    if (gsd.staleHooks) {
      parts.push(gsd.devInstall
        ? c.yellow('⚠ dev install — re-run installer to sync hooks')
        : c.red('⚠ stale hooks — run /gsd:update'));
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
