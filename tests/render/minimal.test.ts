import { describe, it, expect } from 'vitest';
import { renderMinimal } from '../../src/render/minimal.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { EMPTY_GIT, EMPTY_TRANSCRIPT, DEFAULT_DISPLAY } from '../../src/types.js';
import type { ClaudeCodeInput, GitStatus } from '../../src/types.js';

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

describe('renderMinimal', () => {
  it('shows directory', () => {
    const out = stripAnsi(renderMinimal(baseInput, EMPTY_GIT, EMPTY_TRANSCRIPT, null, null, c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('project');
  });

  it('shows branch', () => {
    const out = stripAnsi(renderMinimal(baseInput, git, EMPTY_TRANSCRIPT, null, null, c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('main');
  });

  it('shows model', () => {
    const out = stripAnsi(renderMinimal(baseInput, EMPTY_GIT, EMPTY_TRANSCRIPT, null, null, c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('Claude Opus 4');
  });

  it('shows context bar', () => {
    const out = stripAnsi(renderMinimal(baseInput, EMPTY_GIT, EMPTY_TRANSCRIPT, null, null, c, DEFAULT_DISPLAY, 120));
    expect(out).toContain('55%');
  });

  it('shows cost at >=60 cols', () => {
    const out = stripAnsi(renderMinimal(baseInput, EMPTY_GIT, EMPTY_TRANSCRIPT, null, null, c, DEFAULT_DISPLAY, 80));
    expect(out).toContain('$1.31');
  });

  it('truncates branch at <60 cols', () => {
    const git2: GitStatus = { branch: 'feature/very-long-branch-name-here', staged: 0, modified: 0, untracked: 0 };
    const out = stripAnsi(renderMinimal(baseInput, git2, EMPTY_TRANSCRIPT, null, null, c, DEFAULT_DISPLAY, 50));
    // Branch should be truncated to 12 chars
    expect(out).not.toContain('feature/very-long-branch-name-here');
  });

  it('appends tools/todos as second line', () => {
    const transcript = {
      ...EMPTY_TRANSCRIPT,
      tools: [{ id: '1', name: 'Read', status: 'completed' as const, startTime: new Date(), endTime: new Date() }],
    };
    const out = renderMinimal(baseInput, EMPTY_GIT, transcript, null, null, c, DEFAULT_DISPLAY, 120);
    expect(out.split('\n').length).toBe(2);
  });

  it('returns single line when no tools/todos', () => {
    const out = renderMinimal(baseInput, EMPTY_GIT, EMPTY_TRANSCRIPT, null, null, c, DEFAULT_DISPLAY, 120);
    expect(out.split('\n').length).toBe(1);
  });
});
