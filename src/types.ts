// ── Claude Code stdin JSON ──────────────────────────────────────────

export interface ClaudeCodeInput {
  model: string | { display_name: string };
  session_id: string;
  session_name?: string;
  cwd?: string;
  workspace?: { current_dir: string };
  context_window: {
    used_percentage: number;
    remaining_percentage: number;
    total_input_tokens?: number;
    total_output_tokens?: number;
    current_usage?: { output_tokens: number };
  };
  cost: {
    total_cost_usd: number;
    total_duration_ms: number;
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

// ── Render context ──────────────────────────────────────────────────

export interface RenderContext {
  input: ClaudeCodeInput;
  git: GitStatus;
  transcript: TranscriptData;
  tokenSpeed: number | null;
  memory: MemoryInfo | null;
  gsd: GsdInfo | null;
  cols: number;
  config: HudConfig;
}

// ── Config ──────────────────────────────────────────────────────────

export interface HudConfig {
  layout: 'full' | 'minimal' | 'auto';
  gsd: boolean;
  display: DisplayToggles;
  colors: ColorConfig;
  preset?: 'full' | 'balanced' | 'minimal';
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
};

export const DEFAULT_CONFIG: HudConfig = {
  layout: 'auto',
  gsd: false,
  display: { ...DEFAULT_DISPLAY },
  colors: { mode: 'auto' },
};

// ── Dependency injection ────────────────────────────────────────────

export interface Dependencies {
  readStdin: () => Promise<ClaudeCodeInput>;
  parseGit: (cwd: string) => Promise<GitStatus>;
  parseTranscript: (path: string) => Promise<TranscriptData>;
  getTokenSpeed: (contextWindow: ClaudeCodeInput['context_window']) => number | null;
  getMemoryInfo: () => MemoryInfo | null;
  getGsdInfo: (session: string) => GsdInfo | null;
  getTermCols: () => number;
  loadConfig?: () => HudConfig;
}
