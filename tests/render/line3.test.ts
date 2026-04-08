import { describe, it, expect } from 'vitest';
import { renderLine3 } from '../../src/render/line3.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import type { ToolEntry, TodoEntry } from '../../src/types.js';

const c = createColors('named');

const completedTool = (name: string): ToolEntry => ({
  id: name, name, status: 'completed', startTime: new Date(), endTime: new Date(),
});

const runningTool = (name: string, target?: string): ToolEntry => ({
  id: name, name, target, status: 'running', startTime: new Date(),
});

const todo = (id: string, content: string, status: 'pending' | 'in_progress' | 'completed'): TodoEntry => ({
  id, content, status,
});

describe('renderLine3', () => {
  it('returns empty string when no tools and no todos', () => {
    expect(renderLine3([], [], c)).toBe('');
  });

  it('shows running tools', () => {
    const out = stripAnsi(renderLine3([runningTool('Bash', 'npm test')], [], c));
    expect(out).toContain('Bash');
    expect(out).toContain('npm test');
  });

  it('shows completed tools with counts', () => {
    const tools = [completedTool('Read'), completedTool('Read'), completedTool('Edit')];
    const out = stripAnsi(renderLine3(tools, [], c));
    expect(out).toContain('Read');
    expect(out).toContain('×2');
    expect(out).toContain('Edit');
  });

  it('excludes TodoWrite from display', () => {
    const tools = [completedTool('TodoWrite'), completedTool('Read')];
    const out = stripAnsi(renderLine3(tools, [], c));
    expect(out).not.toContain('TodoWrite');
    expect(out).toContain('Read');
  });

  it('shows todos progress bar', () => {
    const todos = [
      todo('1', 'Task 1', 'completed'),
      todo('2', 'Task 2', 'in_progress'),
      todo('3', 'Task 3', 'pending'),
    ];
    const out = stripAnsi(renderLine3([], todos, c));
    expect(out).toContain('1/3');
    expect(out).toContain('1'); // in_progress count
  });

  it('shows tools and todos together', () => {
    const tools = [completedTool('Read')];
    const todos = [todo('1', 'Task', 'completed')];
    const out = stripAnsi(renderLine3(tools, todos, c));
    expect(out).toContain('Read');
    expect(out).toContain('1/1');
  });
});
