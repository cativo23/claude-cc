import {
  renderPowerline,
  resolveStyle,
  type PowerlineSegment,
  type PowerlineStyleName,
} from './powerline.js';
import { truncField } from './text.js';
import { EXCLUDED_TOOLS } from './shared.js';
import type { ColorMode } from './colors.js';
import type { RenderContext, ToolEntry } from '../types.js';
import {
  type PowerlinePalette,
  derivePowerlinePalette,
  DEFAULT_POWERLINE_PALETTE,
  type ThemePalette,
} from '../themes.js';

function buildSegments(ctx: RenderContext, palette: PowerlinePalette): PowerlineSegment[] {
  const { transcript: { tools, todos }, config: { display }, icons } = ctx;
  const segments: PowerlineSegment[] = [];

  // Tools segment — running tools take priority, then completed summary.
  if (display.tools !== false) {
    const relevant = tools.filter((t: ToolEntry) => !EXCLUDED_TOOLS.has(t.name));
    const running = relevant.filter(t => t.status === 'running').slice(-2);
    const completed = relevant.filter(t => t.status === 'completed');

    if (running.length > 0) {
      const label = running.map(t => {
        const target = t.target ? `: ${truncField(t.target, 15)}` : '';
        return `◐ ${t.name}${target}`;
      }).join(' ');
      segments.push({ text: label, bg: palette.taskBg, fg: palette.fg, priority: 100 });
    }

    if (completed.length > 0) {
      // Group by name, show top 3. Show at priority 80 alongside running (100),
      // or at 100 when running is empty — mirrors classic line3 behaviour.
      const groups = new Map<string, number>();
      for (const t of completed) groups.set(t.name, (groups.get(t.name) ?? 0) + 1);
      const label = Array.from(groups.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => `${icons.checkmark} ${name}${count > 1 ? ` ×${count}` : ''}`)
        .join(' ');
      if (label) {
        const priority = running.length > 0 ? 80 : 100;
        segments.push({ text: label, bg: palette.versionBg, fg: palette.fg, priority });
      }
    }
  }

  // Todos segment — progress bar + counts. Mirrors classic line3 (pending, in-progress counts).
  if (display.todos !== false && todos.length > 0) {
    const total = todos.length;
    const done = todos.filter(t => t.status === 'completed').length;
    const inProg = todos.filter(t => t.status === 'in_progress').length;
    const pending = todos.filter(t => t.status === 'pending').length;
    const SEGS = 8;
    const filled = Math.round((done / total) * SEGS);
    const bar = icons.barFull.repeat(filled) + icons.barEmpty.repeat(SEGS - filled);
    let label = `${bar} ${done}/${total}`;
    if (inProg > 0) label += ` ◐ ${inProg}`;
    if (pending > 0) label += ` ○ ${pending}`;
    segments.push({ text: label, bg: palette.branchCleanBg, fg: palette.fg, priority: 80 });
  }

  return segments;
}

/** Render line3 in powerline style. Caller must ensure mode != 'named'. */
export function renderPowerlineLine3(ctx: RenderContext, mode: ColorMode, theme: ThemePalette | null): string {
  const palette = theme
    ? (theme.powerline ?? derivePowerlinePalette(theme))
    : DEFAULT_POWERLINE_PALETTE;
  const styleName = (ctx.config.powerline?.style ?? 'auto') as PowerlineStyleName;
  const hasNerdFont = (ctx.config.icons ?? 'nerd') === 'nerd';
  const style = resolveStyle(styleName, hasNerdFont);
  const segments = buildSegments(ctx, palette);
  if (segments.length === 0) return '';
  return renderPowerline(segments, style, mode, ctx.cols);
}
