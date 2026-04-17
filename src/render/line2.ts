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
    const pct = input.context_window.used_percentage;
    leftParts.push(buildContextBar(pct, c, { iconSet: icons }));
  }

  // Context tokens (estimated used/capacity from percentage)
  if (display.contextTokens && input.context_window.total_input_tokens != null && input.context_window.used_percentage > 0) {
    const used = input.context_window.total_input_tokens;
    const capacity = Math.round(used / (input.context_window.used_percentage / 100));
    leftParts.push(c.dim(`${formatTokens(used)}/${formatTokens(capacity)}`));
  }

  // Tokens
  if (display.tokens) {
    const inTokens = input.context_window.total_input_tokens;
    const outTokens = input.context_window.total_output_tokens;
    const parts: string[] = [];
    if (inTokens != null) parts.push(`${formatTokens(inTokens)}↑`);
    if (outTokens != null) parts.push(`${formatTokens(outTokens)}↓`);
    if (parts.length > 0) leftParts.push(`${icons.comment} ${parts.join(' ')}`);
  }

  // Cache metrics (hit rate)
  if (display.cacheMetrics) {
    const cacheRead = input.context_window.cache_read_input_tokens;
    const totalIn = input.context_window.total_input_tokens;
    if (cacheRead != null && totalIn != null && totalIn > 0) {
      const hitRate = Math.round((cacheRead / totalIn) * 100);
      leftParts.push(c.dim(`cache ${hitRate}%`));
    }
  }

  // Cost + burn rate
  if (display.cost && input.cost) {
    const costStr = formatCost((input.cost?.total_cost_usd ?? 0));
    let costPart = costStr;
    if (display.burnRate) {
      const burn = formatBurnRate((input.cost?.total_cost_usd ?? 0), (input.cost?.total_duration_ms ?? 0));
      if (burn) costPart += ` ${c.dim(burn)}`;
    }
    leftParts.push(costPart);
  }

  // Duration
  if (display.duration && input.cost) {
    leftParts.push(`${icons.clock} ${formatDuration((input.cost?.total_duration_ms ?? 0))}`);
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

  // Token speed
  if (display.tokenSpeed && tokenSpeed != null) {
    leftParts.push(c.dim(`${icons.bolt}${tokenSpeed} tok/s`));
  }

  // Model metrics: API requests, cached tokens, thoughts (from Qwen)
  if (display.tokenSpeed) {
    const modelEntries = Object.values(input.metrics?.models ?? {});
    if (modelEntries.length > 0) {
      const first = modelEntries[0];
      // API requests
      const totalReqs = first.api?.total_requests;
      const errors = first.api?.total_errors;
      if (totalReqs != null && totalReqs > 0) {
        let reqStr = `${totalReqs} req`;
        if (errors && errors > 0) reqStr += c.red(` (${errors} err)`);
        leftParts.push(c.dim(`${icons.bolt} ${reqStr}`));
      }
      // Cached tokens
      const cached = first.tokens?.cached;
      if (cached != null && cached > 0) {
        leftParts.push(c.dim(`${icons.comment} ${formatTokens(cached)} cached`));
      }
      // Thoughts (reasoning tokens)
      const thoughts = first.tokens?.thoughts;
      if (thoughts != null && thoughts > 0) {
        leftParts.push(c.dim(`^${formatTokens(thoughts)} thought`));
      }
    }
  }

  // Rate limits (only show if >=50%)
  if (display.rateLimits && input.rate_limits) {
    const limits: [string, typeof input.rate_limits.five_hour][] = [
      ['5h', input.rate_limits.five_hour],
      ['7d', input.rate_limits.seven_day],
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
  if (display.vim && input.vim?.mode) {
    rightParts.push(c.dim(`[${input.vim.mode}]`));
  }

  // Right side: effort (hidden if medium)
  if (display.effort && thinkingEffort && thinkingEffort !== 'medium') {
    rightParts.push(c.dim(`^${thinkingEffort}`));
  }

  const leftStr = leftParts.join(SEP);
  if (rightParts.length === 0) return leftStr;
  return padLine(leftStr, rightParts.join(' '), cols);
}
