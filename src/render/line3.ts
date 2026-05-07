import { truncField } from './text.js';
import { SEP, EXCLUDED_TOOLS } from './shared.js';
import type { IconSet } from './icons.js';
import type { Colors } from './colors.js';
import type { RenderContext, ToolEntry, TodoEntry } from '../types.js';

function buildToolsPart(tools: ToolEntry[], c: Colors, ic: IconSet): string {
  const relevant = tools.filter(t => !EXCLUDED_TOOLS.has(t.name));
  if (relevant.length === 0) return '';

  const parts: string[] = [];

  const running = relevant.filter(t => t.status === 'running').slice(-2);
  for (const tool of running) {
    const target = tool.target ? `: ${truncField(tool.target, 14)}` : '';
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

function buildAgentsPart(agents: import('../types.js').AgentEntry[], c: Colors, ic: IconSet): string {
  const running = agents.filter(a => a.status === 'running').length;
  if (running < 1) return '';
  const label = running === 1 ? '1 agent' : `${running} agents`;
  return c.yellow(`${ic.bolt}${label}`);
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
  const { transcript: { tools, todos, agents }, config: { display }, icons } = ctx;
  const toolsPart = display.tools === false ? '' : buildToolsPart(tools, c, icons);
  const agentsPart = display.agents === false ? '' : buildAgentsPart(agents, c, icons);
  const todosPart = display.todos === false ? '' : buildTodosPart(todos, c, icons);

  const parts = [toolsPart, agentsPart, todosPart].filter(Boolean);
  return parts.join(SEP);
}
