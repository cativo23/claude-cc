// Mixed sync/async fs imports are deliberate: `stat` and `readFile` are async
// I/O on the hot path; the only sync call is the canonicalisation helper from
// `utils/path.ts`. We do not gate any I/O behind `existsSync` here — the
// async readdir/stat calls have try/catch fallbacks, which avoids the
// existsSync→readdir TOCTOU window.
import { open, readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname, basename, resolve } from 'node:path';
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
// they were user-named subagents. Exported as part of the public API;
// callers should prefer `isNamedAgentType` for membership checks rather
// than reaching into the set directly.
export const GENERIC_AGENT_TYPES = new Set(['general-purpose', 'unknown']);
/**
 * Returns true when `type` identifies a *named* subagent — i.e. one defined
 * by the user (e.g. `pepito`, `feature-dev:code-reviewer`) rather than an
 * anonymous dispatch via the generic Agent tool. Render layers use this to
 * decide whether to surface the type in the cubes-icon widget.
 */
export function isNamedAgentType(type) {
    return typeof type === 'string' && type.length > 0 && !GENERIC_AGENT_TYPES.has(type);
}
export function deriveSubagentsDir(jsonlPath) {
    const dir = dirname(jsonlPath);
    const base = basename(jsonlPath).replace(/\.jsonl$/i, '');
    return join(dir, base, 'subagents');
}
/**
 * Unified scan: walks the subagents/ dir once, gathering both the cache
 * fingerprint AND the per-file stat metadata needed for the full parse.
 * Callers that only need the fingerprint can ignore `candidates`; callers
 * doing a full parse can hand the candidates to `readSubagentDetails`
 * without re-running readdir/stat.
 */
export async function scanSubagentsDir(rawJsonlPath) {
    if (!rawJsonlPath)
        return { state: null, candidates: [] };
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
    let entries;
    try {
        entries = await readdir(resolved);
    }
    catch (err) {
        log('readdir failed:', resolved, err);
        return { state: null, candidates: [] };
    }
    let count = 0;
    let maxMtimeMs = 0;
    let totalSize = 0;
    const candidates = [];
    for (const file of entries) {
        const m = file.match(AGENT_FILE_RE);
        if (!m)
            continue;
        try {
            const jsonlFile = join(resolved, file);
            const st = await stat(jsonlFile);
            if (!st.isFile())
                continue;
            count += 1;
            if (st.mtimeMs > maxMtimeMs)
                maxMtimeMs = st.mtimeMs;
            totalSize += st.size;
            candidates.push({
                id: m[1],
                jsonlFile,
                metaFile: join(resolved, `agent-${m[1]}.meta.json`),
                mtimeMs: st.mtimeMs,
                size: st.size,
            });
        }
        catch { /* file disappeared mid-scan — skip */ }
    }
    return { state: { count, maxMtimeMs, totalSize }, candidates };
}
// Thin wrapper retained for callers that only want the cache fingerprint.
// Internally re-uses `scanSubagentsDir` so the two paths can never drift.
export async function getSubagentsDirState(jsonlPath) {
    return (await scanSubagentsDir(jsonlPath)).state;
}
export function subagentsDirStateEqual(a, b) {
    if (a === b)
        return true;
    if (!a || !b)
        return false;
    return a.count === b.count && a.maxMtimeMs === b.maxMtimeMs && a.totalSize === b.totalSize;
}
async function readMeta(metaPath) {
    try {
        const raw = await readFile(metaPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object')
            return parsed;
    }
    catch { /* meta is best-effort */ }
    return null;
}
// Files larger than this threshold are read via head/tail chunks rather
// than slurped whole. Subagent transcripts can grow into the megabytes
// when the agent runs many tool calls — buffering all of them on every
// cache miss caused real memory pressure in the wild.
const LARGE_FILE_THRESHOLD = 256 * 1024;
// Window we read at each end of a large file. 64 KB is comfortably bigger
// than any single JSONL line we've observed in the wild (an Opus reviewer's
// multi-thousand-word closing message clocked at ~18 KB; we leave headroom
// for unusually large summaries). Small enough to keep a 10-agent miss
// under ~1.3 MB peak buffer use.
const BOUNDARY_CHUNK_SIZE = 64 * 1024;
// Extracts both the first and last well-formed JSON objects from a JSONL
// file. We need the first line's timestamp for `startTime` (file mtime
// drifts to the *last* write) and the last line for completion markers.
//
// For files at or below `LARGE_FILE_THRESHOLD` we slurp via `readFile`
// (one syscall, no chunking). For larger files we open the fd and read
// only the head and tail windows — bounding peak memory regardless of
// transcript size.
async function readBoundaryJsonLines(filePath, fileSize) {
    if (fileSize <= LARGE_FILE_THRESHOLD) {
        try {
            const raw = await readFile(filePath, 'utf8');
            return { first: parseFirstJson(raw), last: parseLastJson(raw) };
        }
        catch {
            return { first: null, last: null };
        }
    }
    let fd;
    try {
        fd = await open(filePath, 'r');
    }
    catch {
        return { first: null, last: null };
    }
    try {
        // We're on the chunked path, so fileSize > LARGE_FILE_THRESHOLD >
        // BOUNDARY_CHUNK_SIZE — head and tail windows are always exactly
        // BOUNDARY_CHUNK_SIZE bytes, never clamped by file size.
        const chunkSize = BOUNDARY_CHUNK_SIZE;
        const headBuf = Buffer.alloc(chunkSize);
        await fd.read(headBuf, 0, chunkSize, 0);
        const head = headBuf.toString('utf8');
        const tailBuf = Buffer.alloc(chunkSize);
        await fd.read(tailBuf, 0, chunkSize, fileSize - chunkSize);
        const tail = tailBuf.toString('utf8');
        // The tail window starts at an arbitrary byte offset; if that byte
        // happens to be inside a JSON line, the leading fragment is malformed
        // and we discard everything up to the first newline. If the offset
        // lands cleanly on a line boundary the slice still drops only the
        // single leading newline byte (harmless), so the same logic covers
        // both cases without an extra branch.
        const tailFromBoundary = tail.includes('\n') ? tail.slice(tail.indexOf('\n') + 1) : tail;
        const first = parseFirstJson(head);
        const last = parseLastJson(tailFromBoundary);
        if (log.enabled) {
            // When a single first/last line is bigger than the chunk window,
            // JSON.parse fails on every fragment we see and we fall back to
            // mtime / "running". A fully corrupt file produces the same
            // signal — the suffix "(no valid JSON in head/tail window)"
            // covers both interpretations without overcommitting to either.
            if (first === null)
                log('warn — first-line parse missed (no valid JSON in head window):', filePath);
            if (last === null)
                log('warn — last-line parse missed (no valid JSON in tail window):', filePath);
        }
        return { first, last };
    }
    catch {
        return { first: null, last: null };
    }
    finally {
        await fd.close().catch(() => undefined);
    }
}
function parseFirstJson(raw) {
    for (const l of raw.split('\n')) {
        const t = l.trim();
        if (!t)
            continue;
        try {
            return JSON.parse(t);
        }
        catch { /* try next line */ }
    }
    return null;
}
function parseLastJson(raw) {
    const lines = raw.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const t = lines[i].trim();
        if (!t)
            continue;
        try {
            return JSON.parse(t);
        }
        catch { /* try previous line */ }
    }
    return null;
}
function extractStopReason(lastLine) {
    if (!lastLine || typeof lastLine !== 'object')
        return null;
    const msg = lastLine.message;
    if (!msg || typeof msg !== 'object')
        return null;
    const sr = msg.stop_reason;
    return typeof sr === 'string' ? sr : null;
}
// Claude Code occasionally finalises a subagent's JSONL with `stop_reason:
// null` (or absent) on the closing assistant message even though the agent
// has clearly finished — observed for short reviewer subagents that returned
// their full response inline. The reliable on-disk tell-apart from a "still
// waiting on a tool" line is whether the assistant's content includes a
// `tool_use` block: a running agent's last assistant message always carries
// the tool_use it's waiting on; a finished agent's last message is text-only.
function isFinalAssistantTextOnly(lastLine) {
    if (!lastLine || typeof lastLine !== 'object')
        return false;
    const d = lastLine;
    if (d.type !== 'assistant')
        return false;
    const content = d.message?.content;
    if (!Array.isArray(content) || content.length === 0)
        return false;
    for (const block of content) {
        if (block && typeof block === 'object') {
            const t = block.type;
            if (t !== 'text')
                return false;
        }
    }
    return true;
}
// JSONL lines carry an ISO `timestamp` field. Prefer it for endTime over the
// file's mtime: mtime can drift due to OS-level flush buffering, especially
// for short-lived agents that finish faster than the journal commit window.
function extractTimestamp(lastLine) {
    if (!lastLine || typeof lastLine !== 'object')
        return null;
    const ts = lastLine.timestamp;
    if (typeof ts !== 'string')
        return null;
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
function wasInterruptedByUser(lastLine) {
    if (!lastLine || typeof lastLine !== 'object')
        return false;
    const d = lastLine;
    if (d.type !== 'user')
        return false;
    const content = d.message?.content;
    if (!Array.isArray(content))
        return false;
    for (const block of content) {
        if (block && typeof block === 'object') {
            const text = block.text;
            if (typeof text === 'string' && INTERRUPT_MARKER_RE.test(text.trim()))
                return true;
        }
    }
    return false;
}
async function readAgentDetails(c) {
    const { first, last } = await readBoundaryJsonLines(c.jsonlFile, c.size);
    const stopReason = extractStopReason(last);
    const interrupted = wasInterruptedByUser(last);
    const finalTextOnly = isFinalAssistantTextOnly(last);
    const meta = await readMeta(c.metaFile);
    const agentType = sanitizeTermString(typeof meta?.agentType === 'string' ? meta.agentType : 'unknown');
    const description = typeof meta?.description === 'string' ? sanitizeTermString(meta.description) : undefined;
    const status = (stopReason === 'end_turn' || interrupted || finalTextOnly) ? 'completed' : 'running';
    // startTime: prefer the first JSONL line's embedded ISO timestamp (the
    // dispatch moment) over the file mtime. mtime tracks the *last* write,
    // which for a long-running agent is the close-out — using it as
    // startTime would make duration calculations meaningless. birthtimeMs
    // is unreliable across filesystems (often 0/unset, can't be updated by
    // utimes() so tests can't simulate it), hence we don't try it.
    const startTime = extractTimestamp(first) ?? new Date(c.mtimeMs);
    const agent = {
        id: c.id,
        type: agentType,
        status,
        startTime,
    };
    if (description)
        agent.description = description;
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
export async function readSubagentDetails(candidates) {
    const sorted = candidates.slice().sort((a, b) => a.mtimeMs - b.mtimeMs);
    const top = sorted.slice(-MAX_AGENTS);
    const agents = [];
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
export async function parseSubagentsDir(jsonlPath) {
    const { candidates } = await scanSubagentsDir(jsonlPath);
    return readSubagentDetails(candidates);
}
//# sourceMappingURL=subagents.js.map