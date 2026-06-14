import { truncField } from './text.js';
import { SEP, EXCLUDED_TOOLS, getCustomCommandsForLine, renderCustomCommand } from './shared.js';
function buildToolsPart(tools, c, ic) {
    const relevant = tools.filter(t => !EXCLUDED_TOOLS.has(t.name));
    if (relevant.length === 0)
        return '';
    const parts = [];
    const running = relevant.filter(t => t.status === 'running').slice(-2);
    for (const tool of running) {
        const target = tool.target ? `: ${truncField(tool.target, 14)}` : '';
        parts.push(c.yellow(`◐ ${tool.name}${target}`));
    }
    const completed = relevant.filter(t => t.status === 'completed');
    const groups = new Map();
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
function buildAgentsPart(agents, c, ic) {
    const running = agents.filter(a => a.status === 'running').length;
    if (running < 1)
        return '';
    const label = running === 1 ? '1 agent' : `${running} agents`;
    return c.yellow(`${ic.bolt}${label}`);
}
function buildTodosPart(todos, c, ic) {
    if (todos.length === 0)
        return '';
    const total = todos.length;
    const completed = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    const pending = todos.filter(t => t.status === 'pending').length;
    const SEGMENTS = 10;
    const filledCount = Math.round((completed / total) * SEGMENTS);
    const bar = c.green(ic.barFull.repeat(filledCount)) + c.dim(ic.barEmpty.repeat(SEGMENTS - filledCount));
    let str = `${bar} ${completed}/${total}`;
    if (inProgress > 0)
        str += ` ${c.yellow(`◐ ${inProgress}`)}`;
    if (pending > 0)
        str += ` ${c.dim(`○ ${pending}`)}`;
    return str;
}
export function renderLine3(ctx, c) {
    const { transcript: { tools, todos, agents }, config: { display }, icons } = ctx;
    const toolsPart = display.tools === false ? '' : buildToolsPart(tools, c, icons);
    const agentsPart = display.agents === false ? '' : buildAgentsPart(agents, c, icons);
    const todosPart = display.todos === false ? '' : buildTodosPart(todos, c, icons);
    const parts = [toolsPart, agentsPart, todosPart].filter(Boolean);
    // Custom commands (issue #143 phase 3) — appended after the core line3
    // widgets so they sit at the end of the line and are visible without
    // disrupting the tools/agents/todos cluster.
    for (const out of getCustomCommandsForLine(ctx.customCommands, 3)) {
        const seg = renderCustomCommand(out, c);
        if (seg)
            parts.push(seg);
    }
    return parts.join(SEP);
}
//# sourceMappingURL=line3.js.map