import { describe, it, expect } from 'vitest';
import { renderLine4 } from '../../src/render/line4.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { EMPTY_GIT, EMPTY_TRANSCRIPT, DEFAULT_CONFIG, DEFAULT_DISPLAY } from '../../src/types.js';
import type { GsdInfo, RenderContext } from '../../src/types.js';
import { NERD_ICONS } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';

const c = createColors('named');

const baseInput = {
  model: 'Claude Opus 4',
  session_id: 'test-123',
  context_window: { used_percentage: 50, remaining_percentage: 50 },
  cost: { total_cost_usd: 1.0, total_duration_ms: 60000 },
  workspace: { current_dir: '/home/user/project' },
};

function makeCtx(gsd: GsdInfo | null): RenderContext {
  return {
    input: baseInput, normalized: normalize(baseInput as import('../../src/types.js').RawInput), git: EMPTY_GIT, transcript: EMPTY_TRANSCRIPT,
    tokenSpeed: null, memory: null, gsd, mcp: null, cols: 120,
    config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } },
    icons: NERD_ICONS,
  };
}

describe('renderLine4', () => {
  it('returns empty string when gsd is null', () => {
    expect(renderLine4(makeCtx(null), c)).toBe('');
  });

  it('returns empty string when no task and no update', () => {
    expect(renderLine4(makeCtx({ currentTask: undefined, updateAvailable: false }), c)).toBe('');
  });

  it('shows current task', () => {
    const out = stripAnsi(renderLine4(makeCtx({ currentTask: 'Fix critical bug' }), c));
    expect(out).toContain('GSD');
    expect(out).toContain('Fix critical bug');
  });

  it('shows update available warning', () => {
    const out = stripAnsi(renderLine4(makeCtx({ updateAvailable: true }), c));
    expect(out).toContain('GSD update available');
  });

  it('shows both task and update', () => {
    const out = stripAnsi(renderLine4(makeCtx({ currentTask: 'My task', updateAvailable: true }), c));
    expect(out).toContain('My task');
    expect(out).toContain('GSD update available');
  });
});
