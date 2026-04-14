import { describe, it, expect } from 'vitest';
import { renderLine1 } from '../../src/render/line1.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { EMPTY_GIT, EMPTY_TRANSCRIPT, DEFAULT_CONFIG, DEFAULT_DISPLAY } from '../../src/types.js';
import type { ClaudeCodeInput, GitStatus, RenderContext } from '../../src/types.js';
import { NERD_ICONS } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';

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

function makeCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  const input = (overrides.input ?? baseInput);
  return {
    input, normalized: normalize(input), git: EMPTY_GIT, transcript: EMPTY_TRANSCRIPT,
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
    const input = { ...baseInput, model: { display_name: 'Sonnet 3.7' } };
    const out = stripAnsi(renderLine1(makeCtx({ input }), c));
    expect(out).toContain('Sonnet 3.7');
  });
});
