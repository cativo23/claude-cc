import { truncField } from './text.js';
import { SEP } from './shared.js';
import type { IconSet } from './icons.js';
import type { Colors } from './colors.js';
import type { RenderContext, ToolEntry, TodoEntry } from '../types.js';

const EXCLUDED_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate']);

function buildToolsPart(tools: ToolEntry[], c: Colors, ic: IconSet): string {
  const relevant = tools.filter(t => !EXCLUDED_TOOLS.has(t.name));
  if (relevant.length === 0) return '';

  const parts: string[] = [];

  const running = relevant.filter(t => t.status === 'running').slice(-2);
  for (const tool of running) {
    const target = tool.target ? `: ${truncField(tool.target, 20)}` : '';
    parts.push(c.yellow(`◐ ${tool.name}${target}`));
  }

  const completed = relevant.filter(t => t.status === 'completed');
  const groups = new Map<string, number>();
  for (const tool of completed) {
    groups.set(tool.name, (groups.get(tool.name) ?? 0) + 1);
  }

  const topGroups = Array.from(groups.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  for (const [name, count] of topGroups) {
    const countStr = count > 1 ? ` ×${count}` : '';
    parts.push(c.dim(`${ic.checkmark} ${name}${countStr}`));
  }

  return parts.join(' ');
}

function buildTodosPart(todos: TodoEntry[], c: Colors, ic: IconSet): string {
  if (todos.length === 0) return '';

  const total = todos.length;
  const completed = todos.filter(t => t.status === 'completed').length;
  const inProgress = todos.filter(t => t.status === 'in_progress').length;
  const pending = todos.filter(t => t.status === 'pending').length;

  const SEGMENTS = 10;
  const filledCount = Math.round((completed / total) * SEGMENTS);
  const bar = c.green(ic.barFull.repeat(filledCount)) + c.dim(ic.barEmpty.repeat(SEGMENTS - filledCount));
  let str = `${bar} ${completed}/${total}`;

  if (inProgress > 0) str += ` ${c.yellow(`◐ ${inProgress}`)}`;
  if (pending > 0) str += ` ${c.dim(`○ ${pending}`)}`;

  return str;
}

export function renderLine3(ctx: RenderContext, c: Colors): string {
  const { transcript: { tools, todos }, config: { display }, icons } = ctx;
  const toolsPart = display.tools === false ? '' : buildToolsPart(tools, c, icons);
  const todosPart = display.todos === false ? '' : buildTodosPart(todos, c, icons);

  if (!toolsPart && !todosPart) return '';
  if (!toolsPart) return todosPart;
  if (!todosPart) return toolsPart;
  return toolsPart + SEP + todosPart;
}
