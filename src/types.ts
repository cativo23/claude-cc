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
    current_usage?: number | { output_tokens: number };
    total_input_tokens?: number;
    total_output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  cost?: {
    total_cost_usd: number;
    total_duration_ms: number;
    total_lines_added?: number;
    total_lines_removed?: number;
  };
  metrics?: {
    models?: Record<string, unknown>;
    files?: { total_lines_added?: number; total_lines_removed?: number };
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

export const EMPTY_GIT: GitStatus = {
  branch: '',
  staged: 0,
  modified: 0,
  untracked: 0,
};

export interface TranscriptData {
  tools: ToolEntry[];
  agents: AgentEntry[];
  todos: TodoEntry[];
  thinkingEffort: ThinkingEffort;
  sessionStart: Date | null;
}

export const EMPTY_TRANSCRIPT: TranscriptData = {
  tools: [],
  agents: [],
  todos: [],
  thinkingEffort: '',
  sessionStart: null,
};

export type ThinkingEffort = 'low' | 'medium' | 'high' | 'max' | '';

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

export interface RenderContext {
  input: RawInput;
  normalized: import('./normalize.js').NormalizedInput;
  git: GitStatus;
  transcript: TranscriptData;
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
  preset?: 'full' | 'balanced' | 'minimal' | 'qwen';
  theme?: string;
  icons?: 'nerd' | 'emoji' | 'none';
}

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
}

export interface ColorConfig {
  mode: 'auto' | 'named' | '256' | 'truecolor';
}

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
  getGsdInfo: (session: string) => GsdInfo | null;
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
  cost?: { total_cost_usd: number; total_duration_ms: number; total_lines_added?: number; total_lines_removed?: number };
  transcript_path?: string;
  output_style?: { name: string };
  agent?: { name: string };
  worktree?: { name: string };
  rate_limits?: { five_hour?: { used_percentage: number; resets_at?: number }; seven_day?: { used_percentage: number; resets_at?: number } };
  exceeds_200k_tokens?: boolean;
}

/** Detect if the input came from Qwen Code vs Claude Code.
 *  Qwen sends metrics.models with api sub-objects; Claude may send metrics.models as Record<string, unknown>. */
export function isQwenInput(input: ClaudeCodeInput & { metrics?: unknown }): input is QwenInput {
  if (!input.metrics || typeof input.metrics !== 'object' || !('models' in input.metrics)) return false;
  const models = (input.metrics as { models?: Record<string, unknown> }).models;
  if (!models || typeof models !== 'object') return false;
  const first = Object.values(models)[0];
  return first != null && typeof first === 'object' && 'api' in first;
}

/** Union of all supported platform input types */
export type RawInput = ClaudeCodeInput | QwenInput;
