// Mixed sync/async fs imports are deliberate: `stat` and `readFile` are async
// I/O on the hot path; the only sync call is the canonicalisation helper from
// `utils/path.ts`. We do not gate any I/O behind `existsSync` here — the
// async readdir/stat calls have try/catch fallbacks, which avoids the
// existsSync→readdir TOCTOU window.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname, basename, resolve } from 'node:path';
import type { AgentEntry, ToolStatus } from '../types.js';
import { isUnderAllowedRoot, LUMIRA_ALLOWED_ROOTS } from '../utils/path.js';
import { sanitizeTermString } from '../normalize.js';
import { debug } from '../utils/debug.js';

const log = debug('subagents');

// Claude Code stores per-subagent transcripts at
//   ~/.claude/projects/<slug>/<session-id>/subagents/agent-<id>.jsonl
// alongside an agent-<id>.meta.json sidecar carrying {agentType, description}.
// This is an undocumented implementation detail of Claude Code (verified
// against 2.1.x). When the layout changes, this module degrades to an empty
// result and the main-JSONL parser remains the source of truth.
const AGENT_FILE_RE = /^agent-([A-Za-z0-9_-]+)\.jsonl$/;

// Long-running sessions accumulate dozens of agent files; the statusline only
// surfaces a handful. Match the cap used by the main-JSONL agent slice (in
// `transcript.ts: agentMap.values()).slice(-10)`).
const MAX_AGENTS = 10;

// Generic dispatch types Claude Code attaches to anonymous Agent calls. The
// list is hard-coded today; extend it when Claude Code adds new generic
// types so the statusline doesn't accidentally surface their names as if
// they were user-named subagents.
const GENERIC_AGENT_TYPES: ReadonlySet<string> = new Set(['general-purpose', 'unknown']);

/**
 * Returns true when `type` identifies a *named* subagent — i.e. one defined
 * by the user (e.g. `pepito`, `feature-dev:code-reviewer`) rather than an
 * anonymous dispatch via the generic Agent tool. Render layers use this to
 * decide whether to surface the type in the cubes-icon widget.
 */
export function isNamedAgentType(type: string | undefined | null): boolean {
  return typeof type === 'string' && type.length > 0 && !GENERIC_AGENT_TYPES.has(type);
}

// Only `stop_reason: "end_turn"` definitively marks a subagent as finished.
// Other terminal markers like `tool_use` are emitted whenever the subagent
// yields to a long-running tool (e.g. a 5-minute bash heartbeat) and cannot
// be treated as completion — the JSONL goes silent until the tool returns,
// so any mtime-based grace window incorrectly flips live agents to completed.
// Trade-off: a subagent that crashes without writing its closing line will
// linger as "running" until the session closes. That's rare; false negatives
// on long-tool agents were the more common bug.

// SECURITY: like `transcript.ts`, this module performs *string-level*
// allow-list checks via `isUnderAllowedRoot`. Symlinks are not followed at
// check time. A symlinked subagents dir whose target lies outside the
// allow-list is treated as legal as long as its own path string sits under a
// permitted root. The threat is bounded because (a) the path is derived
// mechanically from the parent JSONL path which `transcript.ts` already
// validated, and (b) Claude Code itself owns the layout. Callers protecting
// against symlink traversal should pre-canonicalise via `realpathSafe`.

// Internal type — shape of the agent-<id>.meta.json sidecar Claude Code writes.
// All fields are validated at use site since the file is parsed via
// `JSON.parse` and the cast is unchecked.
interface MetaSidecar {
  agentType?: unknown;
  description?: unknown;
}

export function deriveSubagentsDir(jsonlPath: string): string {
  const dir = dirname(jsonlPath);
  const base = basename(jsonlPath).replace(/\.jsonl$/i, '');
  return join(dir, base, 'subagents');
}

/**
 * Cheap filesystem fingerprint of a session's subagents dir, suitable for
 * folding into a transcript-level cache key. Returns the directory mtime plus
 * the count and aggregate mtime/size of agent JSONL files inside. A change to
 * any agent file flips at least one of these values.
 *
 * Intentionally O(N) on dir size: the dir is small (≤ MAX_AGENTS handful)
 * and `stat` is fast. Returns null when the dir doesn't exist or isn't
 * accessible — the caller should treat that as "no fingerprint, no cached
 * subagent state".
 */
export interface SubagentsDirState {
  count: number;
  totalMtimeMs: number;
  totalSize: number;
}

export async function getSubagentsDirState(jsonlPath: string): Promise<SubagentsDirState | null> {
  if (!jsonlPath) return null;
  const dir = deriveSubagentsDir(jsonlPath);
  if (!isUnderAllowedRoot(resolve(dir), LUMIRA_ALLOWED_ROOTS)) return null;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  let count = 0;
  let totalMtimeMs = 0;
  let totalSize = 0;
  for (const file of entries) {
    if (!AGENT_FILE_RE.test(file)) continue;
    try {
      const st = await stat(join(dir, file));
      if (!st.isFile()) continue;
      count += 1;
      totalMtimeMs += st.mtimeMs;
      totalSize += st.size;
    } catch { /* file disappeared mid-scan — skip */ }
  }
  return { count, totalMtimeMs, totalSize };
}

export function subagentsDirStateEqual(a: SubagentsDirState | null, b: SubagentsDirState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.count === b.count && a.totalMtimeMs === b.totalMtimeMs && a.totalSize === b.totalSize;
}

async function readMeta(metaPath: string): Promise<MetaSidecar | null> {
  try {
    const raw = await readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as MetaSidecar;
  } catch { /* meta is best-effort */ }
  return null;
}

async function readLastJsonLine(filePath: string): Promise<unknown> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const lines = raw.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try { return JSON.parse(line); } catch { /* try previous line */ }
    }
  } catch { /* unreadable */ }
  return null;
}

function extractStopReason(lastLine: unknown): string | null {
  if (!lastLine || typeof lastLine !== 'object') return null;
  const msg = (lastLine as { message?: unknown }).message;
  if (!msg || typeof msg !== 'object') return null;
  const sr = (msg as { stop_reason?: unknown }).stop_reason;
  return typeof sr === 'string' ? sr : null;
}

// JSONL lines carry an ISO `timestamp` field. Prefer it for endTime over the
// file's mtime: mtime can drift due to OS-level flush buffering, especially
// for short-lived agents that finish faster than the journal commit window.
function extractTimestamp(lastLine: unknown): Date | null {
  if (!lastLine || typeof lastLine !== 'object') return null;
  const ts = (lastLine as { timestamp?: unknown }).timestamp;
  if (typeof ts !== 'string') return null;
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d : null;
}

// When the user stops a running subagent, Claude Code appends a synthetic
// user-role message whose text marker is "[Request interrupted by user…]".
// That's the only on-disk signal of a kill — the assistant message that
// preceded it never gets its closing stop_reason rewritten.
function wasInterruptedByUser(lastLine: unknown): boolean {
  if (!lastLine || typeof lastLine !== 'object') return false;
  const d = lastLine as { type?: unknown; message?: { role?: unknown; content?: unknown } };
  if (d.type !== 'user') return false;
  const content = d.message?.content;
  if (!Array.isArray(content)) return false;
  for (const block of content) {
    if (block && typeof block === 'object') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string' && text.startsWith('[Request interrupted by user')) return true;
    }
  }
  return false;
}

// Phase 1 entry: stat-only metadata for ranking. Phase 2 (`readAgentDetails`)
// reads JSONL + meta only for files that survive the MAX_AGENTS slice — this
// avoids opening the entire dir on every statusline tick when a session has
// accumulated dozens of historical agent files.
interface AgentCandidate {
  id: string;
  jsonlFile: string;
  metaFile: string;
  mtimeMs: number;
  size: number;
}

async function readAgentDetails(c: AgentCandidate): Promise<AgentEntry | null> {
  const lastLine = await readLastJsonLine(c.jsonlFile);
  const stopReason = extractStopReason(lastLine);
  const interrupted = wasInterruptedByUser(lastLine);

  const meta = await readMeta(c.metaFile);
  const agentType = sanitizeTermString(typeof meta?.agentType === 'string' ? meta.agentType : 'unknown');
  const description = typeof meta?.description === 'string' ? sanitizeTermString(meta.description) : undefined;

  const status: ToolStatus = (stopReason === 'end_turn' || interrupted) ? 'completed' : 'running';

  // birthtimeMs is unreliable across filesystems (often 0/unset, can't be
  // updated by tests via utimes). Fall back to mtimeMs whenever it's missing.
  const startTimeMs = c.mtimeMs;
  const agent: AgentEntry = {
    id: c.id,
    type: agentType,
    status,
    startTime: new Date(startTimeMs),
  };
  if (description) agent.description = description;
  if (status === 'completed') {
    const tsFromLine = extractTimestamp(lastLine);
    agent.endTime = tsFromLine ?? new Date(c.mtimeMs);
  }
  return agent;
}

export async function parseSubagentsDir(jsonlPath: string): Promise<AgentEntry[]> {
  if (!jsonlPath) return [];
  const subagentsDir = deriveSubagentsDir(jsonlPath);
  const resolved = resolve(subagentsDir);
  if (!isUnderAllowedRoot(resolved, LUMIRA_ALLOWED_ROOTS)) {
    log('skip — subagents dir outside allowed roots:', resolved);
    return [];
  }

  // No `existsSync` guard: the readdir below already returns ENOENT on a
  // missing dir, and skipping the sync stat removes the TOCTOU window where
  // the dir could be deleted between check and use.
  let entries: string[];
  try {
    entries = await readdir(resolved);
  } catch (err) {
    log('readdir failed:', resolved, err);
    return [];
  }

  // Phase 1 — stat all candidate files. `stat` is cheap; reading the JSONL
  // bodies is what we want to keep bounded.
  const candidates: AgentCandidate[] = [];
  for (const file of entries) {
    const m = file.match(AGENT_FILE_RE);
    if (!m) continue;
    const id = m[1];
    const jsonlFile = join(resolved, file);
    try {
      const st = await stat(jsonlFile);
      if (!st.isFile()) continue;
      candidates.push({
        id,
        jsonlFile,
        metaFile: join(resolved, `agent-${id}.meta.json`),
        mtimeMs: st.mtimeMs,
        size: st.size,
      });
    } catch { /* race with deletion — skip */ }
  }

  // Sort oldest → newest by file mtime, then keep only the most recent
  // MAX_AGENTS. mtime is the on-disk last-write timestamp, not the
  // subagent's logical "last activity" — those are usually the same but can
  // drift when the OS journal flushes well after the write.
  candidates.sort((a, b) => a.mtimeMs - b.mtimeMs);
  const top = candidates.slice(-MAX_AGENTS);

  // Phase 2 — read JSONL bodies + meta sidecars only for the survivors.
  const agents: AgentEntry[] = [];
  for (const c of top) {
    const a = await readAgentDetails(c);
    if (a) agents.push(a);
  }
  return agents;
}
