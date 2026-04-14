import { padLine, displayWidth } from './text.js';
import { getQuotaColor, type Colors } from './colors.js';
import { buildContextBar, SEP } from './shared.js';
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

  // Qwen Code: API metrics (requests, cached tokens, thoughts)
  if (input.platform === 'qwen-code' && input.performance) {
    const perf = input.performance;
    // API requests
    if (perf.requests > 0) {
      let reqStr = `${perf.requests} req`;
      if (perf.errors > 0) reqStr += c.red(` (${perf.errors} err)`);
      leftParts.push(c.dim(`${icons.bolt} ${reqStr}`));
    }
    // Cached tokens (from qwen metrics format vs claude format)
    if (input.tokens.cached != null && input.tokens.cached > 0) {
      leftParts.push(c.dim(`${icons.comment} ${formatTokens(input.tokens.cached)} cached`));
    }
    // Thoughts (reasoning tokens)
    if (input.tokens.thoughts != null && input.tokens.thoughts > 0) {
      const label = input.tokens.thoughts === 1 ? 'thought' : 'thoughts';
      leftParts.push(c.dim(`^${formatTokens(input.tokens.thoughts)} ${label}`));
    }
  }

  // Token speed
  if (display.tokenSpeed && tokenSpeed != null) {
    leftParts.push(c.dim(`${icons.bolt}${tokenSpeed} tok/s`));
  }

  // Rate limits (only show if >=50%)
  if (display.rateLimits && input.raw.rate_limits) {
    const limits: [string, typeof input.raw.rate_limits.five_hour][] = [
      ['5h', input.raw.rate_limits.five_hour],
      ['7d', input.raw.rate_limits.seven_day],
    ];
    for (const [label, win] of limits) {
      if (!win || win.used_percentage < 50) continue;
      const colorFn = c[getQuotaColor(win.used_percentage)];
      let limitStr = colorFn(`${icons.bolt} ${win.used_percentage.toFixed(0)}%(${label})`);
      if (win.used_percentage >= 70 && win.resets_at) {
        const countdown = formatCountdown(win.resets_at);
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
