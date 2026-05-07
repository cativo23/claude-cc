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

  it('subagentsDirStateEqual treats two nulls as equal but null vs state as not equal', () => {
    expect(subagentsDirStateEqual(null, null)).toBe(true);
    expect(subagentsDirStateEqual(null, { count: 0, totalMtimeMs: 0, totalSize: 0 })).toBe(false);
    expect(subagentsDirStateEqual({ count: 1, totalMtimeMs: 100, totalSize: 50 }, { count: 1, totalMtimeMs: 100, totalSize: 50 })).toBe(true);
  });
});
