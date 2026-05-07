// ── Normalized statusline input ─────────────────────────────────────
//
// Single internal format that all renderers can consume.
// Platform-specific quirks are handled once here.
// Renderers check field presence, not platform identity.

import type { ClaudeCodeInput, QwenInput, RawInput } from './types.js';

export function isQwenInput(input: RawInput): input is QwenInput {
  const raw = input as unknown as Record<string, unknown>;
  if (!raw.metrics || typeof raw.metrics !== 'object' || !('models' in raw.metrics)) return false;
  const models = (raw.metrics as { models?: Record<string, unknown> }).models;
  if (!models || typeof models !== 'object') return false;
  const first = Object.values(models)[0];
  return first != null && typeof first === 'object' && 'api' in first;
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

  /** Session name */
  sessionName?: string;

  /** Output style name */
  outputStyle?: string;

  /** Agent name */
  agentName?: string;

  /** Worktree name */
  worktreeName?: string;

  /** Reasoning effort level (≥ 2.1.x stdin, falls back to transcript regex) */
  effortLevel?: string;

  /** Rate limits (Claude only) */
  rateLimits?: {
    fiveHour?: { usedPercentage: number; resetsAt?: number };
    sevenDay?: { usedPercentage: number; resetsAt?: number };
  };

  /** Cache hit rate percentage (Claude only) */
  cacheHitRate?: number;

  /** Escape hatch: access raw platform data for platform-specific widgets */
  raw: RawInput;
}

/**
 * Strip terminal control characters and bidirectional/zero-width Unicode from
 * untrusted strings.
 * - C0/C1 + DEL — escape sequences, ANSI, etc.
 * - U+200B-200F — zero-width and LTR/RTL marks
 * - U+202A-202E — explicit directional embedding/overrides (visual spoofing)
 * - U+2028/2029 — line/paragraph separators
 * - U+2066-2069 — directional isolates
 */
export function sanitizeTermString(s: string): string {
  return s.replace(/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2028\u2029\u2066-\u2069]/g, '');
}

/** Allowed values for the reasoning effort level field (CC ≥ 2.1.x). */
const VALID_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

type CurrentUsageObject = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };

/**
 * Extract cache fields from `context_window.current_usage` (modern ≥ 2.1.x payloads).
 * Returns `cached` (cache_read_input_tokens) and `denominator` (sum of all per-turn input
 * token categories). Returns empty object when `cu` is absent or not an object shape.
 */
function getCacheFields(cu: unknown): { cached?: number; denominator?: number } {
  if (typeof cu !== 'object' || !cu) return {};
  const obj = cu as CurrentUsageObject;
  const read = obj.cache_read_input_tokens;
  const fresh = obj.input_tokens ?? 0;
  const create = obj.cache_creation_input_tokens ?? 0;
  const total = (read ?? 0) + fresh + create;
  return { cached: read, denominator: total > 0 ? total : undefined };
}

export function normalize(input: RawInput): NormalizedInput {
  const platform: Platform = isQwenInput(input) ? 'qwen-code' : 'claude-code';
  const qwen = isQwenInput(input) ? input : null;
  const claude = isQwenInput(input) ? null : input as ClaudeCodeInput;

  // Model name with null guard for malformed input
  const modelName = typeof input.model === 'string'
    ? input.model
    : (input.model?.display_name ?? '');
  const cwd = input.cwd || input.workspace?.current_dir || process.cwd();

  // Token unification — context_window is required by type but can be absent
  // from malformed payloads; default to an empty object so all field accesses
  // degrade gracefully rather than crashing with "Cannot read properties of undefined".
  const contextWindow = (input.context_window ?? {}) as ClaudeCodeInput['context_window'];
  const inputTokens = contextWindow.total_input_tokens ?? 0;
  const outputTokens = contextWindow.total_output_tokens ?? 0;

  let cached: number | undefined;
  let thoughts: number | undefined;

  const modelEntries = qwen ? Object.values(qwen.metrics.models) : [];
  const first = modelEntries[0];

  if (qwen) {
    if (first) {
      cached = first.tokens?.cached;
      thoughts = first.tokens?.thoughts;
    }
  } else if (claude) {
    // Modern Claude Code (≥ 2.1.x) nests cache fields under current_usage.
    // Pre-2.1.x payloads exposed cache_read_input_tokens at the top level of
    // context_window, but those versions are no longer in use. Reading only from
    // current_usage keeps tokens.cached consistent with cacheHitRate: both are
    // undefined for legacy payloads (no per-turn denominator, no cached count).
    ({ cached } = getCacheFields(claude.context_window?.current_usage));
  }

  // Per-turn cache denominator (Claude only): fresh input + cache_read + cache_creation
  // for the current turn. Used to compute a meaningful cache hit rate, since
  // `cached` is per-turn while `total_input_tokens` is cumulative across the session.
  // Requires a modern (≥ 2.1.x) payload with current_usage object fields — older
  // payloads that only expose total_input_tokens omit the denominator entirely.
  let cacheTurnDenominator: number | undefined;
  if (claude) {
    ({ denominator: cacheTurnDenominator } = getCacheFields(claude.context_window?.current_usage));
  }

  // Performance (Qwen only)
  let performance: NormalizedInput['performance'];
  if (qwen && first?.api) {
    performance = {
      requests: first.api.total_requests,
      errors: first.api.total_errors,
      latencyMs: first.api.total_latency_ms,
    };
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

  // Rate limits (Claude only)
  let rateLimits: NormalizedInput['rateLimits'];
  if (claude?.rate_limits) {
    rateLimits = {
      fiveHour: claude.rate_limits.five_hour
        ? { usedPercentage: claude.rate_limits.five_hour.used_percentage, resetsAt: claude.rate_limits.five_hour.resets_at }
        : undefined,
      sevenDay: claude.rate_limits.seven_day
        ? { usedPercentage: claude.rate_limits.seven_day.used_percentage, resetsAt: claude.rate_limits.seven_day.resets_at }
        : undefined,
    };
  }

  // Cache hit rate (Claude only) — denominator is the current turn's total input
  // (fresh + cache_read + cache_creation), not the cumulative session total.
  const cacheHitRate = (cached != null && cacheTurnDenominator && platform === 'claude-code')
    ? Math.min(100, Math.round((cached / cacheTurnDenominator) * 100))
    : undefined;

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
      usedPercentage: contextWindow.used_percentage ?? 0,
      windowSize: qwen
        ? qwen.context_window.context_window_size
        : claude?.context_window?.context_window_size,
    },
    cost: claude ? claude.cost?.total_cost_usd : undefined,
    durationMs: claude ? claude.cost?.total_duration_ms : undefined,
    performance,
    gitBranch: qwen && qwen.git?.branch ? sanitizeTermString(qwen.git.branch) : undefined,
    linesAdded,
    linesRemoved,
    vimMode: input.vim?.mode ? sanitizeTermString(input.vim.mode) : undefined,
    sessionName: input.session_name ? sanitizeTermString(input.session_name) : undefined,
    outputStyle: input.output_style?.name ? sanitizeTermString(input.output_style.name) : undefined,
    agentName: input.agent?.name ? sanitizeTermString(input.agent.name) : undefined,
    effortLevel: claude?.effort?.level && VALID_EFFORT_LEVELS.has(claude.effort.level)
      ? sanitizeTermString(claude.effort.level)
      : undefined,
    worktreeName: input.worktree?.name ? sanitizeTermString(input.worktree.name) : undefined,
    rateLimits,
    cacheHitRate,
    raw: input,
  };
}
