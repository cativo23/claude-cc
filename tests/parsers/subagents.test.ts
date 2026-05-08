import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseSubagentsDir,
  deriveSubagentsDir,
  isNamedAgentType,
  getSubagentsDirState,
  subagentsDirStateEqual,
  GENERIC_AGENT_TYPES,
} from '../../src/parsers/subagents.js';

let workDir: string;

function makeSession(): { jsonlPath: string; subagentsDir: string } {
  // Lay out: <workDir>/<session-id>.jsonl + <workDir>/<session-id>/subagents/
  const sessionId = 'sess-test';
  const jsonlPath = join(workDir, `${sessionId}.jsonl`);
  writeFileSync(jsonlPath, '{}\n');
  const subagentsDir = join(workDir, sessionId, 'subagents');
  mkdirSync(subagentsDir, { recursive: true });
  return { jsonlPath, subagentsDir };
}

function writeAgent(
  dir: string,
  id: string,
  lastLine: Record<string, unknown>,
  mtimeSecondsAgo = 0,
  meta?: Record<string, unknown>,
): string {
  const jsonlPath = join(dir, `agent-${id}.jsonl`);
  writeFileSync(jsonlPath, JSON.stringify(lastLine) + '\n');
  if (meta) writeFileSync(join(dir, `agent-${id}.meta.json`), JSON.stringify(meta));
  if (mtimeSecondsAgo > 0) {
    const t = (Date.now() - mtimeSecondsAgo * 1000) / 1000;
    utimesSync(jsonlPath, t, t);
  }
  return jsonlPath;
}

function writeRawAgent(dir: string, id: string, body: string, meta?: Record<string, unknown>): string {
  const jsonlPath = join(dir, `agent-${id}.jsonl`);
  writeFileSync(jsonlPath, body);
  if (meta) writeFileSync(join(dir, `agent-${id}.meta.json`), JSON.stringify(meta));
  return jsonlPath;
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'lumira-subagents-'));
});
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('deriveSubagentsDir', () => {
  it('maps <session>.jsonl → <session>/subagents/', () => {
    expect(deriveSubagentsDir('/home/u/.claude/projects/proj/abc.jsonl'))
      .toBe('/home/u/.claude/projects/proj/abc/subagents');
  });
  it('strips uppercase .JSONL extensions case-insensitively', () => {
    expect(deriveSubagentsDir('/home/u/proj/abc.JSONL'))
      .toBe('/home/u/proj/abc/subagents');
    expect(deriveSubagentsDir('/home/u/proj/abc.Jsonl'))
      .toBe('/home/u/proj/abc/subagents');
  });
});

describe('parseSubagentsDir', () => {
  it('returns empty when subagents dir does not exist', async () => {
    const jsonlPath = join(workDir, 'no-session.jsonl');
    writeFileSync(jsonlPath, '{}\n');
    expect(await parseSubagentsDir(jsonlPath)).toEqual([]);
  });

  it('returns empty when jsonlPath is falsy', async () => {
    expect(await parseSubagentsDir('')).toEqual([]);
  });

  it('refuses dirs outside allowed roots (homedir, tmpdir)', async () => {
    expect(await parseSubagentsDir('/etc/passwd.jsonl')).toEqual([]);
  });

  it('marks an agent as completed when last line has stop_reason=end_turn', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'a1',
      { agentId: 'a1', message: { role: 'assistant', stop_reason: 'end_turn' } },
      0,
      { agentType: 'pepito', description: 'test agent' },
    );
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('a1');
    expect(agents[0].status).toBe('completed');
    expect(agents[0].type).toBe('pepito');
    expect(agents[0].description).toBe('test agent');
  });

  it('marks an agent as running when no stop_reason and mtime is fresh', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'r1',
      { agentId: 'r1', message: { role: 'assistant', stop_reason: null } },
    );
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents).toHaveLength(1);
    expect(agents[0].status).toBe('running');
  });

  it('marks an agent as completed when last line is "[Request interrupted by user…]"', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'k1',
      { type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } },
    );
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].status).toBe('completed');
  });

  it('keeps an agent as running when stop_reason is "tool_use" (waiting for a long tool)', async () => {
    // A subagent that yields to a long-running tool (e.g. a 5-minute heartbeat
    // bash) writes its last JSONL line with stop_reason: "tool_use" and goes
    // silent until the tool returns. Earlier versions used an mtime-based
    // grace window that would flip these to "completed" — this test guards
    // against that regression.
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 't1',
      { agentId: 't1', message: { role: 'assistant', stop_reason: 'tool_use' } },
      300,
    );
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].status).toBe('running');
  });

  it('falls back to type "unknown" when meta sidecar is missing', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'm1',
      { agentId: 'm1', message: { role: 'assistant', stop_reason: 'end_turn' } },
    );
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].type).toBe('unknown');
    expect(agents[0].description).toBeUndefined();
  });

  it('ignores files that do not match agent-<id>.jsonl', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeFileSync(join(subagentsDir, 'random.txt'), 'noise');
    writeFileSync(join(subagentsDir, 'agent-x.meta.json'), '{}');
    expect(await parseSubagentsDir(jsonlPath)).toEqual([]);
  });

  it('returns multiple agents in oldest-first order', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'old',
      { agentId: 'old', message: { role: 'assistant', stop_reason: 'end_turn' } },
      120,
    );
    writeAgent(subagentsDir, 'new',
      { agentId: 'new', message: { role: 'assistant', stop_reason: 'end_turn' } },
      0,
    );
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents.map(a => a.id)).toEqual(['old', 'new']);
  });

  it('caps the result at MAX_AGENTS, keeping the most recently active', async () => {
    // Long-running sessions accumulate dozens of agent files. The slice cap
    // (MAX_AGENTS = 10) must keep the freshest mtimes — a 12-agent session
    // should drop the two oldest, never the newest two.
    const { jsonlPath, subagentsDir } = makeSession();
    for (let i = 0; i < 12; i++) {
      writeAgent(subagentsDir, `id${i}`,
        { agentId: `id${i}`, message: { role: 'assistant', stop_reason: 'end_turn' } },
        12 - i, // oldest first (mtime longest-ago), newest last
      );
    }
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents).toHaveLength(10);
    // The 10 newest are id2..id11; id0 and id1 must have been dropped.
    const returnedIds = agents.map(a => a.id);
    expect(returnedIds).not.toContain('id0');
    expect(returnedIds).not.toContain('id1');
    expect(returnedIds).toContain('id11');
  });

  it('treats an empty JSONL file as running (no end_turn marker)', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeRawAgent(subagentsDir, 'e1', '');
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents).toHaveLength(1);
    expect(agents[0].status).toBe('running');
  });

  it('treats a whitespace-only JSONL file as running and does not throw', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeRawAgent(subagentsDir, 'w1', '   \n\n   \n');
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].status).toBe('running');
  });

  it('does NOT mark interrupted when the marker is on an earlier line and a different line follows', async () => {
    // Robustness: `wasInterruptedByUser` only inspects the last non-empty
    // line. A historical interrupt followed by a new assistant message must
    // be evaluated against the new last line, not the old marker.
    const { jsonlPath, subagentsDir } = makeSession();
    const interruptLine = JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } });
    const newLine = JSON.stringify({ agentId: 'i1', type: 'assistant', message: { role: 'assistant', stop_reason: 'tool_use' } });
    writeRawAgent(subagentsDir, 'i1', `${interruptLine}\n${newLine}\n`);
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].status).toBe('running');
  });

  it('falls back to type "unknown" when meta sidecar contains invalid JSON', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'b1',
      { agentId: 'b1', message: { role: 'assistant', stop_reason: 'end_turn' } },
    );
    writeFileSync(join(subagentsDir, 'agent-b1.meta.json'), '{not json');
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].type).toBe('unknown');
    expect(agents[0].description).toBeUndefined();
  });

  it('falls back to type "unknown" when meta agentType is not a string', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'b2',
      { agentId: 'b2', message: { role: 'assistant', stop_reason: 'end_turn' } },
      0,
      { agentType: { evil: 'object' }, description: 42 } as unknown as Record<string, unknown>,
    );
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].type).toBe('unknown');
    expect(agents[0].description).toBeUndefined();
  });

  it('uses the JSONL line timestamp for endTime when available', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    const ts = '2026-05-07T18:30:00.000Z';
    writeAgent(subagentsDir, 'ts1',
      { agentId: 'ts1', timestamp: ts, message: { role: 'assistant', stop_reason: 'end_turn' } },
    );
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].endTime?.toISOString()).toBe(ts);
  });

  it('falls back to file mtime when the JSONL timestamp is malformed', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'badts',
      { agentId: 'badts', timestamp: 'not-a-date', message: { role: 'assistant', stop_reason: 'end_turn' } },
    );
    const agents = await parseSubagentsDir(jsonlPath);
    // endTime is still a valid Date (file mtime) — never NaN.
    expect(agents[0].endTime).toBeInstanceOf(Date);
    expect(Number.isFinite(agents[0].endTime!.getTime())).toBe(true);
  });

  it('falls back to file mtime for startTime when first JSONL line has no timestamp field', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'no-ts',
      // No `timestamp` field — extractTimestamp returns null and mtime is used.
      { agentId: 'no-ts', message: { role: 'assistant', stop_reason: 'end_turn' } },
    );
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].startTime).toBeInstanceOf(Date);
    expect(Number.isFinite(agents[0].startTime.getTime())).toBe(true);
  });

  it('ignores non-text content blocks when checking for the interrupt marker', async () => {
    // A mixed content array (e.g. image + text) must still trigger the
    // marker check on the text block. Documents the safety of the
    // `typeof text === 'string'` guard against non-text blocks.
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'mix1', {
      type: 'user',
      message: { role: 'user', content: [
        { type: 'image', source: { data: 'fake' } },
        { type: 'text', text: '[Request interrupted by user]' },
      ] },
    });
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].status).toBe('completed');
  });

  it('handles a large JSONL via head/tail chunked reads (>64 KB threshold)', async () => {
    // Subagent transcripts can grow into the megabytes when the agent
    // runs many tool calls. The boundary reader streams via head/tail
    // chunks instead of slurping. This test fabricates a >64 KB file
    // with a recognisable first and last line and verifies both
    // start/end timestamps + completion status survive the chunked path.
    const { jsonlPath, subagentsDir } = makeSession();
    const startTs = '2026-05-07T18:00:00.000Z';
    const endTs = '2026-05-07T18:10:00.000Z';
    const first = JSON.stringify({ agentId: 'big', timestamp: startTs, type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'go' }] } });
    const last = JSON.stringify({ agentId: 'big', timestamp: endTs, type: 'assistant', message: { role: 'assistant', stop_reason: 'end_turn' } });
    // Pad the middle with ~80 KB of junk lines.
    const junkLines = Array.from({ length: 4000 }, (_, i) => `noise line ${i} `.repeat(8));
    // Sanity-check the assumption: junk lines must NOT be valid JSON,
    // otherwise the test passes for the wrong reason (parser would lock
    // onto the first junk line instead of falling through to `first`).
    expect(() => JSON.parse(junkLines[0])).toThrow();
    writeRawAgent(subagentsDir, 'big', `${first}\n${junkLines.join('\n')}\n${last}\n`);
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('big');
    expect(agents[0].status).toBe('completed');
    expect(agents[0].startTime.toISOString()).toBe(startTs);
    expect(agents[0].endTime?.toISOString()).toBe(endTs);
  });

  it('falls back gracefully when the FIRST JSONL line exceeds the head chunk window (>64 KB)', async () => {
    // A first line larger than the 64 KB head buffer can't be JSON.parse'd
    // by parseFirstJson — extractTimestamp returns null and startTime
    // falls back to mtime. The last line (small) is still parseable so
    // status detection still works.
    const { jsonlPath, subagentsDir } = makeSession();
    const endTs = '2026-05-07T18:10:00.000Z';
    const huge = JSON.stringify({ agentId: 'fat-first', timestamp: '2026-05-07T18:00:00.000Z', message: { content: 'x'.repeat(70_000) } });
    const last = JSON.stringify({ agentId: 'fat-first', timestamp: endTs, message: { role: 'assistant', stop_reason: 'end_turn' } });
    const pad = 'p'.repeat(200_000);
    writeRawAgent(subagentsDir, 'fat-first', `${huge}\n${pad}\n${last}\n`);
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].status).toBe('completed');
    expect(agents[0].endTime?.toISOString()).toBe(endTs);
    // startTime fell back to mtime — Date is finite, never NaN.
    expect(Number.isFinite(agents[0].startTime.getTime())).toBe(true);
  });

  it('marks a completed agent as running when the LAST JSONL line exceeds the tail chunk window (>64 KB)', async () => {
    // Documents the only known semantic regression of the chunked-read
    // path: a closing assistant message bigger than 64 KB hides its
    // stop_reason from the tail-window parser, so the agent appears
    // permanently "running". The previous 16 KB chunk hit this in
    // production for a long Opus review (~18 KB last line); the 64 KB
    // chunk gives ~3.5× headroom but the failure mode itself remains
    // possible if Claude Code routinely emits huge close-out messages.
    const { jsonlPath, subagentsDir } = makeSession();
    const first = JSON.stringify({ agentId: 'fat-last', timestamp: '2026-05-07T18:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'go' }] } });
    const huge = JSON.stringify({ agentId: 'fat-last', timestamp: '2026-05-07T18:10:00.000Z', message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'tool_use', id: 'x', name: 'Y', input: { v: 'x'.repeat(80_000) } }] } });
    const pad = 'p'.repeat(200_000);
    writeRawAgent(subagentsDir, 'fat-last', `${first}\n${pad}\n${huge}\n`);
    const agents = await parseSubagentsDir(jsonlPath);
    // stop_reason is unreachable AND content carries a tool_use block →
    // even the text-only finalization heuristic can't rescue it. The
    // agent appears running. Documented regression.
    expect(agents[0].status).toBe('running');
  });

  it('marks an agent completed when last assistant message is text-only and stop_reason is null/missing', async () => {
    // Claude Code occasionally finalises a subagent's JSONL with
    // stop_reason: null on the closing assistant message even though the
    // agent has obviously finished — the text body is right there. The
    // tell-apart from a "running, waiting on tool" line is whether the
    // content has a tool_use block; running agents always do. This test
    // pins the heuristic that rescues those zombies.
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'null-sr', {
      type: 'assistant',
      message: {
        role: 'assistant',
        stop_reason: null,
        content: [{ type: 'text', text: 'final response, no tool_use, just text' }],
      },
    });
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].status).toBe('completed');
  });

  it('keeps an agent running when last assistant content has a tool_use block, regardless of stop_reason', async () => {
    // Inverse guard for the heuristic above — a tool_use block in the
    // last assistant content is the signal of a running agent waiting
    // on a tool result.
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'tool-wait', {
      type: 'assistant',
      message: {
        role: 'assistant',
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: "I'll run a bash command." },
          { type: 'tool_use', id: 'tool-x', name: 'Bash', input: { command: 'sleep 30' } },
        ],
      },
    });
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].status).toBe('running');
  });

  it('uses the first JSONL line timestamp for startTime, not the file mtime', async () => {
    // For a long-running agent, file mtime points at the close-out (end_turn
    // write), which is wrong as a "started at" value. The first line's
    // dispatch timestamp is the correct source.
    const { jsonlPath, subagentsDir } = makeSession();
    const startTs = '2026-05-07T18:00:00.000Z';
    const endTs = '2026-05-07T18:05:00.000Z';
    const lines = [
      JSON.stringify({ agentId: 'long', timestamp: startTs, type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'go' }] } }),
      JSON.stringify({ agentId: 'long', timestamp: endTs, type: 'assistant', message: { role: 'assistant', stop_reason: 'end_turn' } }),
    ].join('\n') + '\n';
    writeRawAgent(subagentsDir, 'long', lines);
    const agents = await parseSubagentsDir(jsonlPath);
    expect(agents[0].startTime.toISOString()).toBe(startTs);
    expect(agents[0].endTime?.toISOString()).toBe(endTs);
  });
});

describe('isNamedAgentType', () => {
  it('returns true for user-defined types', () => {
    expect(isNamedAgentType('pepito')).toBe(true);
    expect(isNamedAgentType('feature-dev:code-reviewer')).toBe(true);
  });
  it('returns false for generic dispatches', () => {
    expect(isNamedAgentType('general-purpose')).toBe(false);
    expect(isNamedAgentType('unknown')).toBe(false);
  });
  it('returns false for empty / nullish input', () => {
    expect(isNamedAgentType('')).toBe(false);
    expect(isNamedAgentType(undefined)).toBe(false);
    expect(isNamedAgentType(null)).toBe(false);
  });
  it('matches case-sensitively (treats different casing as named)', () => {
    // Documents the case-sensitive contract: if Claude Code emits
    // "General-Purpose" or "UNKNOWN", we treat them as user-defined names.
    // If the upstream type-string casing ever drifts, this test will fail
    // and the GENERIC_AGENT_TYPES set should be updated.
    expect(isNamedAgentType('General-Purpose')).toBe(true);
    expect(isNamedAgentType('UNKNOWN')).toBe(true);
  });
});

describe('GENERIC_AGENT_TYPES', () => {
  it('contains the canonical anonymous dispatch types', () => {
    // Pinning the exported contract so a future addition to the set
    // doesn't silently change behaviour without updating this test.
    expect(GENERIC_AGENT_TYPES.has('general-purpose')).toBe(true);
    expect(GENERIC_AGENT_TYPES.has('unknown')).toBe(true);
  });
  it('is in agreement with isNamedAgentType for every member', () => {
    for (const t of GENERIC_AGENT_TYPES) expect(isNamedAgentType(t)).toBe(false);
  });
});

describe('getSubagentsDirState + subagentsDirStateEqual', () => {
  it('returns null when the dir does not exist', async () => {
    const jsonlPath = join(workDir, 'nope.jsonl');
    writeFileSync(jsonlPath, '{}\n');
    expect(await getSubagentsDirState(jsonlPath)).toBeNull();
  });

  it('returns null for falsy paths', async () => {
    expect(await getSubagentsDirState('')).toBeNull();
  });

  it('returns null for paths outside allowed roots', async () => {
    expect(await getSubagentsDirState('/etc/passwd.jsonl')).toBeNull();
  });

  it('reflects file count, total size and aggregate mtime', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 's1',
      { agentId: 's1', message: { role: 'assistant', stop_reason: 'end_turn' } },
    );
    const state1 = await getSubagentsDirState(jsonlPath);
    expect(state1?.count).toBe(1);
    expect(state1?.totalSize).toBeGreaterThan(0);

    writeAgent(subagentsDir, 's2',
      { agentId: 's2', message: { role: 'assistant', stop_reason: 'end_turn' } },
    );
    const state2 = await getSubagentsDirState(jsonlPath);
    expect(state2?.count).toBe(2);
    expect(subagentsDirStateEqual(state1, state2)).toBe(false);
  });

  it('returns a zero-count state (not null) when the dir exists but has no agent files', async () => {
    // A dir with only sidecars or unrelated files should still be detected
    // as "exists but empty" — count=0, totals=0 — distinct from null which
    // means "no dir at all". The cache check distinguishes these so an
    // empty dir doesn't masquerade as a missing one.
    const { jsonlPath, subagentsDir } = makeSession();
    writeFileSync(join(subagentsDir, 'noise.txt'), 'irrelevant');
    writeFileSync(join(subagentsDir, 'agent-x.meta.json'), '{}');
    const state = await getSubagentsDirState(jsonlPath);
    expect(state).not.toBeNull();
    expect(state?.count).toBe(0);
    expect(state?.maxMtimeMs).toBe(0);
    expect(state?.totalSize).toBe(0);
  });

  it('returns null when the path resolves to a regular file instead of a directory', async () => {
    // If something has stuffed a file where the subagents dir would live,
    // readdir throws ENOTDIR. The fingerprint should treat that the same
    // as a missing dir.
    const sessionId = 'sess-file-not-dir';
    const jsonlPath = join(workDir, `${sessionId}.jsonl`);
    writeFileSync(jsonlPath, '{}\n');
    mkdirSync(join(workDir, sessionId), { recursive: true });
    writeFileSync(join(workDir, sessionId, 'subagents'), 'this is a file, not a dir');
    expect(await getSubagentsDirState(jsonlPath)).toBeNull();
  });

  it('changes maxMtimeMs (not just totalSize) when an existing file is modified in place at a later mtime', async () => {
    const { jsonlPath, subagentsDir } = makeSession();
    writeAgent(subagentsDir, 'm1',
      { agentId: 'm1', message: { role: 'assistant', stop_reason: 'tool_use' } },
      10,
    );
    const before = await getSubagentsDirState(jsonlPath);

    // Same id, fresh mtime, different (longer) body
    writeAgent(subagentsDir, 'm1',
      { agentId: 'm1', message: { role: 'assistant', stop_reason: 'end_turn', text: 'much longer body to widen totalSize' } },
    );
    const after = await getSubagentsDirState(jsonlPath);
    expect(after?.count).toBe(before?.count);
    expect(after?.maxMtimeMs).toBeGreaterThan(before?.maxMtimeMs ?? 0);
  });

  it('subagentsDirStateEqual treats two nulls as equal but null vs state as not equal', () => {
    expect(subagentsDirStateEqual(null, null)).toBe(true);
    expect(subagentsDirStateEqual(null, { count: 0, maxMtimeMs: 0, totalSize: 0 })).toBe(false);
    expect(subagentsDirStateEqual({ count: 1, maxMtimeMs: 100, totalSize: 50 }, { count: 1, maxMtimeMs: 100, totalSize: 50 })).toBe(true);
  });
});
