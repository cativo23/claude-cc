import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import type { TranscriptData, ToolEntry, AgentEntry, TodoEntry, TodoStatus, ThinkingEffort } from '../types.js';
import { EMPTY_TRANSCRIPT } from '../types.js';
import { isMtimeFresh, getMtimeState, type MtimeState } from '../utils/cache.js';

const transcriptCache = new Map<string, { result: TranscriptData; mtime: MtimeState }>();

const MAX_LINES = 50_000;

export function normalizeTodoStatus(status: string | undefined): TodoStatus {
  if (!status) return 'pending';
  const s = String(status).toLowerCase();
  if (s === 'completed' || s === 'done') return 'completed';
  if (s === 'in_progress' || s === 'in-progress' || s === 'running') return 'in_progress';
  return 'pending';
}

export function extractToolTarget(toolName: string, input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  switch (toolName) {
    case 'Read': case 'Write': case 'Edit':
      return (input.file_path ?? input.path) as string | undefined;
    case 'Glob': case 'Grep':
      return input.pattern as string | undefined;
    case 'Bash': {
      const cmd = (input.command as string) || '';
      return cmd.length > 30 ? cmd.slice(0, 30) + '...' : cmd;
    }
    default: return undefined;
  }
}

export async function parseTranscript(transcriptPath: string): Promise<TranscriptData> {
  const result: TranscriptData = { ...EMPTY_TRANSCRIPT, tools: [], agents: [], todos: [] };
  if (!transcriptPath || !existsSync(transcriptPath)) return result;

  const resolved = resolve(transcriptPath);
  if (!resolved.startsWith(homedir()) && !resolved.startsWith(tmpdir())) return result;

  const currentMtime = getMtimeState(transcriptPath);
  const cached = transcriptCache.get(resolved);
  if (currentMtime && cached && isMtimeFresh(transcriptPath, cached.mtime)) {
    return cached.result;
  }

  const toolMap = new Map<string, ToolEntry>();
  const agentMap = new Map<string, AgentEntry>();
  let todos: TodoEntry[] = [];
  const taskIdToIndex = new Map<string, number>();
  let thinkingEffort: ThinkingEffort = '';

  let fileStream: ReturnType<typeof createReadStream> | null = null;
  try {
    fileStream = createReadStream(transcriptPath);
    const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
    let lineCount = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      if (++lineCount > MAX_LINES) break;

      try {
        const entry = JSON.parse(line);
        if (!result.sessionStart && entry.timestamp) result.sessionStart = new Date(entry.timestamp);

        const effortMatch = line.match(/Set model to .+ with (low|medium|high|max) effort/);
        if (effortMatch) thinkingEffort = effortMatch[1] as ThinkingEffort;

        const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
        const content = entry.message?.content;
        if (!content || !Array.isArray(content)) continue;

        for (const block of content) {
          if (block.type === 'tool_use' && block.id && block.name) {
            toolMap.set(block.id, { id: block.id, name: block.name, target: extractToolTarget(block.name, block.input), status: 'running', startTime: timestamp });

            if (block.name === 'Task') {
              const inp = block.input || {};
              agentMap.set(block.id, { id: block.id, type: inp.subagent_type || 'unknown', model: inp.model, description: inp.description, status: 'running', startTime: timestamp });
            }

            if (block.name === 'TodoWrite' && block.input?.todos && Array.isArray(block.input.todos)) {
              const existingById = new Map(todos.map(t => [t.id || t.content, t]));
              todos = block.input.todos.map((t: { id?: string; content?: string; status?: string }) => {
                const id = t.id || t.content || '';
                const existing = existingById.get(id);
                if (existing && (!t.status || t.status === existing.status)) return existing;
                return { id: t.id || '', content: t.content || '', status: normalizeTodoStatus(t.status) };
              });
            }

            if (block.name === 'TaskCreate') {
              const inp = block.input || {};
              const todoContent = (typeof inp.subject === 'string' ? inp.subject : '') || (typeof inp.description === 'string' ? inp.description : '') || 'Untitled task';
              todos.push({ id: inp.taskId || block.id, content: todoContent, status: normalizeTodoStatus(inp.status) });
              if (inp.taskId || block.id) taskIdToIndex.set(String(inp.taskId || block.id), todos.length - 1);
            }

            if (block.name === 'TaskUpdate') {
              const inp = block.input || {};
              let index: number | null = inp.taskId && taskIdToIndex.has(String(inp.taskId)) ? taskIdToIndex.get(String(inp.taskId))! : null;
              if (index === null && typeof inp.taskId === 'string' && /^\d+$/.test(inp.taskId)) {
                const n = parseInt(inp.taskId, 10) - 1;
                if (n >= 0 && n < todos.length) index = n;
              }
              if (index !== null && todos[index]) {
                if (inp.status) todos[index].status = normalizeTodoStatus(inp.status);
                const subj = typeof inp.subject === 'string' ? inp.subject : '';
                const desc = typeof inp.description === 'string' ? inp.description : '';
                if (subj || desc) todos[index].content = subj || desc;
              }
            }
          }

          if (block.type === 'tool_result' && block.tool_use_id) {
            const tool = toolMap.get(block.tool_use_id);
            if (tool) { tool.status = block.is_error ? 'error' : 'completed'; tool.endTime = timestamp; }
            const agent = agentMap.get(block.tool_use_id);
            if (agent) { agent.status = 'completed'; agent.endTime = timestamp; }
          }
        }
      } catch { /* skip malformed */ }
    }
  } catch { /* partial results */ } finally { fileStream?.destroy(); }

  result.tools = Array.from(toolMap.values()).slice(-20);
  result.agents = Array.from(agentMap.values()).slice(-10);
  result.todos = todos;
  result.thinkingEffort = thinkingEffort;
  if (currentMtime) {
    transcriptCache.set(resolved, { result, mtime: currentMtime });
  }
  return result;
}
