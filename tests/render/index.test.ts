import { describe, it, expect } from 'vitest';
import { render } from '../../src/render/index.js';
import { EMPTY_GIT, EMPTY_TRANSCRIPT, DEFAULT_CONFIG, type RenderContext } from '../../src/types.js';
import { NERD_ICONS, EMOJI_ICONS } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';

function makeCtx(ov: Partial<RenderContext> = {}): RenderContext {
  const rawInput = { model: 'Opus', session_id: 't', context_window: { used_percentage: 50, remaining_percentage: 50 }, cost: { total_cost_usd: 1, total_duration_ms: 60000 }, workspace: { current_dir: '/p' } } as any;
  return { input: normalize(rawInput), git: EMPTY_GIT, transcript: EMPTY_TRANSCRIPT, tokenSpeed: null, memory: null, gsd: null, mcp: null, cols: 120, config: { ...DEFAULT_CONFIG }, icons: NERD_ICONS, ...ov };
}

describe('render', () => {
  it('multi-line at 120 cols', () => { expect(render(makeCtx()).split('\n').length).toBeGreaterThanOrEqual(2); });
  it('singleline when forced', () => { expect(render(makeCtx({ config: { ...DEFAULT_CONFIG, layout: 'singleline' } })).split('\n').length).toBeLessThanOrEqual(2); });
  it('auto-minimal at <70 cols', () => { expect(render(makeCtx({ cols: 60 })).split('\n').length).toBeLessThanOrEqual(2); });
  it('renders with theme config without crashing', () => {
    const out = render(makeCtx({ config: { ...DEFAULT_CONFIG, theme: 'dracula', colors: { mode: 'truecolor' } } }));
    expect(out.length).toBeGreaterThan(0);
  });
  it('renders with emoji icons without crashing', () => {
    const out = render(makeCtx({ icons: EMOJI_ICONS }));
    expect(out.length).toBeGreaterThan(0);
  });
});
