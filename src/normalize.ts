// ── Normalized statusline input ─────────────────────────────────────
//
// Single internal format that all renderers can consume.
// Platform-specific quirks are handled once here.
// Renderers check field presence, not platform identity.

import type { ClaudeCodeInput, QwenInput, RawInput } from './types.js';
import { isQwenInput } from './types.js';

export type Platform = 'claude-code' | 'qwen-code';

/** Strip terminal control characters (C0 + C1 + DEL) from untrusted strings */
export function sanitizeTermString(s: string): string {
  return s.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

export interface NormalizedInput {
  /** Which platform sent the data */
  platform: Platform;
  /** Model display name (sanitized) */
  model: string;
  /** Session identifier (sanitized) */
  sessionId: string;
  /** App version (sanitized) */
  version?: string;
  /** Current working directory (sanitized) */
  cwd: string;

  /** Unified token counts */
  tokens: {
    input: number;
    output: number;
    cached?: number;
    thoughts?: number;
  };

  /** Context window usage */
  context: {
    usedPercentage: number;
    windowSize?: number;
  };

  /** Cost in USD (Claude only) */
  cost?: number;

  /** Session duration in ms (Claude only) */
  durationMs?: number;

  /** API performance metrics (Qwen only) */
  performance?: {
    requests: number;
    errors: number;
    latencyMs: number;
  };

  /** Git branch — sanitized (Qwen native, Claude via git status) */
  gitBranch?: string;

  /** File change stats */
  linesAdded: number;
  linesRemoved: number;

  /** Vim mode if active (sanitized) */
  vimMode?: string;

  /** Session name (sanitized, Claude only) */
  sessionName?: string;
  /** Output style name (sanitized) */
  outputStyle?: string;
  /** Agent name (sanitized) */
  agentName?: string;
  /** Worktree name (sanitized) */
  worktreeName?: string;

  /** Rate limits (Claude only) */
  rateLimits?: {
    fiveHour?: { usedPercentage: number; resetsAt?: number };
    sevenDay?: { usedPercentage: number; resetsAt?: number };
  };

  /** Cache hit rate as percentage (Claude only, from cache_read/total_input) */
  cacheHitRate?: number;

  /** Escape hatch: access raw platform data for platform-specific widgets */
  raw: RawInput;
}

export function normalize(input: RawInput): NormalizedInput {
  const platform: Platform = isQwenInput(input) ? 'qwen-code' : 'claude-code';
  const qwen = isQwenInput(input) ? input : null;
  const claude = isQwenInput(input) ? null : input as ClaudeCodeInput;

  // Model name with null guard for malformed input
  const modelName = typeof input.model === 'string'
    ? input.model
    : (input.model?.display_name ?? '');
  const cwd = (input as { cwd?: string }).cwd || input.workspace?.current_dir || process.cwd();

  // Token unification
  const inputTokens = input.context_window.total_input_tokens ?? 0;
  const outputTokens = input.context_window.total_output_tokens ?? 0;

  let cached: number | undefined;
  let thoughts: number | undefined;
  let performance: NormalizedInput['performance'];

  if (qwen) {
    const modelEntries = Object.values(qwen.metrics.models);
    const first = modelEntries[0];
    if (first) {
      cached = first.tokens?.cached;
      thoughts = first.tokens?.thoughts;
      if (first.api) {
        performance = {
          requests: first.api.total_requests,
          errors: first.api.total_errors,
          latencyMs: first.api.total_latency_ms,
        };
      }
    }
  } else if (claude) {
    cached = claude.context_window?.cache_read_input_tokens;
  }

  // Lines changed
  let linesAdded = 0;
  let linesRemoved = 0;
  if (qwen) {
    linesAdded = qwen.metrics.files?.total_lines_added ?? 0;
    linesRemoved = qwen.metrics.files?.total_lines_removed ?? 0;
  } else if (claude) {
    linesAdded = claude.cost?.total_lines_added ?? 0;
    linesRemoved = claude.cost?.total_lines_removed ?? 0;
  }

  return {
    platform,
    model: sanitizeTermString(modelName),
    sessionId: sanitizeTermString(input.session_id),
    version: input.version ? sanitizeTermString(input.version) : undefined,
    cwd: sanitizeTermString(cwd),
    tokens: {
      input: inputTokens,
      output: outputTokens,
      cached,
      thoughts,
    },
    context: {
      usedPercentage: input.context_window.used_percentage,
      windowSize: qwen ? qwen.context_window.context_window_size : undefined,
    },
    cost: claude ? claude.cost?.total_cost_usd : undefined,
    durationMs: claude ? claude.cost?.total_duration_ms : undefined,
    performance,
    gitBranch: qwen?.git?.branch ? sanitizeTermString(qwen.git.branch) : undefined,
    linesAdded,
    linesRemoved,
    vimMode: input.vim?.mode ? sanitizeTermString(input.vim.mode) : undefined,
    sessionName: input.session_name ? sanitizeTermString(input.session_name) : undefined,
    outputStyle: input.output_style?.name ? sanitizeTermString(input.output_style.name) : undefined,
    agentName: input.agent?.name ? sanitizeTermString(input.agent.name) : undefined,
    worktreeName: input.worktree?.name ? sanitizeTermString(input.worktree.name) : undefined,
    rateLimits: claude?.rate_limits ? {
      fiveHour: claude.rate_limits.five_hour ? { usedPercentage: claude.rate_limits.five_hour.used_percentage, resetsAt: claude.rate_limits.five_hour.resets_at } : undefined,
      sevenDay: claude.rate_limits.seven_day ? { usedPercentage: claude.rate_limits.seven_day.used_percentage, resetsAt: claude.rate_limits.seven_day.resets_at } : undefined,
    } : undefined,
    cacheHitRate: (cached != null && inputTokens > 0 && platform === 'claude-code') ? Math.round((cached / inputTokens) * 100) : undefined,
    raw: input,
  };
}
