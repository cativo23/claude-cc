import { describe, it, expect } from 'vitest';
import { renderLine3 } from '../../src/render/line3.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { EMPTY_GIT, EMPTY_TRANSCRIPT, DEFAULT_CONFIG, DEFAULT_DISPLAY } from '../../src/types.js';
import type { ToolEntry, TodoEntry, RenderContext } from '../../src/types.js';
import { NERD_ICONS } from '../../src/render/icons.js';

const c = createColors('named');

const baseInput = {
  model: 'Claude Opus 4',
  session_id: 'test-123',
  context_window: { used_percentage: 50, remaining_percentage: 50 },
  cost: { total_cost_usd: 1.0, total_duration_ms: 60000 },
  workspace: { current_dir: '/home/user/project' },
};

const completedTool = (name: string): ToolEntry => ({
  id: name, name, status: 'completed', startTime: new Date(), endTime: new Date(),
});

const runningTool = (name: string, target?: string): ToolEntry => ({
  id: name, name, target, status: 'running', startTime: new Date(),
});

const todo = (id: string, content: string, status: 'pending' | 'in_progress' | 'completed'): TodoEntry => ({
  id, content, status,
});

function makeCtx(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    input: baseInput, git: EMPTY_GIT, transcript: EMPTY_TRANSCRIPT,
    tokenSpeed: null, memory: null, gsd: null, cols: 120,
    config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY } },
    icons: NERD_ICONS,
    ...overrides,
  };
}

describe('renderLine3', () => {
  it('returns empty string when no tools and no todos', () => {
    expect(renderLine3(makeCtx(), c)).toBe('');
  });

  it('shows running tools', () => {
    const transcript = { ...EMPTY_TRANSCRIPT, tools: [runningTool('Bash', 'npm test')] };
    const out = stripAnsi(renderLine3(makeCtx({ transcript }), c));
    expect(out).toContain('Bash');
    expect(out).toContain('npm test');
  });

  it('shows completed tools with counts', () => {
    const tools = [completedTool('Read'), completedTool('Read'), completedTool('Edit')];
    const transcript = { ...EMPTY_TRANSCRIPT, tools };
    const out = stripAnsi(renderLine3(makeCtx({ transcript }), c));
    expect(out).toContain('Read');
    expect(out).toContain('×2');
    expect(out).toContain('Edit');
  });

  it('excludes TodoWrite from display', () => {
    const tools = [completedTool('TodoWrite'), completedTool('Read')];
    const transcript = { ...EMPTY_TRANSCRIPT, tools };
    const out = stripAnsi(renderLine3(makeCtx({ transcript }), c));
    expect(out).not.toContain('TodoWrite');
    expect(out).toContain('Read');
  });

  it('shows todos progress bar', () => {
    const todos = [
      todo('1', 'Task 1', 'completed'),
      todo('2', 'Task 2', 'in_progress'),
      todo('3', 'Task 3', 'pending'),
    ];
    const transcript = { ...EMPTY_TRANSCRIPT, todos };
    const out = stripAnsi(renderLine3(makeCtx({ transcript }), c));
    expect(out).toContain('1/3');
    expect(out).toContain('1'); // in_progress count
  });

  it('shows tools and todos together', () => {
    const tools = [completedTool('Read')];
    const todos = [todo('1', 'Task', 'completed')];
    const transcript = { ...EMPTY_TRANSCRIPT, tools, todos };
    const out = stripAnsi(renderLine3(makeCtx({ transcript }), c));
    expect(out).toContain('Read');
    expect(out).toContain('1/1');
  });

  it('hides tools when display.tools is false', () => {
    const tools = [completedTool('Read')];
    const todos = [todo('1', 'Task', 'completed')];
    const transcript = { ...EMPTY_TRANSCRIPT, tools, todos };
    const out = stripAnsi(renderLine3(makeCtx({ transcript, config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, tools: false } } }), c));
    expect(out).not.toContain('Read');
    expect(out).toContain('1/1');
  });

  it('hides todos when display.todos is false', () => {
    const tools = [completedTool('Read')];
    const todos = [todo('1', 'Task', 'completed')];
    const transcript = { ...EMPTY_TRANSCRIPT, tools, todos };
    const out = stripAnsi(renderLine3(makeCtx({ transcript, config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, todos: false } } }), c));
    expect(out).toContain('Read');
    expect(out).not.toContain('1/1');
  });

  it('returns empty when both toggles are false', () => {
    const tools = [completedTool('Read')];
    const todos = [todo('1', 'Task', 'completed')];
    const transcript = { ...EMPTY_TRANSCRIPT, tools, todos };
    expect(renderLine3(makeCtx({ transcript, config: { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, tools: false, todos: false } } }), c)).toBe('');
  });
});
