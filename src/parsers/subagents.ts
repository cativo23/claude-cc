// Mixed sync/async fs imports are deliberate: `stat` and `readFile` are async
// I/O on the hot path; the only sync call is the canonicalisation helper from
// `utils/path.ts`. We do not gate any I/O behind `existsSync` here — the
// async readdir/stat calls have try/catch fallbacks, which avoids the
// existsSync→readdir TOCTOU window.
import { open, readdir, readFile, stat } from 'node:fs/promises';
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
// they were user-named subagents. Exported so tests can assert membership
// directly without re-encoding the values.
export const GENERIC_AGENT_TYPES: ReadonlySet<string> = new Set(['general-purpose', 'unknown']);

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

/**
 * Per-file metadata captured by `scanSubagentsDir`. Phase 1 of the parse:
 * a stat-only summary the cache uses for fingerprinting and that the full
 * parse re-uses to avoid re-running readdir/stat on miss.
 */
export interface AgentCandidate {
  id: string;
  jsonlFile: string;
  metaFile: string;
  mtimeMs: number;
  size: number;
}

export function deriveSubagentsDir(jsonlPath: string): string {
  const dir = dirname(jsonlPath);
  const base = basename(jsonlPath).replace(/\.jsonl$/i, '');
  return join(dir, base, 'subagents');
}

/**
 * Cheap filesystem fingerprint of a session's subagents dir, suitable for
 * folding into a transcript-level cache key. Captures (a) the number of
 * matching agent files, (b) the most recent file mtime in the dir, and
 * (c) the aggregate file size. A change to any agent file flips at least
 * one of these — `maxMtimeMs` is monotonic across writes (every new write
 * either bumps mtime or leaves it unchanged on the same-second case where
 * the size delta still fires), and `totalSize` catches in-place edits that
 * happen at exactly the same mtime tick.
 *
 * Intentionally O(N) on dir size: the dir is small (≤ MAX_AGENTS handful)
 * and `stat` is fast. Returns null when the dir doesn't exist or isn't
 * accessible — the caller should treat that as "no fingerprint, no cached
 * subagent state".
 */
export interface SubagentsDirState {
  count: number;
  maxMtimeMs: number;
  totalSize: number;
}

/**
 * Unified scan: walks the subagents/ dir once, gathering both the cache
 * fingerprint AND the per-file stat metadata needed for the full parse.
 * Callers that only need the fingerprint can ignore `candidates`; callers
 * doing a full parse can hand the candidates to `readSubagentDetails`
 * without re-running readdir/stat.
 */
export async function scanSubagentsDir(rawJsonlPath: string): Promise<{ state: SubagentsDirState | null; candidates: AgentCandidate[] }> {
  if (!rawJsonlPath) return { state: null, candidates: [] };
  // Canonicalise the input path here so public callers (relative paths,
  // `..` segments) and internal callers (`transcript.ts` already passes a
  // resolved absolute path) get identical results. `deriveSubagentsDir`
  // remains a pure string operation; this is the single point of resolution.
  const jsonlPath = resolve(rawJsonlPath);
  const resolved = deriveSubagentsDir(jsonlPath);
  if (!isUnderAllowedRoot(resolved, LUMIRA_ALLOWED_ROOTS)) {
    log('skip — subagents dir outside allowed roots:', resolved);
    return { state: null, candidates: [] };
  }
  let entries: string[];
  try {
    entries = await readdir(resolved);
  } catch (err) {
    log('readdir failed:', resolved, err);
    return { state: null, candidates: [] };
  }
  let count = 0;
  let maxMtimeMs = 0;
  let totalSize = 0;
  const candidates: AgentCandidate[] = [];
  for (const file of entries) {
    const m = file.match(AGENT_FILE_RE);
    if (!m) continue;
    try {
      const jsonlFile = join(resolved, file);
      const st = await stat(jsonlFile);
      if (!st.isFile()) continue;
      count += 1;
      if (st.mtimeMs > maxMtimeMs) maxMtimeMs = st.mtimeMs;
      totalSize += st.size;
      candidates.push({
        id: m[1],
        jsonlFile,
        metaFile: join(resolved, `agent-${m[1]}.meta.json`),
        mtimeMs: st.mtimeMs,
        size: st.size,
      });
    } catch { /* file disappeared mid-scan — skip */ }
  }
  return { state: { count, maxMtimeMs, totalSize }, candidates };
}

// Thin wrapper retained for callers that only want the cache fingerprint.
// Internally re-uses `scanSubagentsDir` so the two paths can never drift.
export async function getSubagentsDirState(jsonlPath: string): Promise<SubagentsDirState | null> {
  return (await scanSubagentsDir(jsonlPath)).state;
}

export function subagentsDirStateEqual(a: SubagentsDirState | null, b: SubagentsDirState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.count === b.count && a.maxMtimeMs === b.maxMtimeMs && a.totalSize === b.totalSize;
}

async function readMeta(metaPath: string): Promise<MetaSidecar | null> {
  try {
    const raw = await readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as MetaSidecar;
  } catch { /* meta is best-effort */ }
  return null;
}

interface JsonlBoundaryLines {
  first: unknown | null;
  last: unknown | null;
}

// Files larger than this threshold are read via head/tail chunks rather
// than slurped whole. Subagent transcripts can grow into the megabytes
// when the agent runs many tool calls — buffering all of them on every
// cache miss caused real memory pressure in the wild.
const LARGE_FILE_THRESHOLD = 64 * 1024;
// Window we read at each end of a large file. 16 KB is comfortably bigger
// than any single JSONL line we've observed (Claude Code wraps very long
// content), and small enough to keep a 10-agent miss under 320 KB peak.
const BOUNDARY_CHUNK_SIZE = 16 * 1024;

// Extracts both the first and last well-formed JSON objects from a JSONL
// file. We need the first line's timestamp for `startTime` (file mtime
// drifts to the *last* write) and the last line for completion markers.
//
// For files at or below `LARGE_FILE_THRESHOLD` we slurp via `readFile`
// (one syscall, no chunking). For larger files we open the fd and read
// only the head and tail windows — bounding peak memory regardless of
// transcript size.
async function readBoundaryJsonLines(filePath: string, fileSize: number): Promise<JsonlBoundaryLines> {
  if (fileSize <= LARGE_FILE_THRESHOLD) {
    try {
      const raw = await readFile(filePath, 'utf8');
      return { first: parseFirstJson(raw), last: parseLastJson(raw) };
    } catch { return { first: null, last: null }; }
  }
  let fd;
  try { fd = await open(filePath, 'r'); } catch { return { first: null, last: null }; }
  try {
    const headSize = Math.min(BOUNDARY_CHUNK_SIZE, fileSize);
    const headBuf = Buffer.alloc(headSize);
    await fd.read(headBuf, 0, headSize, 0);
    const head = headBuf.toString('utf8');

    const tailSize = Math.min(BOUNDARY_CHUNK_SIZE, fileSize);
    const tailBuf = Buffer.alloc(tailSize);
    await fd.read(tailBuf, 0, tailSize, fileSize - tailSize);
    const tail = tailBuf.toString('utf8');

    // The tail chunk likely starts mid-line (we sliced at a byte offset).
    // Drop the first partial line so JSON.parse doesn't choke on it.
    const tailFromBoundary = tail.includes('\n') ? tail.slice(tail.indexOf('\n') + 1) : tail;
    return { first: parseFirstJson(head), last: parseLastJson(tailFromBoundary) };
  } catch { return { first: null, last: null }; }
  finally { await fd.close().catch(() => undefined); }
}

function parseFirstJson(raw: string): unknown | null {
  for (const l of raw.split('\n')) {
    const t = l.trim();
    if (!t) continue;
    try { return JSON.parse(t); } catch { /* try next line */ }
  }
  return null;
}

function parseLastJson(raw: string): unknown | null {
  const lines = raw.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t) continue;
    try { return JSON.parse(t); } catch { /* try previous line */ }
  }
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
// user-role message whose text is bracket-wrapped, e.g.
// "[Request interrupted by user for tool use]". That's the only on-disk
// signal of a kill — the assistant message that preceded it never gets its
// closing stop_reason rewritten. Matching is anchored on both ends to avoid
// false positives if Claude Code ever ships an unrelated message that
// starts with the same prefix.
// `[^[]*` rather than `[^\]]*` so a hypothetical future variant whose
// reason text contains a `]` (but no `[`) would still match.
const INTERRUPT_MARKER_RE = /^\[Request interrupted by user[^[]*\]$/;

function wasInterruptedByUser(lastLine: unknown): boolean {
  if (!lastLine || typeof lastLine !== 'object') return false;
  const d = lastLine as { type?: unknown; message?: { role?: unknown; content?: unknown } };
  if (d.type !== 'user') return false;
  const content = d.message?.content;
  if (!Array.isArray(content)) return false;
  for (const block of content) {
    if (block && typeof block === 'object') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string' && INTERRUPT_MARKER_RE.test(text.trim())) return true;
    }
  }
  return false;
}

async function readAgentDetails(c: AgentCandidate): Promise<AgentEntry> {
  const { first, last } = await readBoundaryJsonLines(c.jsonlFile, c.size);
  const stopReason = extractStopReason(last);
  const interrupted = wasInterruptedByUser(last);

  const meta = await readMeta(c.metaFile);
  const agentType = sanitizeTermString(typeof meta?.agentType === 'string' ? meta.agentType : 'unknown');
  const description = typeof meta?.description === 'string' ? sanitizeTermString(meta.description) : undefined;

  const status: ToolStatus = (stopReason === 'end_turn' || interrupted) ? 'completed' : 'running';

  // startTime: prefer the first JSONL line's embedded ISO timestamp (the
  // dispatch moment) over the file mtime. mtime tracks the *last* write,
  // which for a long-running agent is the close-out — using it as
  // startTime would make duration calculations meaningless. birthtimeMs
  // is unreliable across filesystems (often 0/unset, can't be updated by
  // utimes() so tests can't simulate it), hence we don't try it.
  const startTime = extractTimestamp(first) ?? new Date(c.mtimeMs);
  const agent: AgentEntry = {
    id: c.id,
    type: agentType,
    status,
    startTime,
  };
  if (description) agent.description = description;
  if (status === 'completed') {
    const tsFromLine = extractTimestamp(last);
    agent.endTime = tsFromLine ?? new Date(c.mtimeMs);
  }
  return agent;
}

/**
 * Phase 2 of the parse — reads JSONL bodies + meta sidecars only for the
 * MAX_AGENTS most recent files in `candidates`. Sorts oldest → newest by
 * file mtime; the survivors of `slice(-MAX_AGENTS)` are read.
 *
 * `mtime` is the on-disk last-write timestamp, not the agent's logical
 * "last activity". The two usually coincide, but on a slow filesystem an
 * agent dispatched recently may have a stale mtime (its first write
 * hasn't been journaled yet) while an older agent's file gets touched by
 * an unrelated journal flush. The downstream `startTime` is read from
 * the JSONL line's embedded `timestamp` field — so the sort order may
 * not match `startTime` order exactly. Acceptable for the statusline's
 * "newest N" picker; flagged here so a future caller doesn't assume the
 * two orderings are identical.
 *
 * Exported so callers that already ran `scanSubagentsDir` (e.g. the
 * transcript parser, which uses the same scan to build its cache key) can
 * skip a second readdir+stat pass.
 */
export async function readSubagentDetails(candidates: AgentCandidate[]): Promise<AgentEntry[]> {
  const sorted = candidates.slice().sort((a, b) => a.mtimeMs - b.mtimeMs);
  const top = sorted.slice(-MAX_AGENTS);
  const agents: AgentEntry[] = [];
  for (const c of top) {
    agents.push(await readAgentDetails(c));
  }
  return agents;
}

/**
 * Convenience wrapper: full scan + full parse. Equivalent to
 * `(await scanSubagentsDir(p)).candidates → readSubagentDetails`.
 * Callers that need the cache fingerprint *and* the agents in the same
 * tick should call `scanSubagentsDir` directly to avoid a second scan.
 */
export async function parseSubagentsDir(jsonlPath: string): Promise<AgentEntry[]> {
  const { candidates } = await scanSubagentsDir(jsonlPath);
  return readSubagentDetails(candidates);
}
