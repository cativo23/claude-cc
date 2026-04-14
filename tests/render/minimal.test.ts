import { describe, it, expect } from 'vitest';
import { renderMinimal } from '../../src/render/minimal.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { EMPTY_GIT, EMPTY_TRANSCRIPT, DEFAULT_CONFIG, DEFAULT_DISPLAY } from '../../src/types.js';
import type { ClaudeCodeInput, GitStatus, RenderContext } from '../../src/types.js';
import { NERD_ICONS } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';

const c = createColors('named');

const baseInput: ClaudeCodeInput = {
  model: 'Claude Opus 4',
  session_id: 'test-123',
  context_window: {
    used_percentage: 55,
    remaining_percentage: 45,
    total_input_tokens: 131000,
    total_output_tokens: 25000,
  },
  cost: { total_cost_usd: 1.31, total_duration_ms: 2106000 },
  workspace: { current_dir: '/home/user/project' },
  version: '2.0.0',
};

const git: GitStatus = { branch: 'main', staged: 0, modified: 1, untracked: 0 };

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

describe('renderMinimal', () => {
  it('shows directory', () => {
    const out = stripAnsi(renderMinimal(makeCtx(), c));
    expect(out).toContain('project');
  });

  it('shows branch', () => {
    const out = stripAnsi(renderMinimal(makeCtx({ git }), c));
    expect(out).toContain('main');
  });

  it('shows model', () => {
    const out = stripAnsi(renderMinimal(makeCtx(), c));
    expect(out).toContain('Claude Opus 4');
  });

  it('shows context bar', () => {
    const out = stripAnsi(renderMinimal(makeCtx(), c));
    expect(out).toContain('55%');
  });

  it('shows cost at >=60 cols', () => {
    const out = stripAnsi(renderMinimal(makeCtx({ cols: 80 }), c));
    expect(out).toContain('$1.31');
  });

  it('truncates branch at <60 cols', () => {
    const git2: GitStatus = { branch: 'feature/very-long-branch-name-here', staged: 0, modified: 0, untracked: 0 };
    const out = stripAnsi(renderMinimal(makeCtx({ git: git2, cols: 50 }), c));
    expect(out).not.toContain('feature/very-long-branch-name-here');
  });

  it('appends tools/todos as second line', () => {
    const transcript = {
      ...EMPTY_TRANSCRIPT,
      tools: [{ id: '1', name: 'Read', status: 'completed' as const, startTime: new Date(), endTime: new Date() }],
    };
    const out = renderMinimal(makeCtx({ transcript }), c);
    expect(out.split('\n').length).toBe(2);
  });

  it('returns single line when no tools/todos', () => {
    const out = renderMinimal(makeCtx(), c);
    expect(out.split('\n').length).toBe(1);
  });

  it('hides model when toggled off', () => {
    const out = stripAnsi(renderMinimal(makeCtx({ config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, model: false } } }), c));
    expect(out).not.toContain('Claude Opus 4');
  });

  it('hides branch when toggled off', () => {
    const out = stripAnsi(renderMinimal(makeCtx({ git, config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, branch: false } } }), c));
    expect(out).not.toContain('main');
  });

  it('hides cost at <60 cols', () => {
    const out = stripAnsi(renderMinimal(makeCtx({ cols: 50 }), c));
    expect(out).not.toContain('$1.31');
  });
});
