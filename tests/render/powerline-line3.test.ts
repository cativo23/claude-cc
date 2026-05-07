import { describe, it, expect } from 'vitest';
import { renderPowerlineLine3 } from '../../src/render/powerline-line3.js';
import { stripAnsi } from '../../src/render/colors.js';
import { resolveIcons } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';
import { DEFAULT_CONFIG, DEFAULT_DISPLAY, EMPTY_GIT, EMPTY_TRANSCRIPT } from '../../src/types.js';
import type { RenderContext } from '../../src/types.js';

function makeCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  const rawInput = {
    model: 'Claude Sonnet 4.6',
    session_id: 'test',
    context_window: { used_percentage: 42, remaining_percentage: 58 },
    cost: { total_cost_usd: 0.42, total_duration_ms: 185000 },
  };
  return {
    input: normalize(rawInput),
    git: { ...EMPTY_GIT },
    transcript: { ...EMPTY_TRANSCRIPT },
    tokenSpeed: null,
    memory: null,
    gsd: null,
    mcp: null,
    cols: 120,
    config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } },
    icons: resolveIcons('nerd'),
    ...overrides,
  };
}

describe('renderPowerlineLine3', () => {
  it('returns empty string when no tools or todos', () => {
    const ctx = makeCtx();
    expect(renderPowerlineLine3(ctx, 'truecolor', null)).toBe('');
  });

  it('renders running tool segment', () => {
    const ctx = makeCtx({
      transcript: {
        ...EMPTY_TRANSCRIPT,
        tools: [{ id: '1', name: 'Read', target: '/src/index.ts', status: 'running', startTime: new Date() }],
      },
    });
    const out = stripAnsi(renderPowerlineLine3(ctx, 'truecolor', null));
    expect(out).toContain('Read');
    expect(out).toContain('◐');
  });

  it('renders todos progress segment', () => {
    const ctx = makeCtx({
      transcript: {
        ...EMPTY_TRANSCRIPT,
        todos: [
          { id: '1', content: 'Task A', status: 'completed' },
          { id: '2', content: 'Task B', status: 'in_progress' },
          { id: '3', content: 'Task C', status: 'pending' },
        ],
      },
    });
    const out = stripAnsi(renderPowerlineLine3(ctx, 'truecolor', null));
    expect(out).toContain('1/3');
  });

  it('renders both tools and todos segments', () => {
    const ctx = makeCtx({
      transcript: {
        ...EMPTY_TRANSCRIPT,
        tools: [{ id: '1', name: 'Edit', status: 'completed', startTime: new Date(), endTime: new Date() }],
        todos: [{ id: '1', content: 'Task', status: 'completed' }],
      },
    });
    const out = renderPowerlineLine3(ctx, 'truecolor', null);
    const plain = stripAnsi(out);
    expect(plain).toContain('Edit'); // tool name segment rendered
    expect(plain).toContain('1/1'); // todo progress segment rendered
    expect(out.endsWith('\x1b[0m')).toBe(true);
  });

  it('shows completed tools alongside running tools', () => {
    const ctx = makeCtx({
      transcript: {
        ...EMPTY_TRANSCRIPT,
        tools: [
          { id: '1', name: 'Read', status: 'running', startTime: new Date() },
          { id: '2', name: 'Edit', status: 'completed', startTime: new Date(), endTime: new Date() },
        ],
      },
    });
    const plain = stripAnsi(renderPowerlineLine3(ctx, 'truecolor', null));
    expect(plain).toContain('Read');   // running tool shown
    expect(plain).toContain('Edit');   // completed tool also shown
    expect(plain).toContain('◐');      // running indicator
  });

  it('shows pending todo count (○ N) when pending todos exist', () => {
    const ctx = makeCtx({
      transcript: {
        ...EMPTY_TRANSCRIPT,
        todos: [
          { id: '1', content: 'Done', status: 'completed' },
          { id: '2', content: 'Pending A', status: 'pending' },
          { id: '3', content: 'Pending B', status: 'pending' },
        ],
      },
    });
    const plain = stripAnsi(renderPowerlineLine3(ctx, 'truecolor', null));
    expect(plain).toContain('○ 2'); // pending count
  });
});
