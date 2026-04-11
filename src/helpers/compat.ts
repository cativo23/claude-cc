import type { ClaudeCodeInput } from '../types.js';

/**
 * Normalizes cost data from both Claude Code and Qwen Code payloads.
 * Qwen uses `metrics.files` instead of `cost` for line changes,
 * and may not have cost/duration at all.
 */
export function getCost(input: StatuslineInput) {
  const cost = input.cost;
  const metricsFiles = input.metrics?.files;
  return {
    total_cost_usd: cost?.total_cost_usd ?? 0,
    total_duration_ms: cost?.total_duration_ms ?? 0,
    total_lines_added: cost?.total_lines_added ?? metricsFiles?.total_lines_added ?? 0,
    total_lines_removed: cost?.total_lines_removed ?? metricsFiles?.total_lines_removed ?? 0,
  };
}

/**
 * Normalizes current usage. Qwen sends a number, Claude sends { output_tokens: number }.
 */
export function getCurrentUsage(input: StatuslineInput): number {
  const cu = input.context_window.current_usage;
  if (typeof cu === 'number') return cu;
  return cu?.output_tokens ?? 0;
}

/**
 * Get working directory: Claude has `cwd`, Qwen has `workspace.current_dir`.
 */
export function getCwd(input: StatuslineInput): string {
  return input.cwd || input.workspace?.current_dir || process.cwd();
}
