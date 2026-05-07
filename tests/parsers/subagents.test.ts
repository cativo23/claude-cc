import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseSubagentsDir, deriveSubagentsDir } from '../../src/parsers/subagents.js';

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

function writeAgent(dir: string, id: string, lastLine: object, mtimeSecondsAgo = 0, meta?: object): string {
  const jsonlPath = join(dir, `agent-${id}.jsonl`);
  writeFileSync(jsonlPath, JSON.stringify(lastLine) + '\n');
  if (meta) writeFileSync(join(dir, `agent-${id}.meta.json`), JSON.stringify(meta));
  if (mtimeSecondsAgo > 0) {
    const t = (Date.now() - mtimeSecondsAgo * 1000) / 1000;
    utimesSync(jsonlPath, t, t);
  }
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
});
