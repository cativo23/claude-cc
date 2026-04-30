import { render as defaultRender } from '../render/index.js';
import { resolveIcons } from '../render/icons.js';
import { normalize } from '../normalize.js';
import { applyPreset } from '../config.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_DISPLAY,
  EMPTY_GIT,
  EMPTY_TRANSCRIPT,
  type HudConfig,
  type RenderContext,
} from '../types.js';
import type { ColorMode } from '../render/colors.js';

export interface PreviewOpts {
  preset: NonNullable<HudConfig['preset']>;
  theme?: string;
  icons: 'nerd' | 'emoji' | 'none';
  colorMode?: ColorMode;
}

export interface BuildPreviewDeps {
  render?: (ctx: RenderContext) => string;
}

function buildMockContext(opts: PreviewOpts): RenderContext {
  // Build a fresh HudConfig and run it through `applyPreset` so the wizard
  // preview matches what users actually get when they pick a preset. The
  // earlier shortcut only mirrored `layout`, leaving the display toggles
  // at their defaults — `full` and `balanced` then rendered identically
  // because both had every segment enabled.
  const config: HudConfig = {
    ...DEFAULT_CONFIG,
    icons: opts.icons,
    theme: opts.theme,
    display: { ...DEFAULT_DISPLAY },
    colors: { mode: opts.colorMode ?? 'truecolor' },
  };
  applyPreset(config, opts.preset);

  // Build a realistic raw Claude Code input that normalize() can consume.
  // Fill every field that renderers access via ctx.input.* or ctx.input.raw.*
  // Placeholder values below (paths, branch names) are intentional — used only for wizard preview rendering.
  const rawInput = {
    model: 'Claude Sonnet 4.6',
    session_id: 'preview-session',
    session_name: 'install-wizard preview',
    cwd: '/home/carlos/projects/lumira',
    context_window: {
      context_window_size: 200000,
      used_percentage: 42,
      remaining_percentage: 58,
      current_usage: 84000,
      total_input_tokens: 12000,
      total_output_tokens: 1800,
      cache_read_input_tokens: 3500,
      cache_creation_input_tokens: 0,
    },
    cost: {
      total_cost_usd: 0.42,
      total_duration_ms: 185000,
      total_lines_added: 47,
      total_lines_removed: 12,
    },
    version: '1.2.3',
    output_style: { name: 'auto' },
    vim: undefined,
    agent: undefined,
    worktree: undefined,
    rate_limits: {
      five_hour: { used_percentage: 65, resets_at: Math.floor(Date.now() / 1000) + 3600 },
      seven_day: { used_percentage: 30 },
    },
    exceeds_200k_tokens: false,
  };

  const input = normalize(rawInput);

  const git = {
    ...EMPTY_GIT,
    branch: 'main',
    staged: 2,
    modified: 3,
    untracked: 1,
  };

  const transcript = {
    ...EMPTY_TRANSCRIPT,
    tools: [
      {
        id: '1',
        name: 'Read',
        target: 'src/types.ts',
        status: 'completed' as const,
        startTime: new Date(),
        endTime: new Date(),
      },
      {
        id: '2',
        name: 'Edit',
        target: 'src/tui/preview.ts',
        status: 'completed' as const,
        startTime: new Date(),
        endTime: new Date(),
      },
    ],
    todos: [
      { id: '1', content: 'Implement preview generator', status: 'completed' as const },
      { id: '2', content: 'Write tests', status: 'in_progress' as const },
    ],
    thinkingEffort: '' as const,
    sessionStart: new Date(Date.now() - 185000),
  };

  return {
    input,
    git,
    transcript,
    tokenSpeed: 45,
    memory: { usedBytes: 512 * 1024 * 1024, totalBytes: 16 * 1024 * 1024 * 1024, percentage: 3 },
    gsd: null,
    mcp: null,
    cols: 120,
    config,
    icons: resolveIcons(opts.icons),
  };
}

export function buildPreview(opts: PreviewOpts, deps: BuildPreviewDeps = {}): string {
  const render = deps.render ?? defaultRender;
  try {
    const ctx = buildMockContext(opts);
    return render(ctx);
  } catch {
    return '(preview unavailable)';
  }
}
