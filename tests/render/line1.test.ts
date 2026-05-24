import { describe, it, expect } from 'vitest';
import { renderLine1 } from '../../src/render/line1.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { EMPTY_GIT, EMPTY_TRANSCRIPT, DEFAULT_CONFIG, DEFAULT_DISPLAY } from '../../src/types.js';
import type { ClaudeCodeInput, GitStatus, RenderContext } from '../../src/types.js';
import { NERD_ICONS } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';
import { displayWidth } from '../../src/render/text.js';

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
});
