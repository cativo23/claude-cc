import {
  renderPowerline,
  resolveStyle,
  type PowerlineSegment,
  type PowerlineStyleName,
} from './powerline.js';
import { QUOTA_CRITICAL } from './icons.js';
import { buildContextBar } from './shared.js';
import { formatTokens, formatCost } from '../utils/format.js';
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
    const bar = buildContextBar(input.context.usedPercentage, c, {
      iconSet: icons,
      plain: true,
      cols: ctx.cols,
      warningThreshold: display.contextWarningThreshold,
      criticalThreshold: display.contextCriticalThreshold,
    });
    segments.push({ text: bar, bg: palette.modelBg, fg: palette.fg, priority: 100 });
  }

  // Context tokens — prefer windowSize from payload over back-derivation.
  // total_input_tokens is cumulative across the session; current context size
  // is windowSize × usedPercentage / 100. Falls back to back-derivation for
  // legacy payloads without context_window_size. Mirrors line2.ts behaviour.
  if (display.contextTokens && input.context.usedPercentage > 0) {
    const pct = input.context.usedPercentage;
    const capacity = input.context.windowSize
      ?? (input.tokens.input > 0 ? Math.round(input.tokens.input / (pct / 100)) : 0);
    if (capacity > 0) {
      const used = Math.round(capacity * pct / 100);
      segments.push({ text: `${formatTokens(used)}/${formatTokens(capacity)}`, bg: palette.dirBg, fg: palette.fg, priority: 80 });
    }
  }

  // Cost
  if (display.cost && input.cost != null) {
    segments.push({ text: formatCost(input.cost), bg: palette.taskBg, fg: palette.fg, priority: 60 });
  }

  // Rate limits — only show if >=50%
  if (display.rateLimits && input.rateLimits) {
    const fh = input.rateLimits.fiveHour;
    // Number.isFinite guards against NaN/Infinity from malformed payloads.
    if (fh && Number.isFinite(fh.usedPercentage) && fh.usedPercentage >= 50) {
      const bg = fh.usedPercentage >= QUOTA_CRITICAL ? palette.branchDirtyBg : palette.taskBg;
      segments.push({ text: `${icons.battery(fh.usedPercentage)} ${fh.usedPercentage.toFixed(0)}%(5h)`, bg, fg: palette.fg, priority: 20 });
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
