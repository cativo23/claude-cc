import { describe, it, expect } from 'vitest';
import { renderPowerlineLine2 } from '../../src/render/powerline-line2.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { resolveIcons } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';
import { DEFAULT_CONFIG, DEFAULT_DISPLAY, EMPTY_GIT, EMPTY_TRANSCRIPT } from '../../src/types.js';
import type { RenderContext } from '../../src/types.js';

const c = createColors('truecolor', null);

function makeCtx(inputOverrides = {}, ctxOverrides: Partial<RenderContext> = {}): RenderContext {
  const rawInput = {
    model: 'Claude Sonnet 4.6',
    session_id: 'test',
    context_window: { used_percentage: 30, remaining_percentage: 70, total_input_tokens: 50000, total_output_tokens: 5000 },
    cost: { total_cost_usd: 0.5, total_duration_ms: 60000 },
    workspace: { current_dir: '/home/user/project' },
    ...inputOverrides,
  };
  return {
    input: normalize(rawInput),
    git: { ...EMPTY_GIT },
    transcript: { ...EMPTY_TRANSCRIPT },
    tokenSpeed: null, memory: null, gsd: null, mcp: null,
    cols: 120,
    config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } },
    icons: resolveIcons('nerd'),
    ...ctxOverrides,
  };
}

describe('PR widget — powerline line2', () => {
  it('toggle off hides widget', () => {
    const ctx = makeCtx(
      { pr: { number: 174, url: 'https://github.com/org/repo/pull/174', review_state: 'approved' } },
      { config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, pr: false } } },
    );
    const out = renderPowerlineLine2(ctx, 'truecolor', null, c);
    expect(stripAnsi(out)).not.toContain('#174');
  });

  it('PR present renders with truecolor bg and number', () => {
    const ctx = makeCtx({ pr: { number: 174, review_state: 'approved' } });
    const out = renderPowerlineLine2(ctx, 'truecolor', null, c);
    expect(out).toContain('\x1b[48;2;');
    expect(stripAnsi(out)).toContain('#174');
  });

  it('GitLab merge request renders with ! prefix instead of #', () => {
    const ctx = makeCtx({ pr: { number: 42, url: 'https://gitlab.com/org/repo/-/merge_requests/42', review_state: 'approved' } });
    const out = renderPowerlineLine2(ctx, 'truecolor', null, c);
    const stripped = stripAnsi(out);
    expect(stripped).toContain('!42');
    expect(stripped).not.toContain('#42');
  });
});
