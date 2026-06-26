// ── Claude Code stdin JSON ──────────────────────────────────────────
export const EMPTY_GIT = Object.freeze({
    branch: '',
    staged: 0,
    modified: 0,
    untracked: 0,
});
export const EMPTY_TRANSCRIPT = Object.freeze({
    tools: Object.freeze([]),
    agents: Object.freeze([]),
    todos: Object.freeze([]),
    thinkingEffort: '',
    sessionStart: null,
    compactionCount: 0,
});
/** Hard cap on per-command wall time (ms). */
export const CUSTOM_COMMAND_MAX_TIMEOUT_MS = 2000;
/** Hard cap on captured stdout (bytes). */
export const CUSTOM_COMMAND_MAX_BYTES = 4096;
/** Hard cap on env vars passed to a command. */
export const CUSTOM_COMMAND_MAX_ENV_ENTRIES = 32;
/** Lower bound on refresh interval (ms) to prevent thrashing the renderer. */
export const CUSTOM_COMMAND_MIN_REFRESH_MS = 500;
/** Upper bound on refresh interval (ms) — 24h. Anything larger is almost
 * certainly a typo (e.g. "5000000" meant "5000"). Clamping prevents an
 * effectively-once-per-process command from being accidentally configured. */
export const CUSTOM_COMMAND_MAX_REFRESH_MS = 86_400_000;
/** Valid `line` values for CustomCommand. */
export const CUSTOM_COMMAND_VALID_LINES = [1, 2, 3, 4];
/** Valid `onError` / `onTimeout` values. */
export const CUSTOM_COMMAND_ERROR_BEHAVIORS = ['hide', 'placeholder', 'output', 'stale'];
/** Valid `color` values for CustomCommand. */
export const CUSTOM_COMMAND_COLORS = ['dim', 'green', 'yellow', 'orange', 'red', 'cyan', 'magenta'];
/**
 * Single source of truth for valid powerline style names. Imported by
 * `src/config.ts` (validates JSON config + CLI flags) and
 * `src/commands/themes.ts` (validates `--style=<name>`). Keep in sync with
 * `POWERLINE_STYLES` in `src/render/powerline.ts` — that map's keys
 * MUST match this list.
 */
export const PR_REVIEW_STATES = ['approved', 'pending', 'changes_requested', 'draft'];
export const POWERLINE_STYLE_NAMES = [
    'arrow', 'flame', 'slant', 'round', 'diamond', 'compatible', 'plain', 'auto',
];
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
export const AUTO_COMPACT_THRESHOLD = {
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
export const DEFAULT_DISPLAY = {
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
    addedDirs: true,
    worktreeBreadcrumb: true,
    compactionCount: true,
    pr: true,
    thinking: true,
    contextWarningThreshold: DEFAULT_CONTEXT_WARNING_THRESHOLD,
    contextCriticalThreshold: DEFAULT_CONTEXT_CRITICAL_THRESHOLD,
};
export const DEFAULT_CONFIG = {
    layout: 'auto',
    // GSD on by default, mirroring GSD's own always-on statusline. Self-gates to
    // nothing when there's no .planning/STATE.md and no update-check cache, so
    // non-GSD users see no extra line and pay only a few cheap existsSync checks.
    // Minimal/singleline returns early (renderMinimal) and never reaches line 4.
    gsd: true,
    display: { ...DEFAULT_DISPLAY },
    colors: { mode: 'auto' },
    customCommands: { enabled: false, commands: [] },
};
//# sourceMappingURL=types.js.map