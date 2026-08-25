import { describe, it, expect } from 'vitest';
import { renderLine2 } from '../../src/render/line2.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { EMPTY_GIT, EMPTY_TRANSCRIPT, DEFAULT_CONFIG, DEFAULT_DISPLAY } from '../../src/types.js';
import type { ClaudeCodeInput, RenderContext } from '../../src/types.js';
import { NERD_ICONS } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';

const c = createColors('named');

const baseInput: ClaudeCodeInput = {
  model: 'Claude Sonnet 4.6',
  session_id: 'test-123',
  context_window: { used_percentage: 30, remaining_percentage: 70, total_input_tokens: 50000, total_output_tokens: 5000 },
  cost: { total_cost_usd: 0.5, total_duration_ms: 60000 },
  workspace: { current_dir: '/home/user/project' },
};

function makeCtx(inputOverrides: Partial<ClaudeCodeInput> = {}, ctxOverrides: Partial<RenderContext> = {}): RenderContext {
  return {
    input: normalize({ ...baseInput, ...inputOverrides }),
    git: EMPTY_GIT, transcript: EMPTY_TRANSCRIPT,
    tokenSpeed: null, memory: null, gsd: null, mcp: null, cols: 120,
    config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } },
    icons: NERD_ICONS,
    ...ctxOverrides,
  };
}

describe('PR widget in line2', () => {
  it('toggle off hides widget', () => {
    const ctx = makeCtx(
      { pr: { number: 174, url: 'https://github.com/org/repo/pull/174', review_state: 'approved' } },
      { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, pr: false } } },
    );
    const output = stripAnsi(renderLine2(ctx, c));
    expect(output).not.toContain('#174');
  });

  it('PR with url renders hyperlink and number', () => {
    process.env['FORCE_HYPERLINK'] = '1';
    const ctx = makeCtx({
      pr: { number: 174, url: 'https://github.com/org/repo/pull/174', review_state: 'approved' },
    });
    const output = renderLine2(ctx, c);
    delete process.env['FORCE_HYPERLINK'];
    expect(output).toContain('\x1b]8;;');
    expect(stripAnsi(output)).toContain('#174');
  });

  it('PR without url: no hyperlink, number visible', () => {
    const ctx = makeCtx({
      pr: { number: 174, review_state: 'approved' },
    });
    const output = renderLine2(ctx, c);
    expect(output).not.toContain('\x1b]8;;');
    expect(stripAnsi(output)).toContain('#174');
  });

  it('GitLab merge request renders with ! prefix instead of #', () => {
    const ctx = makeCtx({
      pr: { number: 42, url: 'https://gitlab.com/org/repo/-/merge_requests/42', review_state: 'approved' },
    });
    const output = stripAnsi(renderLine2(ctx, c));
    expect(output).toContain('!42');
    expect(output).not.toContain('#42');
  });
});
