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
  const { normalized: n, tokenSpeed, transcript: { thinkingEffort }, config: { display }, cols, memory, mcp, icons } = ctx;
  const leftParts: string[] = [];
  const rightParts: string[] = [];

  // Context bar
  if (display.contextBar) {
    leftParts.push(buildContextBar(n.context.usedPercentage, c, { iconSet: icons }));
  }

  // Context tokens (estimated used/capacity from percentage)
  if (display.contextTokens && n.tokens.input > 0 && n.context.usedPercentage > 0) {
    const capacity = Math.round(n.tokens.input / (n.context.usedPercentage / 100));
    leftParts.push(c.dim(`${formatTokens(n.tokens.input)}/${formatTokens(capacity)}`));
  }

  // Tokens
  if (display.tokens) {
    const parts: string[] = [];
    if (n.tokens.input > 0) parts.push(`${formatTokens(n.tokens.input)}↑`);
    if (n.tokens.output > 0) parts.push(`${formatTokens(n.tokens.output)}↓`);
    if (parts.length > 0) leftParts.push(`${icons.comment} ${parts.join(' ')}`);
  }

  // Cache metrics (hit rate — Claude only)
  if (display.cacheMetrics && n.cacheHitRate != null) {
    leftParts.push(c.dim(`cache ${n.cacheHitRate}%`));
  }

  // Cost + burn rate (Claude only)
  if (display.cost && n.cost != null) {
    let costPart = formatCost(n.cost);
    if (display.burnRate && n.durationMs != null) {
      const burn = formatBurnRate(n.cost, n.durationMs);
      if (burn) costPart += ` ${c.dim(burn)}`;
    }
    leftParts.push(costPart);
  }

  // Duration (Claude only)
  if (display.duration && n.durationMs != null) {
    leftParts.push(`${icons.clock} ${formatDuration(n.durationMs)}`);
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
  leftParts.push(...formatQwenMetrics(n, c, icons));

  // Token speed
  if (display.tokenSpeed && tokenSpeed != null) {
    leftParts.push(c.dim(`${icons.bolt}${tokenSpeed} tok/s`));
  }

  // Rate limits (only show if >=50%)
  if (display.rateLimits && n.rateLimits) {
    const limits: [string, typeof n.rateLimits.fiveHour][] = [
      ['5h', n.rateLimits.fiveHour],
      ['7d', n.rateLimits.sevenDay],
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

  // Right side: vim mode (sanitized via normalize)
  if (display.vim && n.vimMode) {
    rightParts.push(c.dim(`[${n.vimMode}]`));
  }

  // Right side: effort (hidden if medium)
  if (display.effort && thinkingEffort && thinkingEffort !== 'medium') {
    rightParts.push(c.dim(`^${thinkingEffort}`));
  }

  const leftStr = leftParts.join(SEP);
  if (rightParts.length === 0) return leftStr;
  return padLine(leftStr, rightParts.join(' '), cols);
}
