import {
  renderPowerline,
  resolveStyle,
  type PowerlineSegment,
  type PowerlineStyleName,
} from './powerline.js';
import { QUOTA_CRITICAL } from '../types.js';
import { buildContextBar, formatQwenMetrics } from './shared.js';
import { formatTokens, formatCost, formatBurnRate } from '../utils/format.js';
import { detectColorMode, getPaceColor, type ColorMode, type Colors } from './colors.js';
import { getConfigHealth } from '../parsers/config-health.js';
import { computePaceDelta, formatPaceDelta } from './pace.js';
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
  const { input, config: { display }, icons, mcp, transcript: { thinkingEffort } } = ctx;
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
      segments.push({ text: `${formatTokens(used)}/${formatTokens(capacity)}`, bg: palette.dirBg, fg: palette.fg, priority: 90 });
    }
  }

  // Rate limits — urgency expressed via priority (critical survives eviction longer).
  // Loop order (5h then 7d) is always preserved; priority is the eviction knob only.
  // Note: countdown timer (line2.ts:127) is intentionally omitted in powerline mode.
  // The pace delta segment below already communicates time-to-exhaustion, and the
  // critical bg (branchDirtyBg) carries the urgency signal that countdown would.
  if (display.rateLimits && input.rateLimits) {
    const limits: [string, typeof input.rateLimits.fiveHour][] = [
      ['5h', input.rateLimits.fiveHour],
      ['7d', input.rateLimits.sevenDay],
    ];
    for (const [label, win] of limits) {
      if (!win || !Number.isFinite(win.usedPercentage) || win.usedPercentage < 50) continue;
      const critical = win.usedPercentage >= QUOTA_CRITICAL;
      const bg = critical ? palette.branchDirtyBg : palette.taskBg;
      segments.push({ text: `${icons.battery(win.usedPercentage)} ${win.usedPercentage.toFixed(0)}%(${label})`, bg, fg: palette.fg, priority: critical ? 85 : 40 });
    }
  }

  // Pace delta — how far ahead/behind of expected quota burn rate.
  // Independent of display.rateLimits — the pace signal can render without the
  // raw 5h/7d percentages and vice versa.
  if (display.paceDelta && input.rateLimits) {
    const fiveHourWin = input.rateLimits.fiveHour;
    if (fiveHourWin && Number.isFinite(fiveHourWin.usedPercentage)) {
      const pace = computePaceDelta(fiveHourWin.usedPercentage, fiveHourWin.resetsAt);
      if (pace != null) {
        const paceStr = formatPaceDelta(pace);
        if (paceStr === 'on pace') {
          segments.push({ text: 'on pace', bg: palette.dirBg, fg: palette.fg, priority: 60 });
        } else {
          const paceIcon = pace.delta > 1 ? icons.car : pace.delta < -1 ? icons.turtle : '';
          const iconPrefix = paceIcon ? `${paceIcon}` : '';
          const coloredText = c[getPaceColor(pace.delta)](`${iconPrefix}${paceStr}`);
          segments.push({ text: coloredText, bg: palette.dirBg, fg: palette.fg, priority: 60 });
        }
      }
    }
  }

  // Cost + burn rate
  if (display.cost && input.cost != null) {
    let costText = formatCost(input.cost);
    if (display.burnRate && input.durationMs != null) {
      const burn = formatBurnRate(input.cost, input.durationMs);
      if (burn) costText += ` ${burn}`;
    }
    segments.push({ text: costText, bg: palette.taskBg, fg: palette.fg, priority: 70 });
  }

  // Tokens ↑↓ (cumulative input/output)
  if (display.tokens) {
    const inTokens = input.tokens.input;
    const outTokens = input.tokens.output;
    const parts: string[] = [];
    if (inTokens > 0) parts.push(`${formatTokens(inTokens)}↑`);
    if (outTokens > 0) parts.push(`${formatTokens(outTokens)}↓`);
    if (parts.length > 0) {
      segments.push({ text: `${icons.comment} ${parts.join(' ')}`, bg: palette.dirBg, fg: palette.fg, priority: 60 });
    }
  }

  // Cache metrics (hit rate) — alarm-mode: only when <90%. See line2.ts for why.
  if (display.cacheMetrics && input.cacheHitRate != null && input.cacheHitRate < 90) {
    segments.push({ text: `${input.cacheHitRate}%${icons.lightning}`, bg: palette.versionBg, fg: palette.fg, priority: 50 });
  }

  // MCP servers
  if (display.mcp && mcp) {
    const total = mcp.servers.length;
    const errors = mcp.servers.filter(s => s.status === 'error').length;
    const mcpText = errors > 0 ? `MCP ${total - errors}/${total}` : `MCP ${total}`;
    segments.push({ text: mcpText, bg: palette.taskBg, fg: palette.fg, priority: 50 });
  }

  // Qwen metrics
  const qwenParts = formatQwenMetrics(input, c, icons);
  for (const part of qwenParts) {
    segments.push({ text: part, bg: palette.versionBg, fg: palette.fg, priority: 45 });
  }


  // Vim mode (low priority — no right side in powerline, append as left segment)
  if (display.vim && input.vimMode) {
    segments.push({ text: `[${input.vimMode}]`, bg: palette.dirBg, fg: palette.fg, priority: 30 });
  }

  // Effort level (hidden if medium)
  const effort = input.effortLevel || thinkingEffort;
  if (display.effort && effort && effort !== 'medium') {
    segments.push({ text: `^${effort}`, bg: palette.versionBg, fg: palette.fg, priority: 30 });
  }

  // Config health hints (opt-in, lowest priority — evicted first on narrow terminals)
  if (display.health && input.cwd) {
    const colorMode = ctx.config.colors.mode === 'auto' ? detectColorMode() : ctx.config.colors.mode;
    const hints = getConfigHealth(ctx.config, colorMode, input.cwd);
    for (const h of hints) {
      const prefix = h.severity === 'warn' ? '⚠ ' : 'ℹ ';
      segments.push({ text: `${prefix}${h.hint}`, bg: palette.versionBg, fg: palette.fg, priority: 10 });
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
