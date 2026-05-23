// ── Claude Code stdin JSON ──────────────────────────────────────────

export interface ClaudeCodeInput {
  model: string | { display_name: string };
  session_id: string;
  session_name?: string;
  cwd?: string;
  workspace?: { current_dir: string };
  context_window: {
    context_window_size?: number;
    used_percentage: number;
    remaining_percentage: number;
    current_usage?: number | {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    total_input_tokens?: number;
    total_output_tokens?: number;
    /** Legacy top-level path; modern payloads nest these under current_usage. */
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  cost: {
    total_cost_usd: number;
    total_duration_ms: number;
    total_api_duration_ms?: number;
    total_lines_added?: number;
    total_lines_removed?: number;
  };
  transcript_path?: string;
  output_style?: { name: string };
  version?: string;
  agent?: { name: string };
  worktree?: { name: string };
  vim?: { mode: string };
  rate_limits?: {
    five_hour?: RateLimitWindow;
    seven_day?: RateLimitWindow;
  };
  exceeds_200k_tokens?: boolean;
  /** Modern (≥ 2.1.x) — current reasoning effort level. */
  effort?: { level?: string };
  /** Modern (≥ 2.1.x) — extended thinking enabled state. */
  thinking?: { enabled?: boolean };
}

export interface RateLimitWindow {
  used_percentage: number;
  resets_at?: number;
}

// ── Parser outputs ──────────────────────────────────────────────────

export interface GitStatus {
  branch: string;
  staged: number;
  modified: number;
  untracked: number;
}

export const EMPTY_GIT: Readonly<GitStatus> = Object.freeze({
  branch: '',
  staged: 0,
  modified: 0,
  untracked: 0,
});

export interface TranscriptData {
  tools: ToolEntry[];
  agents: AgentEntry[];
  todos: TodoEntry[];
  thinkingEffort: ThinkingEffort;
  sessionStart: Date | null;
}

export const EMPTY_TRANSCRIPT: Readonly<TranscriptData> = Object.freeze({
  tools: Object.freeze([] as ToolEntry[]),
  agents: Object.freeze([] as AgentEntry[]),
  todos: Object.freeze([] as TodoEntry[]),
  thinkingEffort: '' as ThinkingEffort,
  sessionStart: null,
} as TranscriptData);

export type ThinkingEffort = 'low' | 'medium' | 'high' | 'max' | 'xhigh' | '';

export type ToolStatus = 'running' | 'completed' | 'error';

export interface ToolEntry {
  id: string;
  name: string;
  target?: string;
  status: ToolStatus;
  startTime: Date;
  endTime?: Date;
}

export interface AgentEntry {
  id: string;
  type: string;
  model?: string;
  description?: string;
  status: ToolStatus;
  startTime: Date;
  endTime?: Date;
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoEntry {
  id: string;
  content: string;
  status: TodoStatus;
}

export interface GsdInfo {
  currentTask?: string;
  updateAvailable?: boolean;
}

export interface MemoryInfo {
  usedBytes: number;
  totalBytes: number;
  percentage: number;
}

export interface McpServerInfo {
  name: string;
  status: 'ok' | 'error' | 'unknown';
}

export interface McpInfo {
  servers: McpServerInfo[];
}

// ── Render context ──────────────────────────────────────────────────

import type { NormalizedInput, Platform } from './normalize.js';

export interface RenderContext {
  input: NormalizedInput;
  git: GitStatus;
  /** Renderers must not mutate transcript data — it may be the frozen EMPTY_TRANSCRIPT singleton. */
  transcript: Readonly<TranscriptData>;
  tokenSpeed: number | null;
  memory: MemoryInfo | null;
  gsd: GsdInfo | null;
  mcp: McpInfo | null;
  cols: number;
  config: HudConfig;
  icons: import('./render/icons.js').IconSet;
}

// ── Config ──────────────────────────────────────────────────────────

export interface HudConfig {
  /**
   * Internal render mode — controls which renderer is used.
   * Derived from `preset` via applyPreset(). Users should set `preset` instead.
   *   multiline  → full multi-line renderer (line1+line2+line3+line4)
   *   singleline → compact single-line renderer
   *   auto       → pick based on terminal width (<70 cols → singleline)
   */
  layout: 'multiline' | 'singleline' | 'auto';
  gsd: boolean;
  display: DisplayToggles;
  colors: ColorConfig;
  /**
   * User-facing preset — drives layout + display toggles (Phase 3).
   * CLI: --full | --balanced | --minimal | --preset=<value>
   */
  preset?: 'full' | 'balanced' | 'minimal';
  theme?: string;
  icons?: 'nerd' | 'emoji' | 'none';
  /** Visual style for line1 — 'classic' (pipe-separated) or 'powerline' (colored segments). */
  style?: 'classic' | 'powerline';
  powerline?: {
    /** Separator glyph preset. Defaults to 'auto' (nerd font → arrow, else compatible). */
    style?: PowerlineStyleName;
  };
}

/**
 * Single source of truth for valid powerline style names. Imported by
 * `src/config.ts` (validates JSON config + CLI flags) and
 * `src/commands/themes.ts` (validates `--style=<name>`). Keep in sync with
 * `POWERLINE_STYLES` in `src/render/powerline.ts` — that map's keys
 * MUST match this list.
 */
export const POWERLINE_STYLE_NAMES = [
  'arrow', 'flame', 'slant', 'round', 'diamond', 'compatible', 'plain', 'auto',
] as const;
export type PowerlineStyleName = typeof POWERLINE_STYLE_NAMES[number];

export interface DisplayToggles {
  model: boolean;
  branch: boolean;
  gitChanges: boolean;
  directory: boolean;
  contextBar: boolean;
  contextTokens: boolean;
  tokens: boolean;
  cost: boolean;
  burnRate: boolean;
  duration: boolean;
  tokenSpeed: boolean;
  rateLimits: boolean;
  paceDelta: boolean;
  quotaProjection: boolean;
  tools: boolean;
  todos: boolean;
  vim: boolean;
  effort: boolean;
  worktree: boolean;
  agent: boolean;
  sessionName: boolean;
  style: boolean;
  version: boolean;
  linesChanged: boolean;
  memory: boolean;
  cacheMetrics: boolean;
  mcp: boolean;
  agents: boolean;
  health: boolean;
  apiLatency: boolean;
  /**
   * Percentage at which the context bar turns orange and shows the fire icon. Default 65. Clamped [0,100].
   * Setting this ≤ 50 collapses the yellow zone; the bar jumps green→orange directly at this value.
   * Default lowered from 70 → 65 (issue #138) so the warning fires BEFORE the platform's silent
   * auto-compact threshold (~80% on Claude, ~70% on Qwen).
   */
  contextWarningThreshold: number;
  /**
   * Percentage at which the context bar turns red/blinking and shows the skull icon. Default 78.
   * Clamped [0,100]. Must be > contextWarningThreshold.
   * Default lowered from 85 → 78 (issue #138) to stay below Claude's ~80% auto-compact threshold —
   * users now see the red zone before context is silently compacted.
   */
  contextCriticalThreshold: number;
}

export interface ColorConfig {
  mode: 'auto' | 'named' | '256' | 'truecolor';
}

/** Default thresholds — used as fallback when user-provided values are invalid. */
export const DEFAULT_CONTEXT_WARNING_THRESHOLD = 65;
export const DEFAULT_CONTEXT_CRITICAL_THRESHOLD = 78;

/**
 * Rate-limit quota threshold at which all visual escalations fire together:
 * emoji glyph flips to 🪫, colour escalates to blinkRed, powerline bg switches
 * to branchDirtyBg, and line2 promotes the segment position. All call sites
 * align intentionally — changing one means changing all.
 */
export const QUOTA_CRITICAL = 85;

/**
 * Auto-compact threshold per platform — the % of context window at which
 * the platform automatically compacts the conversation history.
 *
 * - Claude Code: ~80% (hardcoded internally; reserves ~40K tokens for output generation).
 *   Not user-configurable in the main conversation. See anthropics/claude-code#34126.
 * - Qwen Code: 70% by default; user-configurable via
 *   `model.chatCompression.contextPercentageThreshold` in qwen settings.json.
 *   If a Qwen user changed that setting, they should mirror it in lumira's
 *   `contextCriticalThreshold` — the constant below is the platform default only.
 */
export const AUTO_COMPACT_THRESHOLD: Record<Platform, number> = {
  'claude-code': 80,
  'qwen-code': 70,
};

/**
 * Gap (in percentage points) before the auto-compact threshold at which the
 * `nearAutoCompact` warning glyph fires. The glyph appears in the window
 * `[AUTO_COMPACT_THRESHOLD - GAP, AUTO_COMPACT_THRESHOLD)` — i.e., 75-80%
 * on Claude, 65-70% on Qwen. This is an immutable system constant (not the
 * same as the user-configurable `contextWarningThreshold`).
 */
export const AUTO_COMPACT_WARNING_GAP = 5;

export const DEFAULT_DISPLAY: DisplayToggles = {
  model: true,
  branch: true,
  gitChanges: true,
  directory: true,
  contextBar: true,
  contextTokens: true,
  tokens: true,
  cost: true,
  burnRate: true,
  duration: true,
  tokenSpeed: true,
  rateLimits: true,
  paceDelta: true,
  quotaProjection: true,
  tools: true,
  todos: true,
  vim: true,
  effort: true,
  worktree: true,
  agent: true,
  sessionName: true,
  style: true,
  version: true,
  linesChanged: true,
  memory: true,
  cacheMetrics: true,
  mcp: true,
  agents: true,
  health: false,
  apiLatency: true,
  contextWarningThreshold: DEFAULT_CONTEXT_WARNING_THRESHOLD,
  contextCriticalThreshold: DEFAULT_CONTEXT_CRITICAL_THRESHOLD,
};

export const DEFAULT_CONFIG: HudConfig = {
  layout: 'auto',
  gsd: false,
  display: { ...DEFAULT_DISPLAY },
  colors: { mode: 'auto' },
};

// ── Dependency injection ────────────────────────────────────────────

export interface Dependencies {
  readStdin: () => Promise<RawInput>;
  parseGit: (cwd: string) => Promise<GitStatus>;
  parseTranscript: (path: string) => Promise<TranscriptData>;
  getTokenSpeed: (contextWindow: ClaudeCodeInput['context_window']) => number | null;
  getMemoryInfo: () => MemoryInfo | null;
  getGsdInfo: (cwd: string) => GsdInfo | null;
  getMcpInfo: (cwd: string) => McpInfo | null;
  getTermCols: () => number;
  loadConfig?: () => HudConfig;
}

// ── Qwen Code stdin JSON ────────────────────────────────────────────

export interface QwenInput {
  session_id: string;
  version: string;
  model: { display_name: string };
  context_window: {
    context_window_size: number;
    used_percentage: number;
    remaining_percentage: number;
    current_usage: number;
    total_input_tokens: number;
    total_output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  metrics: {
    models: Record<string, {
      api: {
        total_requests: number;
        total_errors: number;
        total_latency_ms: number;
      };
      tokens: {
        prompt: number;
        completion: number;
        total: number;
        cached: number;
        thoughts: number;
      };
    }>;
    files: {
      total_lines_added: number;
      total_lines_removed: number;
    };
  };
  git?: { branch: string };
  vim?: { mode: string };
  workspace?: { current_dir: string };
  // Optional fields shared with ClaudeCodeInput (Qwen does not send these)
  session_name?: string;
  cwd?: string;
  cost?: { total_cost_usd: number; total_duration_ms: number; total_api_duration_ms?: number; total_lines_added?: number; total_lines_removed?: number };
  transcript_path?: string;
  output_style?: { name: string };
  agent?: { name: string };
  worktree?: { name: string };
  rate_limits?: { five_hour?: { used_percentage: number; resets_at?: number }; seven_day?: { used_percentage: number; resets_at?: number } };
  exceeds_200k_tokens?: boolean;
}

/** Union of all supported platform input types */
export type RawInput = ClaudeCodeInput | QwenInput;
