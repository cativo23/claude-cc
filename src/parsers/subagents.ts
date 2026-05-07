import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import type { AgentEntry, ToolStatus } from '../types.js';
import { isUnderAllowedRoot } from '../utils/path.js';
import { sanitizeTermString } from '../normalize.js';
import { debug } from '../utils/debug.js';

const log = debug('subagents');

// Claude Code stores per-subagent transcripts at
//   ~/.claude/projects/<slug>/<session-id>/subagents/agent-<id>.jsonl
// alongside an agent-<id>.meta.json sidecar carrying {agentType, description}.
// This is an undocumented implementation detail of Claude Code (verified against
// 2.1.x). When the layout changes, this module degrades to an empty result and
// the main-JSONL parser remains the source of truth.
const AGENT_FILE_RE = /^agent-([A-Za-z0-9_-]+)\.jsonl$/;

// Only `stop_reason: "end_turn"` definitively marks a subagent as finished.
// Other terminal markers like `tool_use` are emitted whenever the subagent
// yields to a long-running tool (e.g. a 5-minute bash heartbeat) and cannot
// be treated as completion — the JSONL goes silent until the tool returns,
// so any mtime-based grace window incorrectly flips live agents to completed.
// Trade-off: a subagent that crashes without writing its closing line will
// linger as "running" until the session closes. That's rare; false negatives
// on long-tool agents were the more common bug.

function realpathSafe(p: string): string {
  try { return realpathSync(p); } catch { return resolve(p); }
}
const ALLOWED_ROOTS: readonly string[] = [
  ...new Set([resolve(homedir()), resolve(tmpdir()), realpathSafe(homedir()), realpathSafe(tmpdir())]),
];

export function deriveSubagentsDir(jsonlPath: string): string {
  const dir = dirname(jsonlPath);
  const base = basename(jsonlPath).replace(/\.jsonl$/i, '');
  return join(dir, base, 'subagents');
}

interface MetaSidecar {
  agentType?: string;
  description?: string;
}

async function readMeta(metaPath: string): Promise<MetaSidecar | null> {
  try {
    const raw = await readFile(metaPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as MetaSidecar;
  } catch { /* meta is best-effort */ }
  return null;
}

async function readLastJsonLine(filePath: string): Promise<unknown | null> {
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

export async function parseSubagentsDir(jsonlPath: string): Promise<AgentEntry[]> {
  if (!jsonlPath) return [];
  const subagentsDir = deriveSubagentsDir(jsonlPath);
  if (!existsSync(subagentsDir)) return [];
  const resolved = resolve(subagentsDir);
  if (!isUnderAllowedRoot(resolved, ALLOWED_ROOTS)) {
    log('skip — subagents dir outside allowed roots:', resolved);
    return [];
  }

  let entries: string[];
  try {
    entries = await readdir(resolved);
  } catch (err) {
    log('readdir failed:', resolved, err);
    return [];
  }

  const collected: { agent: AgentEntry; mtimeMs: number }[] = [];
  for (const file of entries) {
    const m = file.match(AGENT_FILE_RE);
    if (!m) continue;
    const id = m[1];
    const jsonlFile = join(resolved, file);

    let st;
    try { st = await stat(jsonlFile); } catch { continue; }
    if (!st.isFile()) continue;

    const lastLine = await readLastJsonLine(jsonlFile);
    const stopReason = extractStopReason(lastLine);
    const interrupted = wasInterruptedByUser(lastLine);

    const meta = await readMeta(join(resolved, `agent-${id}.meta.json`));
    const agentType = sanitizeTermString(meta?.agentType ?? 'unknown');
    const description = typeof meta?.description === 'string' ? sanitizeTermString(meta.description) : undefined;

    const status: ToolStatus = (stopReason === 'end_turn' || interrupted) ? 'completed' : 'running';

    const startTimeMs = (st.birthtimeMs && st.birthtimeMs > 0) ? st.birthtimeMs : st.mtimeMs;
    const agent: AgentEntry = {
      id,
      type: agentType,
      status,
      startTime: new Date(startTimeMs),
    };
    if (description) agent.description = description;
    if (status === 'completed') agent.endTime = new Date(st.mtimeMs);
    collected.push({ agent, mtimeMs: st.mtimeMs });
  }

  // Sort oldest → newest by last-activity so the most recent N survive the
  // cap below. We use mtime rather than birthtime because birthtime is
  // unreliable across filesystems (often unset, can't be updated by tests).
  collected.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return collected.slice(-MAX_AGENTS).map(c => c.agent);
}

// Long-running sessions accumulate dozens of agent files; the statusline only
// surfaces a handful. Match the cap used by the main JSONL agent slice (in
// transcript.ts: `agentMap.values()).slice(-10)`).
const MAX_AGENTS = 10;
