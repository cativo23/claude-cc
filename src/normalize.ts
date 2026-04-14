// ── Normalized statusline input ─────────────────────────────────────
//
// Single internal format that all renderers can consume.
// Platform-specific quirks are handled once here.
// Renderers check field presence, not platform identity.

import type { ClaudeCodeInput, QwenInput, RawInput } from './types.js';

export function isQwenInput(input: RawInput): input is QwenInput {
  return !!((input as QwenInput).metrics && typeof (input as QwenInput).metrics === 'object' && 'models' in (input as QwenInput).metrics);
}

export type Platform = 'claude-code' | 'qwen-code';

export interface NormalizedInput {
  /** Which platform sent the data */
  platform: Platform;
  /** Model display name */
  model: string;
  /** Session identifier */
  sessionId: string;
  /** App version */
  version?: string;
  /** Current working directory */
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

  /** Git branch (Qwen native, Claude via git status) */
  gitBranch?: string;

  /** File change stats */
  linesAdded: number;
  linesRemoved: number;

  /** Vim mode if active */
  vimMode?: string;

  /** Escape hatch: access raw platform data for platform-specific widgets */
  raw: RawInput;
}

/** Strip ANSI control characters and other non-printable chars from branch names */
function sanitizeBranch(branch: string): string {
  return branch.replace(/[\x00-\x1f\x7f]/g, '');
}

export function normalize(input: RawInput): NormalizedInput {
  const platform: Platform = isQwenInput(input) ? 'qwen-code' : 'claude-code';
  const qwen = isQwenInput(input) ? input : null;
  const claude = isQwenInput(input) ? null : input as ClaudeCodeInput;

  // Model name with null guard for malformed input
  const modelName = typeof input.model === 'string'
    ? input.model
    : (input.model?.display_name ?? 'unknown');
  const cwd = (input as { cwd?: string }).cwd || input.workspace?.current_dir || process.cwd();

  // Token unification
  const inputTokens = input.context_window.total_input_tokens ?? 0;
  const outputTokens = input.context_window.total_output_tokens ?? 0;

  let cached: number | undefined;
  let thoughts: number | undefined;

  if (qwen) {
    const entries = Object.values(qwen.metrics.models);
    if (entries.length > 0) {
      cached = entries[0].tokens?.cached;
      thoughts = entries[0].tokens?.thoughts;
    }
  } else if (claude) {
    cached = claude.context_window?.cache_read_input_tokens;
  }

  // Performance (Qwen only)
  let performance: NormalizedInput['performance'];
  if (qwen) {
    const entries = Object.values(qwen.metrics.models);
    if (entries.length > 0 && entries[0]?.api) {
      performance = {
        requests: entries[0].api.total_requests,
        errors: entries[0].api.total_errors,
        latencyMs: entries[0].api.total_latency_ms,
      };
    }
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
    model: modelName,
    sessionId: input.session_id,
    version: input.version,
    cwd,
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
    gitBranch: qwen && qwen.git?.branch ? sanitizeBranch(qwen.git.branch) : undefined,
    linesAdded,
    linesRemoved,
    vimMode: input.vim?.mode,
    raw: input,
  };
}
