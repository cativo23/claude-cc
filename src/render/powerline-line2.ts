import {
  renderPowerline,
  resolveStyle,
  type PowerlineSegment,
  type PowerlineStyleName,
} from './powerline.js';
import { buildContextBar } from './shared.js';
import { formatTokens, formatCost, formatDuration } from '../utils/format.js';
import type { ColorMode, Colors } from './colors.js';
import type { RenderContext } from '../types.js';
import {
  type PowerlinePalette,
  derivePowerlinePalette,
  DEFAULT_POWERLINE_PALETTE,
  type ThemePalette,
} from '../themes.js';

// Line 2 powerline palette — reuses PowerlinePalette bg slots with semantic remapping:
//   modelBg    → context bar segment
//   taskBg     → cost/tokens segment
//   versionBg  → duration segment
//
// Context bar policy: cells inherit segment bg (proportion reads from cell
// length, no need for a colored gradient). The percentage value, warning
// icon (☠/🔥), and `/compact?` hint keep their alarm colors — these are the
// urgency channels the user actually needs at a glance. Decision rationale
// recorded against PR #47.

function buildSegments(ctx: RenderContext, palette: PowerlinePalette, c: Colors): PowerlineSegment[] {
  const { input, config: { display }, icons } = ctx;
  const segments: PowerlineSegment[] = [];

  // Context bar — always highest priority. plain=true so the bar cells inherit
  // the powerline segment bg; only %/icon/hint emit color escapes.
  if (display.contextBar) {
    const bar = buildContextBar(input.context.usedPercentage, c, { iconSet: icons, plain: true });
    segments.push({ text: bar, bg: palette.modelBg, fg: palette.fg, priority: 100 });
  }

  // Context tokens
  if (display.contextTokens && input.tokens.input > 0 && input.context.usedPercentage > 0) {
    const used = input.tokens.input;
    const capacity = Math.round(used / (input.context.usedPercentage / 100));
    segments.push({ text: `${formatTokens(used)}/${formatTokens(capacity)}`, bg: palette.dirBg, fg: palette.fg, priority: 80 });
  }

  // Cost
  if (display.cost && input.cost != null) {
    segments.push({ text: formatCost(input.cost), bg: palette.taskBg, fg: palette.fg, priority: 60 });
  }

  // Duration
  if (display.duration && input.durationMs != null) {
    segments.push({ text: `${icons.clock} ${formatDuration(input.durationMs)}`, bg: palette.branchCleanBg, fg: palette.fg, priority: 40 });
  }

  // Rate limits — only show if >=50%
  if (display.rateLimits && input.rateLimits) {
    const fh = input.rateLimits.fiveHour;
    if (fh && fh.usedPercentage >= 50) {
      const bg = fh.usedPercentage >= 80 ? palette.branchDirtyBg : palette.taskBg;
      segments.push({ text: `${icons.bolt} ${fh.usedPercentage.toFixed(0)}%(5h)`, bg, fg: palette.fg, priority: 20 });
    }
  }

  return segments;
}

/** Render line2 in powerline style. Caller must ensure mode != 'named'. */
export function renderPowerlineLine2(ctx: RenderContext, mode: ColorMode, theme: ThemePalette | null, c: Colors): string {
  const palette = theme
    ? (theme.powerline ?? derivePowerlinePalette(theme))
    : DEFAULT_POWERLINE_PALETTE;
  const styleName = (ctx.config.powerline?.style ?? 'auto') as PowerlineStyleName;
  const hasNerdFont = (ctx.config.icons ?? 'nerd') === 'nerd';
  const style = resolveStyle(styleName, hasNerdFont);
  const segments = buildSegments(ctx, palette, c);
  if (segments.length === 0) return '';
  return renderPowerline(segments, style, mode, ctx.cols);
}
