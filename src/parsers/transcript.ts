import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import type { TranscriptData, ToolEntry, AgentEntry, TodoEntry, TodoStatus, ThinkingEffort } from '../types.js';
import { EMPTY_TRANSCRIPT } from '../types.js';
import { isMtimeFresh, getMtimeState, type MtimeState } from '../utils/cache.js';
import { sanitizeTermString } from '../normalize.js';
import { debug } from '../utils/debug.js';

const log = debug('transcript');

// Full re-parse on cache miss is intentional. Incremental byte-offset parsing
// was evaluated and rejected (see #43): real transcripts are low-thousands of
// lines, parse cost stays under the statusline budget, and stateful
// accumulation breaks under concurrent ticks, file replacement (TOCTOU), and
// TaskUpdate's numeric-taskId index semantics. Each call uses local maps
// (toolMap, agentMap, todos below) — that locality is what keeps the parser
// concurrent-tick safe. Don't refactor it into shared mutable state.
//
// LRU bound: long-running shells switch transcript paths across sessions, so
// the cache would otherwise grow one entry per session forever (#69). Map
// iteration order is insertion order, which gives us a free LRU: re-insert
// on hit to refresh recency, drop the first key when size > cap.
export const TRANSCRIPT_CACHE_CAP = 10;
type TranscriptCacheEntry = { result: TranscriptData; mtime: MtimeState };
const transcriptCache = new Map<string, TranscriptCacheEntry>();

// Shallow-copy the result so callers can't mutate the cached arrays. Returned
// to both the hit path and the miss path — the parser's local maps are
// already discarded after the function returns, but the result object itself
// would otherwise be shared with the cache.
function snapshot(result: TranscriptData): TranscriptData {
  return {
    ...result,
    tools: result.tools.slice(),
    agents: result.agents.slice(),
    todos: result.todos.slice(),
  };
}

function touchCache(key: string, value: TranscriptCacheEntry): void {
  if (transcriptCache.has(key)) transcriptCache.delete(key);
  transcriptCache.set(key, value);
  // Size briefly hits CAP+1 between set() above and delete() below, but
  // touchCache is synchronous — no await boundary exists here, so no other
  // code can observe that window. Each call leaves the map at or below cap.
  if (transcriptCache.size > TRANSCRIPT_CACHE_CAP) {
    const oldest = transcriptCache.keys().next().value;
    if (oldest !== undefined) transcriptCache.delete(oldest);
  }
}

// Test-only inspectors. Underscore prefix signals "internal" — do not call
// from production code paths.
export function _transcriptCacheSize(): number {
  return transcriptCache.size;
}
export function _transcriptCacheKeys(): string[] {
  return Array.from(transcriptCache.keys());
}
export function _clearTranscriptCache(): void {
  transcriptCache.clear();
}

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
  const raw = (() => {
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
  })();
  return typeof raw === 'string' ? sanitizeTermString(raw) : raw;
}

export async function parseTranscript(transcriptPath: string): Promise<TranscriptData> {
  const result: TranscriptData = { ...EMPTY_TRANSCRIPT, tools: [], agents: [], todos: [] };
  if (!transcriptPath || !existsSync(transcriptPath)) {
    if (log.enabled) log('skip — transcript path missing or nonexistent:', transcriptPath || '(empty)');
    return result;
  }

  const resolved = resolve(transcriptPath);
  if (!resolved.startsWith(homedir()) && !resolved.startsWith(tmpdir())) {
    log('skip — path outside allowed roots:', resolved);
    return result;
  }

  const currentMtime = getMtimeState(resolved);
  const cached = transcriptCache.get(resolved);
  if (currentMtime && cached && isMtimeFresh(resolved, cached.mtime)) {
    log('cache hit:', resolved);
    touchCache(resolved, cached);
    return snapshot(cached.result);
  }
  const parseStart = log.enabled ? Date.now() : 0;

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
            toolMap.set(block.id, { id: block.id, name: sanitizeTermString(block.name), target: extractToolTarget(block.name, block.input), status: 'running', startTime: timestamp });

            if (block.name === 'Task') {
              const inp = block.input || {};
              agentMap.set(block.id, {
                id: block.id,
                type: sanitizeTermString(inp.subagent_type || 'unknown'),
                model: typeof inp.model === 'string' ? sanitizeTermString(inp.model) : inp.model,
                description: typeof inp.description === 'string' ? sanitizeTermString(inp.description) : inp.description,
                status: 'running',
                startTime: timestamp,
              });
            }

            if (block.name === 'TodoWrite' && block.input?.todos && Array.isArray(block.input.todos)) {
              const existingById = new Map(todos.map(t => [t.id || t.content, t]));
              todos = block.input.todos.map((t: { id?: string; content?: string; status?: string }) => {
                const id = t.id || t.content || '';
                const existing = existingById.get(id);
                if (existing && (!t.status || t.status === existing.status)) return existing;
                return { id: t.id || '', content: sanitizeTermString(t.content || ''), status: normalizeTodoStatus(t.status) };
              });
            }

            if (block.name === 'TaskCreate') {
              const inp = block.input || {};
              const todoContent = (typeof inp.subject === 'string' ? inp.subject : '') || (typeof inp.description === 'string' ? inp.description : '') || 'Untitled task';
              todos.push({ id: inp.taskId || block.id, content: sanitizeTermString(todoContent), status: normalizeTodoStatus(inp.status) });
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
                if (subj || desc) todos[index].content = sanitizeTermString(subj || desc);
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
    touchCache(resolved, { result, mtime: currentMtime });
  }
  if (log.enabled) {
    log('parsed', resolved, {
      tools: result.tools.length,
      agents: result.agents.length,
      todos: result.todos.length,
      thinkingEffort: result.thinkingEffort || null,
      durationMs: Date.now() - parseStart,
    });
  }
  return snapshot(result);
}
