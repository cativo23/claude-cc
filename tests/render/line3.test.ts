import { describe, it, expect } from 'vitest';
import { renderLine3 } from '../../src/render/line3.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { EMPTY_GIT, EMPTY_TRANSCRIPT, DEFAULT_CONFIG, DEFAULT_DISPLAY } from '../../src/types.js';
import type { ClaudeCodeInput, ToolEntry, TodoEntry, AgentEntry, RenderContext } from '../../src/types.js';
import { NERD_ICONS } from '../../src/render/icons.js';
import { normalize } from '../../src/normalize.js';

const c = createColors('named');

const baseInput: ClaudeCodeInput = {
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
    input: normalize(baseInput), git: EMPTY_GIT, transcript: EMPTY_TRANSCRIPT,
    tokenSpeed: null, memory: null, gsd: null, mcp: null, cols: 120,
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

const runningAgent = (id: string): AgentEntry => ({
  id, type: 'general-purpose', status: 'running', startTime: new Date(),
});

const completedAgent = (id: string): AgentEntry => ({
  id, type: 'general-purpose', status: 'completed', startTime: new Date(), endTime: new Date(),
});

describe('renderLine3 — agent count', () => {
  it('returns empty when no agents running', () => {
    const transcript = { ...EMPTY_TRANSCRIPT, agents: [completedAgent('a1')] };
    expect(renderLine3(makeCtx({ transcript }), c)).toBe('');
  });

  it('shows "1 agent" (singular) when exactly one running', () => {
    const transcript = { ...EMPTY_TRANSCRIPT, agents: [runningAgent('a1')] };
    const out = stripAnsi(renderLine3(makeCtx({ transcript }), c));
    expect(out).toContain('1 agent');
    expect(out).not.toContain('agents');
  });

  it('shows "N agents" (plural) when multiple running', () => {
    const transcript = { ...EMPTY_TRANSCRIPT, agents: [runningAgent('a1'), runningAgent('a2'), runningAgent('a3')] };
    const out = stripAnsi(renderLine3(makeCtx({ transcript }), c));
    expect(out).toContain('3 agents');
  });

  it('only counts running agents, not completed ones', () => {
    const transcript = { ...EMPTY_TRANSCRIPT, agents: [runningAgent('a1'), completedAgent('a2'), completedAgent('a3')] };
    const out = stripAnsi(renderLine3(makeCtx({ transcript }), c));
    expect(out).toContain('1 agent');
    expect(out).not.toContain('agents');
  });

  it('hides agent count when display.agents is false', () => {
    const transcript = { ...EMPTY_TRANSCRIPT, agents: [runningAgent('a1'), runningAgent('a2')] };
    const config = { ...DEFAULT_CONFIG, display: { ...DEFAULT_DISPLAY, agents: false } };
    const out = stripAnsi(renderLine3(makeCtx({ transcript, config }), c));
    expect(out).not.toContain('agent');
  });

  // ── Custom commands (issue #143 phase 3) ─────────────────────────
  describe('custom commands', () => {
    it('renders a single ok command on line 3', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'CUSTOM3', state: 'ok', line: 3, ansi: false }],
      });
      const out = stripAnsi(renderLine3(ctx, c));
      expect(out).toContain('CUSTOM3');
    });

    it('does not render commands for other lines', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'OTHER', state: 'ok', line: 2, ansi: false }],
      });
      const out = stripAnsi(renderLine3(ctx, c));
      expect(out).not.toContain('OTHER');
    });

    it('drops hidden state outputs', () => {
      const ctx = makeCtx({
        customCommands: [{ id: 'foo', text: 'GONE', state: 'hidden', line: 3, ansi: false }],
      });
      const out = stripAnsi(renderLine3(ctx, c));
      expect(out).not.toContain('GONE');
    });

    it('coexists with line3 core widgets (tools/todos)', () => {
      const transcript = { ...EMPTY_TRANSCRIPT, tools: [runningTool('Bash')] };
      const ctx = makeCtx({
        transcript,
        customCommands: [{ id: 'foo', text: 'MINE', state: 'ok', line: 3, ansi: false }],
      });
      const out = stripAnsi(renderLine3(ctx, c));
      expect(out).toContain('Bash');
      expect(out).toContain('MINE');
    });
  });
});
