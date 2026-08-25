// ── Normalized statusline input ─────────────────────────────────────
//
// Single internal format that all renderers can consume.
// Platform-specific quirks are handled once here.
// Renderers check field presence, not platform identity.

import type { ClaudeCodeInput, QwenInput, RawInput, PrReviewState } from './types.js';
import { AUTO_COMPACT_THRESHOLD, AUTO_COMPACT_WARNING_GAP, PR_REVIEW_STATES } from './types.js';

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
    realUsedPercentage?: number;
    /** True when context fill is in the 5pp window before the platform's auto-compact threshold. */
    nearAutoCompact: boolean;
  };

  /** Cost in USD (Claude only) */
  cost?: number;

  /** Session duration in ms (Claude only) */
  durationMs?: number;

  /** API wait time in ms (Claude only — populated only when field present in payload) */
  apiDurationMs?: number;

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

  /** Count of directories added via /add-dir or --add-dir (≥ 2.1.x) */
  addedDirsCount?: number;

  /** Original branch before entering the worktree session (≥ 2.1.x) */
  worktreeOriginalBranch?: string;

  /** Reasoning effort level (≥ 2.1.x stdin, falls back to transcript regex) */
  effortLevel?: string;

  /** Extended thinking enabled (Claude only, CC ≥ 2.1.x) */
  thinkingEnabled?: boolean;

  /** Opus fast-mode active — 2.5x output speed, premium pricing (Claude only, CC ≥ 2.1.x) */
  fastMode?: boolean;

  /** Rate limits (Claude only) */
  rateLimits?: {
    fiveHour?: { usedPercentage: number; resetsAt?: number };
    sevenDay?: { usedPercentage: number; resetsAt?: number };
  };

  /** Cache hit rate percentage (Claude only) */
  cacheHitRate?: number;

  /** Open PR for the current branch (Claude only, CC ≥ 2.1.145) */
  pr?: { number: number; url?: string; reviewState?: PrReviewState };

  /** Repository identity parsed by CC from the origin remote (workspace.repo) */
  repo?: { host: string; owner: string; name: string; url: string };

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

/** Allowed values for PR review state (CC ≥ 2.1.145). */
const VALID_PR_REVIEW_STATES = new Set<string>(PR_REVIEW_STATES);

type CurrentUsageObject = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };

/**
 * Sum input token categories from `context_window.current_usage` to compute
 * a real context usage total (input + cache_read + cache_creation).
 * Excludes output_tokens: they are per-turn and reset each call, which would
 * cause the context bar to jitter (jump down at the start of every new turn).
 * Context window fill is determined by what was READ from the context, not
 * by how many tokens were output.
 * Returns undefined when `cu` is absent or not an object shape.
 */
function getRealUsageTotal(cu: unknown): number | undefined {
  if (typeof cu !== 'object' || !cu) return undefined;
  const obj = cu as CurrentUsageObject;
  const total = (obj.input_tokens ?? 0)
    + (obj.cache_read_input_tokens ?? 0)
    + (obj.cache_creation_input_tokens ?? 0);
  return total;
}

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

  // Real context usage percentage (Claude only): sums input + cache_read + cache_creation
  // (output_tokens excluded — per-turn, resets each call, causes bar jitter). More stable
  // than the hook-provided `used_percentage` near auto-compact thresholds.
  let realUsedPercentage: number | undefined;
  if (claude) {
    const total = getRealUsageTotal(claude.context_window?.current_usage);
    const windowSize = claude.context_window?.context_window_size;
    if (total !== undefined && windowSize) {
      realUsedPercentage = Math.min(100, Math.round((total / windowSize) * 100 * 10) / 10);
    }
  }

  // Auto-compact proximity warning: fires when context fill is in the
  // [threshold-gap, threshold) window. Uses realUsedPercentage when available
  // (more accurate; excludes output tokens), falls back to usedPercentage for
  // legacy payloads. Gated by platform (different thresholds Claude vs Qwen).
  // For claude-code, honors CLAUDE_CODE_AUTO_COMPACT_WINDOW env var — a fill-%
  // threshold (1-100) that mirrors Claude Code's own auto-compact trigger point.
  // Users who changed this setting in Claude Code should set the same value here.
  // Falls back to the hardcoded 84% default when absent or invalid.
  const effectivePct = realUsedPercentage ?? contextWindow.used_percentage ?? 0;
  let platformAutoCompactThreshold = AUTO_COMPACT_THRESHOLD[platform];
  if (platform === 'claude-code') {
    const envVal = process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    if (envVal !== undefined) {
      // Use Number() + Number.isInteger() so floats ("75.5") and trailing-junk
      // strings ("80abc") are rejected rather than silently truncated by parseInt.
      const parsed = Number(envVal);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 100) {
        platformAutoCompactThreshold = parsed;
      }
    }
  }
  const nearAutoCompact = effectivePct >= (platformAutoCompactThreshold - AUTO_COMPACT_WARNING_GAP)
    && effectivePct < platformAutoCompactThreshold;

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

  // PR widget (Claude only, CC ≥ 2.1.145).
  // number must be a positive integer — drop the whole object if invalid.
  // url: sanitize then accept only https:// scheme (OSC 8 injection guard).
  // reviewState: sanitize then gate against the PR_REVIEW_STATES allowlist.
  let pr: NormalizedInput['pr'];
  if (claude?.pr != null) {
    const rawPr = claude.pr;
    const n = rawPr.number;
    if (typeof n === 'number' && Number.isInteger(n) && n > 0) {
      let prUrl: string | undefined;
      if (typeof rawPr.url === 'string') {
        const sanitized = sanitizeTermString(rawPr.url);
        if (sanitized.startsWith('https://')) prUrl = sanitized;
      }
      let prReviewState: PrReviewState | undefined;
      if (typeof rawPr.review_state === 'string') {
        const sanitized = sanitizeTermString(rawPr.review_state);
        if (VALID_PR_REVIEW_STATES.has(sanitized)) prReviewState = sanitized as PrReviewState;
      }
      pr = { number: n, url: prUrl, reviewState: prReviewState };
    }
  }

  // Repository identity from workspace.repo (CC parses host/owner/name from the
  // origin remote). All three parts must be present and well-formed: the url is
  // rendered as an OSC 8 hyperlink, so each part is validated against a strict
  // pattern to keep a malformed payload from injecting into the link target.
  let repo: NormalizedInput['repo'];
  const rawRepo = (input as ClaudeCodeInput).workspace?.repo;
  if (rawRepo != null) {
    const host = typeof rawRepo.host === 'string' ? sanitizeTermString(rawRepo.host) : '';
    const owner = typeof rawRepo.owner === 'string' ? sanitizeTermString(rawRepo.owner) : '';
    const name = typeof rawRepo.name === 'string' ? sanitizeTermString(rawRepo.name) : '';
    if (/^[a-zA-Z0-9.-]+$/.test(host) && /^[\w.-]+$/.test(owner) && /^[\w.-]+$/.test(name)) {
      repo = { host, owner, name, url: `https://${host}/${owner}/${name}` };
    }
  }

  return {
    platform,
    model: sanitizeTermString(modelName),
    repo,
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
      realUsedPercentage,
      nearAutoCompact,
    },
    cost: claude ? claude.cost?.total_cost_usd : undefined,
    durationMs: claude ? claude.cost?.total_duration_ms : undefined,
    apiDurationMs: claude ? claude.cost?.total_api_duration_ms : undefined,
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
    thinkingEnabled: claude?.thinking?.enabled === true ? true : undefined,
    fastMode: claude?.fast_mode === true ? true : undefined,
    // Prefer the top-level worktree.name; fall back to workspace.git_worktree,
    // which CC populates for ANY git worktree (verified on v2.1.193) — even
    // sessions not started with --worktree, where worktree.name is absent.
    worktreeName: (() => {
      const n = input.worktree?.name ?? (input as ClaudeCodeInput).workspace?.git_worktree;
      return n ? sanitizeTermString(n) : undefined;
    })(),
    addedDirsCount: (() => {
      const dirs = (input as ClaudeCodeInput).workspace?.added_dirs;
      if (!Array.isArray(dirs) || dirs.length === 0) return undefined;
      return dirs.length;
    })(),
    worktreeOriginalBranch: (() => {
      const orig = (input as ClaudeCodeInput).worktree?.original_branch;
      if (!orig || typeof orig !== 'string') return undefined;
      return sanitizeTermString(orig);
    })(),
    rateLimits,
    cacheHitRate,
    pr,
    raw: input,
  };
}
