import { padLine } from './text.js';
import { getQuotaColor, type Colors } from './colors.js';
import { buildContextBar, formatQwenMetrics, SEP } from './shared.js';
import { formatTokens, formatDuration, formatCost, formatBurnRate } from '../utils/format.js';
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

  // Context bar
  if (display.contextBar) {
    const pct = input.context.usedPercentage;
    leftParts.push(buildContextBar(pct, c, { iconSet: icons }));
  }

  // Context tokens (estimated used/capacity from percentage)
  if (display.contextTokens && input.tokens.input > 0 && input.context.usedPercentage > 0) {
    const used = input.tokens.input;
    const capacity = Math.round(used / (input.context.usedPercentage / 100));
    leftParts.push(c.dim(`${formatTokens(used)}/${formatTokens(capacity)}`));
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

  // Cache metrics (hit rate)
  if (display.cacheMetrics) {
    const cacheRead = input.tokens.cached;
    const totalIn = input.tokens.input;
    if (cacheRead != null && totalIn > 0) {
      const hitRate = Math.round((cacheRead / totalIn) * 100);
      leftParts.push(c.dim(`cache ${hitRate}%`));
    }
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

  // Duration (Claude only)
  if (display.duration && input.durationMs != null) {
    leftParts.push(`${icons.clock} ${formatDuration(input.durationMs)}`);
  }

  // Memory
  if (display.memory && memory) {
    leftParts.push(c.dim(`${memory.percentage}% mem`));
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

  // Token speed
  if (display.tokenSpeed && tokenSpeed != null) {
    leftParts.push(c.dim(`${icons.bolt}${tokenSpeed} tok/s`));
  }

  // Rate limits (only show if >=50%)
  if (display.rateLimits && input.rateLimits) {
    const limits: [string, typeof input.rateLimits.fiveHour][] = [
      ['5h', input.rateLimits.fiveHour],
      ['7d', input.rateLimits.sevenDay],
    ];
    for (const [label, win] of limits) {
      if (!win || win.usedPercentage < 50) continue;
      const colorFn = c[getQuotaColor(win.usedPercentage)];
      let limitStr = colorFn(`${icons.bolt} ${win.usedPercentage.toFixed(0)}%(${label})`);
      if (win.usedPercentage >= 70 && win.resetsAt) {
        const countdown = formatCountdown(win.resetsAt);
        if (countdown) limitStr += c.dim(` ${countdown}`);
      }
      leftParts.push(limitStr);
    }
  }

  // Right side: vim mode
  if (display.vim && input.vimMode) {
    rightParts.push(c.dim(`[${input.vimMode}]`));
  }

  // Right side: effort (hidden if medium)
  if (display.effort && thinkingEffort && thinkingEffort !== 'medium') {
    rightParts.push(c.dim(`^${thinkingEffort}`));
  }

  const leftStr = leftParts.join(SEP);
  if (rightParts.length === 0) return leftStr;
  return padLine(leftStr, rightParts.join(' '), cols);
}
