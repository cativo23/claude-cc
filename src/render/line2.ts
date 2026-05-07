import { fitSegments, displayWidth } from './text.js';
import { getQuotaColor, getPaceColor, getCacheHitColor, detectColorMode, type Colors } from './colors.js';
import { QUOTA_CRITICAL } from '../types.js';
import { buildContextBar, formatQwenMetrics, SEP } from './shared.js';
import { formatTokens, formatCost, formatBurnRate } from '../utils/format.js';
import { getConfigHealth } from '../parsers/config-health.js';
import { computePaceDelta, formatPaceDelta } from './pace.js';
import type { RenderContext } from '../types.js';

export function formatCountdown(resetsAt: number): string {
  const resetsAtMs = resetsAt < 1e12 ? resetsAt * 1000 : resetsAt;
  const diffMs = resetsAtMs - Date.now();
  if (diffMs <= 0) return '';
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function renderLine2(ctx: RenderContext, c: Colors): string {
  const { input, tokenSpeed, transcript: { thinkingEffort }, config: { display }, cols, memory, mcp, icons } = ctx;
  const leftParts: string[] = [];
  const rightParts: string[] = [];

  // Track context slots pushed so critical rate-limit segments anchor after
  // all context info (bar + tokens), not just after the bar.
  let contextSlotCount = 0;

  // Context bar
  if (display.contextBar) {
    const pct = input.context.usedPercentage;
    leftParts.push(buildContextBar(pct, c, {
      iconSet: icons,
      cols,
      warningThreshold: display.contextWarningThreshold,
      criticalThreshold: display.contextCriticalThreshold,
    }));
    contextSlotCount++;
  }

  // Context tokens — prefer windowSize from payload over back-derivation.
  // total_input_tokens is cumulative across the session; current context size
  // is windowSize × usedPercentage / 100. Fallback derives capacity for legacy
  // payloads without context_window_size.
  if (display.contextTokens && input.context.usedPercentage > 0) {
    const pct = input.context.usedPercentage;
    const capacity = input.context.windowSize
      ?? (input.tokens.input > 0 ? Math.round(input.tokens.input / (pct / 100)) : 0);
    if (capacity > 0) {
      const used = Math.round(capacity * pct / 100);
      leftParts.push(c.dim(`${formatTokens(used)}/${formatTokens(capacity)}`));
      contextSlotCount++;
    }
  }

  // Tokens
  if (display.tokens) {
    const inTokens = input.tokens.input;
    const outTokens = input.tokens.output;
    const parts: string[] = [];
    if (inTokens > 0) parts.push(`${formatTokens(inTokens)}↑`);
    if (outTokens > 0) parts.push(`${formatTokens(outTokens)}↓`);
    if (parts.length > 0) leftParts.push(`${icons.comment} ${parts.join(' ')}`);
  }

  // Cache metrics (hit rate) — colored by quality tier
  if (display.cacheMetrics && input.cacheHitRate != null) {
    const cacheColorFn = c[getCacheHitColor(input.cacheHitRate)];
    leftParts.push(cacheColorFn(`${input.cacheHitRate}%${icons.lightning}`));
  }

  // Cost + burn rate (Claude only — Qwen doesn't send cost data)
  if (display.cost && input.cost != null) {
    const costStr = formatCost(input.cost);
    let costPart = costStr;
    if (display.burnRate && input.durationMs != null) {
      const burn = formatBurnRate(input.cost, input.durationMs);
      if (burn) costPart += ` ${c.dim(burn)}`;
    }
    leftParts.push(costPart);
  }

  // MCP servers
  if (display.mcp && mcp) {
    const total = mcp.servers.length;
    const errors = mcp.servers.filter(s => s.status === 'error').length;
    if (errors > 0) {
      leftParts.push(c.red(`MCP ${total - errors}/${total}`));
    } else {
      leftParts.push(c.dim(`MCP ${total}`));
    }
  }

  // Qwen metrics (shared helper)
  leftParts.push(...formatQwenMetrics(input, c, icons));

  // Rate limits (only show if >=50%)
  //
  // Critical-tier (>=85%) segments are inserted *after the context bar* instead
  // of appended to the end. fitSegments evicts from the rightmost left segment
  // when terminal space is tight, so a critical 7d quota at 85% would otherwise
  // be hidden by cache/cost segments — the exact moment the user needs to see
  // it. Promotion only kicks in at the same threshold getQuotaColor flips to
  // blinkRed, so colour and position escalate together.
  if (display.rateLimits && input.rateLimits) {
    const limits: [string, typeof input.rateLimits.fiveHour][] = [
      ['5h', input.rateLimits.fiveHour],
      ['7d', input.rateLimits.sevenDay],
    ];
    // Anchor index: right after all context slots (bar + tokens) so promoted
    // segments sit next to context info rather than between bar and tokens.
    let criticalInsertAt = contextSlotCount;
    for (const [label, win] of limits) {
      // Number.isFinite catches NaN/Infinity from malformed payloads — without
      // it, `NaN < 50` is false and the segment falls through to render
      // "NaN%(5h)". Defend at the boundary, not inside the glyph picker.
      if (!win || !Number.isFinite(win.usedPercentage) || win.usedPercentage < 50) continue;
      const colorFn = c[getQuotaColor(win.usedPercentage)];
      // Battery glyph in place of bolt — its shape mirrors usedPercentage so
      // urgency reads from the icon alone, even before the number registers.
      let limitStr = colorFn(`${icons.battery(win.usedPercentage)} ${win.usedPercentage.toFixed(0)}%(${label})`);
      if (win.usedPercentage >= 70 && win.resetsAt) {
        const countdown = formatCountdown(win.resetsAt);
        if (countdown) limitStr += c.dim(` ${countdown}`);
      }
      if (win.usedPercentage >= QUOTA_CRITICAL) {
        leftParts.splice(criticalInsertAt, 0, limitStr);
        criticalInsertAt++; // keep relative order between 5h and 7d when both critical
      } else {
        leftParts.push(limitStr);
      }
    }

    // Pace delta — shows how far ahead/behind of expected quota burn rate.
    // Gate on fiveHour window being present and computePaceDelta returning a result.
    const fiveHourWin = input.rateLimits?.fiveHour;
    if (fiveHourWin && Number.isFinite(fiveHourWin.usedPercentage)) {
      const pace = computePaceDelta(fiveHourWin.usedPercentage, fiveHourWin.resetsAt);
      if (pace != null) {
        const paceStr = formatPaceDelta(pace);
        if (paceStr === 'on pace') {
          leftParts.push(c.green('on pace'));
        } else {
          const paceIcon = pace.delta > 1 ? icons.car : pace.delta < -1 ? icons.turtle : '';
          const paceColorFn = c[getPaceColor(pace.delta)];
          const iconPrefix = paceIcon ? `${paceIcon}` : '';
          leftParts.push(paceColorFn(`${iconPrefix}${paceStr}`));
        }
      }
    }
  }

  // Right side: vim mode
  if (display.vim && input.vimMode) {
    rightParts.push(c.dim(`[${input.vimMode}]`));
  }

  // Right side: effort (hidden if medium). Prefer stdin (≥ 2.1.x) over the
  // transcript regex fallback — it's both more accurate and avoids a fragile
  // log-line match that breaks when wording changes.
  const effort = input.effortLevel || thinkingEffort;
  if (display.effort && effort && effort !== 'medium') {
    rightParts.push(c.dim(`^${effort}`));
  }

  // Config health hints (opt-in, default off). Sit on the right side as
  // auxiliary signals next to vim/effort, and are dropped silently when the
  // projected line width would overflow `cols` — they are advisory, never
  // critical, so quietly hiding them on narrow terminals is preferable to
  // wrapping the statusline.
  if (display.health && input.cwd) {
    const colorMode = ctx.config.colors.mode === 'auto' ? detectColorMode() : ctx.config.colors.mode;
    const hints = getConfigHealth(ctx.config, colorMode, input.cwd);
    if (hints.length > 0) {
      const candidates = hints.map(h =>
        h.severity === 'warn' ? c.yellow(`⚠ ${h.hint}`) : c.dim(`ℹ ${h.hint}`),
      );
      const leftW = displayWidth(leftParts.join(SEP));
      const currentRightW = rightParts.length ? displayWidth(rightParts.join(' ')) : 0;
      // +1 per added hint accounts for the joining space.
      let projectedW = leftW + (currentRightW > 0 ? 1 : 0) + currentRightW;
      for (const h of candidates) {
        const addW = displayWidth(h) + 1;
        if (projectedW + addW > cols) break;
        rightParts.push(h);
        projectedW += addW;
      }
    }
  }

  if (leftParts.length === 0 && rightParts.length === 0) return '';
  return fitSegments(leftParts, rightParts, SEP, cols);
}
