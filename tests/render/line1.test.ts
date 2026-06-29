import { describe, it, expect } from 'vitest';
import { renderLine1 } from '../../src/render/line1.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { EMPTY_GIT, EMPTY_TRANSCRIPT, DEFAULT_CONFIG, DEFAULT_DISPLAY } from '../../src/types.js';
import type { ClaudeCodeInput, GitStatus, RenderContext } from '../../src/types.js';
import { NERD_ICONS } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';
import { displayWidth } from '../../src/render/text.js';
import { applyPreset } from '../../src/config.js';

const c = createColors('named');

const baseInput: ClaudeCodeInput = {
  model: 'Claude Opus 4',
  session_id: 'test-123',
  context_window: { used_percentage: 50, remaining_percentage: 50 },
  cost: { total_cost_usd: 1.0, total_duration_ms: 60000, total_lines_added: 100, total_lines_removed: 20 },
  workspace: { current_dir: '/home/user/project' },
  version: '2.0.0',
};

const git: GitStatus = { branch: 'main', staged: 1, modified: 2, untracked: 3 };

function makeCtx(overrides: Partial<RenderContext> = {}, inputOverride?: Partial<ClaudeCodeInput>): RenderContext {
  return {
    input: normalize({ ...baseInput, ...inputOverride }), git: EMPTY_GIT, transcript: EMPTY_TRANSCRIPT,
    tokenSpeed: null, memory: null, gsd: null, mcp: null, cols: 120,
    config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } },
    icons: NERD_ICONS,
    ...overrides,
  };
}

describe('renderLine1', () => {
  it('shows model name', () => {
    const out = stripAnsi(renderLine1(makeCtx(), c));
    expect(out).toContain('Claude Opus 4');
  });

  it('shows branch', () => {
    const out = stripAnsi(renderLine1(makeCtx({ git }), c));
    expect(out).toContain('main');
  });

  it('shows git changes', () => {
    const out = stripAnsi(renderLine1(makeCtx({ git }), c));
    expect(out).toContain('+1');
    expect(out).toContain('!2');
    expect(out).toContain('?3');
  });

  it('shows directory', () => {
    const out = stripAnsi(renderLine1(makeCtx(), c));
    expect(out).toContain('project');
  });

  it('shows the repo segment (owner/name) when workspace.repo is present', () => {
    const inputOverride = { workspace: { current_dir: '/x/project', repo: { host: 'github.com', owner: 'cativo23', name: 'lumira' } } };
    const out = stripAnsi(renderLine1(makeCtx({}, inputOverride), c));
    expect(out).toContain('cativo23/lumira');
  });

  it('wraps the repo segment in an OSC 8 hyperlink to the https url', () => {
    const inputOverride = { workspace: { current_dir: '/x/project', repo: { host: 'github.com', owner: 'cativo23', name: 'lumira' } } };
    const out = renderLine1(makeCtx({}, inputOverride), c);
    expect(out).toContain('https://github.com/cativo23/lumira');
  });

  it('hides the repo segment when display.repo is off', () => {
    const inputOverride = { workspace: { current_dir: '/x/project', repo: { host: 'github.com', owner: 'cativo23', name: 'lumira' } } };
    const out = stripAnsi(renderLine1(makeCtx({ config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, repo: false } } }, inputOverride), c));
    expect(out).not.toContain('cativo23/lumira');
  });

  it('renders no repo segment when workspace.repo is absent', () => {
    const out = stripAnsi(renderLine1(makeCtx(), c));
    expect(out).not.toContain('/lumira');
  });

  it('hides model when toggled off', () => {
    const out = stripAnsi(renderLine1(makeCtx({ config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, model: false } } }), c));
    expect(out).not.toContain('Claude Opus 4');
  });

  it('hides branch when toggled off', () => {
    const out = stripAnsi(renderLine1(makeCtx({ git, config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, branch: false } } }), c));
    expect(out).not.toContain('main');
  });

  it('shows active task from todos', () => {
    const transcript = { ...EMPTY_TRANSCRIPT, todos: [{ id: '1', content: 'Fix the bug', status: 'in_progress' as const }] };
    const out = stripAnsi(renderLine1(makeCtx({ transcript }), c));
    expect(out).toContain('Fix the bug');
  });

  it('shows version', () => {
    const out = stripAnsi(renderLine1(makeCtx(), c));
    expect(out).toContain('v2.0.0');
  });

  it('shows lines changed', () => {
    const out = stripAnsi(renderLine1(makeCtx(), c));
    expect(out).toContain('+100');
    expect(out).toContain('-20');
  });

  it('handles object model with display_name', () => {
    const inputOverride = { model: { display_name: 'Sonnet 3.7' } };
    const out = stripAnsi(renderLine1(makeCtx({}, inputOverride), c));
    expect(out).toContain('Sonnet 3.7');
  });

  it('truncates long branch at narrow terminal (cols=59)', () => {
    const longBranch = 'feat/ca-71-some-very-long-branch-description-that-exceeds-limit';
    const out = stripAnsi(renderLine1(makeCtx({ git: { ...git, branch: longBranch }, cols: 59 }), c));
    expect(out).not.toContain(longBranch);
    expect(out).toContain('…');
  });

  it('shows more branch text at wide terminal than at narrow', () => {
    const longBranch = 'feat/ca-71-some-long-description-that-was-truncated-before';
    const narrow = stripAnsi(renderLine1(makeCtx({ git: { ...git, branch: longBranch }, cols: 79 }), c));
    const wide = stripAnsi(renderLine1(makeCtx({ git: { ...git, branch: longBranch }, cols: 120 }), c));
    const branchInNarrow = narrow.match(/feat\/[^\s]*/)?.[0] ?? '';
    const branchInWide = wide.match(/feat\/[^\s]*/)?.[0] ?? '';
    expect(branchInWide.length).toBeGreaterThan(branchInNarrow.length);
  });

  it('does not overflow layout at cols=120 with long model and branch', () => {
    const longBranch = 'feat/ca-71-some-long-description-that-was-truncated-before';
    const out = stripAnsi(renderLine1(makeCtx({ git: { ...git, branch: longBranch }, cols: 120 }), c));
    expect(displayWidth(out)).toBeLessThanOrEqual(120);
  });

  it('shows duration when display.duration is true and durationMs is set', () => {
    const out = stripAnsi(renderLine1(makeCtx(), c));
    // baseInput has total_duration_ms: 60000 → 1m00s
    expect(out).toContain('1m00s');
  });

  it('hides duration when display.duration is false', () => {
    const out = stripAnsi(renderLine1(makeCtx({ config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, duration: false } } }), c));
    expect(out).not.toContain('m00s');
  });

  it('shows memory when provided and display.memory is true', () => {
    const memory = { usedBytes: 8e9, totalBytes: 16e9, percentage: 50 };
    const out = stripAnsi(renderLine1(makeCtx({ memory }), c));
    expect(out).toContain('50%');
    expect(out).toContain('mem');
  });

  it('hides memory when display.memory is false', () => {
    const memory = { usedBytes: 8e9, totalBytes: 16e9, percentage: 50 };
    const out = stripAnsi(renderLine1(makeCtx({ memory, config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, memory: false } } }), c));
    expect(out).not.toContain('mem');
  });

  it('shows tokenSpeed when provided and display.tokenSpeed is true', () => {
    const out = stripAnsi(renderLine1(makeCtx({ tokenSpeed: 142 }), c));
    expect(out).toContain('142');
    expect(out).toContain('tok/s');
  });

  it('hides tokenSpeed when display.tokenSpeed is false', () => {
    const out = stripAnsi(renderLine1(makeCtx({ tokenSpeed: 142, config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, tokenSpeed: false } } }), c));
    expect(out).not.toContain('tok/s');
  });

  describe('cubes (agent name) widget', () => {
    const cube = NERD_ICONS.cubes;

    function withAgents(agents: { id: string; type: string; status: 'running' | 'completed' | 'error' }[]): RenderContext {
      return makeCtx({
        transcript: {
          ...EMPTY_TRANSCRIPT,
          agents: agents.map(a => ({ ...a, startTime: new Date() })),
        },
      });
    }

    it('shows input.agentName when present (subagent session via --agent flag)', () => {
      const out = stripAnsi(renderLine1(makeCtx({}, { agent: { name: 'pepito' } } as Partial<ClaudeCodeInput>), c));
      expect(out).toContain(`${cube} pepito`);
    });

    it('shows the running named subagent type when input.agentName is empty and exactly one named is running', () => {
      const out = stripAnsi(renderLine1(withAgents([{ id: 'a1', type: 'pepito', status: 'running' }]), c));
      expect(out).toContain(`${cube} pepito`);
    });

    it('does not show the cube when only generic agents (general-purpose) are running', () => {
      const out = stripAnsi(renderLine1(withAgents([{ id: 'a1', type: 'general-purpose', status: 'running' }]), c));
      expect(out).not.toContain(cube);
    });

    it('does not show the cube when zero agents are running', () => {
      const out = stripAnsi(renderLine1(withAgents([{ id: 'a1', type: 'pepito', status: 'completed' }]), c));
      expect(out).not.toContain(cube);
    });

    it('does not show the cube when more than one named agent is running (ambiguous)', () => {
      const out = stripAnsi(renderLine1(withAgents([
        { id: 'a1', type: 'pepito', status: 'running' },
        { id: 'a2', type: 'feature-dev:code-reviewer', status: 'running' },
      ]), c));
      expect(out).not.toContain(cube);
    });

    it('input.agentName takes priority over a running named subagent', () => {
      const ctx = withAgents([{ id: 'a1', type: 'pepito', status: 'running' }]);
      ctx.input = { ...ctx.input, agentName: 'jarvis' };
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).toContain(`${cube} jarvis`);
      expect(out).not.toContain('pepito');
    });

    it('hides the cube when display.agent is false even if a named subagent is running', () => {
      const ctx = withAgents([{ id: 'a1', type: 'pepito', status: 'running' }]);
      ctx.config = { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, agent: false } };
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).not.toContain(cube);
    });
  });

  // ── Custom commands (issue #143 phase 3) ─────────────────────────
  describe('custom commands', () => {
    it('renders a single ok command on line 1', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'CI', state: 'ok', line: 1, ansi: false }],
      });
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).toContain('CI');
    });

    it('does not render a command targeting a different line', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'OTHER', state: 'ok', line: 2, ansi: false }],
      });
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).not.toContain('OTHER');
    });

    it('drops hidden state outputs', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'GONE', state: 'hidden', line: 1, ansi: false }],
      });
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).not.toContain('GONE');
    });

    it('renders multiple commands in order', () => {
      const ctx = makeCtx({
        customCommands: [
          { id: 'a', text: 'FIRST', state: 'ok', line: 1, ansi: false },
          { id: 'b', text: 'SECOND', state: 'ok', line: 1, ansi: false },
        ],
      });
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out.indexOf('FIRST')).toBeGreaterThan(-1);
      expect(out.indexOf('SECOND')).toBeGreaterThan(out.indexOf('FIRST'));
    });

    it('applies label prefix', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'a', text: 'green', label: '◆', state: 'ok', line: 1, ansi: false }],
      });
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).toContain('◆ green');
    });

    it('strips embedded ANSI when ansi:false (default)', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'a', text: '\x1b[31mraw\x1b[0m', state: 'ok', line: 1, ansi: false }],
      });
      const out = renderLine1(ctx, c);
      // The fg red escape should not leak through.
      expect(out).not.toMatch(/\x1b\[31mraw/);
      expect(stripAnsi(out)).toContain('raw');
    });

    it('passes ANSI through when ansi:true', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'a', text: '\x1b[31mraw\x1b[0m', state: 'ok', line: 1, ansi: true }],
      });
      const out = renderLine1(ctx, c);
      expect(out).toContain('\x1b[31m');
    });

    it('dims a stale command', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'a', text: 'fading', state: 'stale', line: 1, ansi: false }],
      });
      const out = renderLine1(ctx, c);
      expect(out).toContain('\x1b[2m');
    });

    it('renders error-state text verbatim (parser already remapped)', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'a', text: '?', state: 'error', line: 1, ansi: false }],
      });
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).toContain('?');
    });

    it('no change to output when customCommands is undefined', () => {
      const without = stripAnsi(renderLine1(makeCtx(), c));
      const withEmpty = stripAnsi(renderLine1(makeCtx({ customCommands: [] }), c));
      expect(withEmpty).toBe(without);
    });
  });

  // ── Added dirs badge (issue #129) ────────────────────────────────────
  describe('added dirs badge', () => {
    it('should_not_show_added_dirs_badge_when_display_addedDirs_is_false', () => {
      const ctx = makeCtx(
        { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, addedDirs: false } } },
        { workspace: { current_dir: '/home/user/project', added_dirs: ['/a', '/b'] } },
      );
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).not.toContain('dirs');
    });

    it('should_show_added_dirs_badge_when_count_gt_0_and_display_addedDirs_is_true', () => {
      const ctx = makeCtx(
        { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, addedDirs: true } } },
        { workspace: { current_dir: '/home/user/project', added_dirs: ['/a', '/b', '/c'] } },
      );
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).toContain('+3 dirs');
    });

    it('should_not_show_badge_when_added_dirs_is_empty_array', () => {
      const ctx = makeCtx(
        { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, addedDirs: true } } },
        { workspace: { current_dir: '/home/user/project', added_dirs: [] } },
      );
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).not.toContain('dirs');
    });

    it('should_not_show_badge_when_added_dirs_is_missing_graceful_degrade', () => {
      const ctx = makeCtx(
        { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, addedDirs: true } } },
        { workspace: { current_dir: '/home/user/project' } },
      );
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).not.toContain('dirs');
    });

    it('should_apply_warning_color_to_badge_when_count_gte_5', () => {
      const ctx = makeCtx(
        { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, addedDirs: true } } },
        { workspace: { current_dir: '/home/user/project', added_dirs: ['/1', '/2', '/3', '/4', '/5'] } },
      );
      const raw = renderLine1(ctx, c);
      // orange = 256-color 208 escape
      expect(raw).toContain('\x1b[38;5;208m');
      expect(stripAnsi(raw)).toContain('+5 dirs');
    });

    it('should_format_count_correctly_plus_3_dirs_for_count_3', () => {
      const ctx = makeCtx(
        { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, addedDirs: true } } },
        { workspace: { current_dir: '/home/user/project', added_dirs: ['/x', '/y', '/z'] } },
      );
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).toContain('+3 dirs');
      expect(out).not.toContain('+4 dirs');
    });
  });

  // ── Worktree origin-branch breadcrumb (issue #130) ───────────────────
  describe('worktree breadcrumb', () => {
    it('should_render_breadcrumb_when_original_branch_present_and_differs_from_current', () => {
      const ctx = makeCtx(
        { git: { branch: 'feat/my-feature', staged: 0, modified: 0, untracked: 0 } },
        { worktree: { name: 'feat-wt', original_branch: 'main' } },
      );
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).toContain('↳ main');
    });

    it('should_not_render_breadcrumb_when_original_branch_is_missing', () => {
      const ctx = makeCtx(
        { git: { branch: 'feat/x', staged: 0, modified: 0, untracked: 0 } },
        { worktree: { name: 'feat-wt' } },
      );
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).not.toContain('↳');
    });

    it('should_not_render_breadcrumb_when_original_branch_equals_current_branch', () => {
      const ctx = makeCtx(
        { git: { branch: 'main', staged: 0, modified: 0, untracked: 0 } },
        { worktree: { name: 'wt', original_branch: 'main' } },
      );
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).not.toContain('↳');
    });

    it('should_sanitize_original_branch_string_no_control_chars_no_zero_width_unicode', () => {
      // U+200B (zero-width space) is stripped by sanitizeTermString
      const ctx = makeCtx(
        { git: { branch: 'feat/x', staged: 0, modified: 0, untracked: 0 } },
        { worktree: { name: 'wt', original_branch: 'main​suffix' } },
      );
      const out = stripAnsi(renderLine1(ctx, c));
      // zero-width space stripped → appears as 'mainsuffix'
      expect(out).toContain('↳ mainsuffix');
      expect(out).not.toContain('​');
    });

    it('should_truncate_long_original_branch_names_to_15_chars', () => {
      const longBranch = 'feat/' + 'x'.repeat(50);
      const ctx = makeCtx(
        { git: { branch: 'develop', staged: 0, modified: 0, untracked: 0 } },
        { worktree: { name: 'wt', original_branch: longBranch } },
      );
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).toContain('↳ ');
      expect(out).not.toContain(longBranch);
      expect(out).toContain('…');
    });

    it('should_respect_display_worktreeBreadcrumb_toggle', () => {
      const ctx = makeCtx(
        {
          git: { branch: 'feat/my-feature', staged: 0, modified: 0, untracked: 0 },
          config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, worktreeBreadcrumb: false } },
        },
        { worktree: { name: 'wt', original_branch: 'main' } },
      );
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).not.toContain('↳');
    });

    it('should_not_render_breadcrumb_in_minimal_preset_toggle_defaults_to_false', () => {
      // Exercise the real minimal-preset path: applyPreset must turn the
      // breadcrumb off (DEFAULT_DISPLAY has it ON) so minimal stays clean.
      const config = { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } };
      applyPreset(config, 'minimal');
      expect(config.display.worktreeBreadcrumb).toBe(false);
      const ctx = makeCtx(
        { git: { branch: 'feat/my-feature', staged: 0, modified: 0, untracked: 0 }, config },
        { worktree: { name: 'wt', original_branch: 'main' } },
      );
      const out = stripAnsi(renderLine1(ctx, c));
      expect(out).not.toContain('↳');
    });
  });
});
