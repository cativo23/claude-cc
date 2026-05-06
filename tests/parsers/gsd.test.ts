import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getGsdInfo, parseStateMd } from '../../src/parsers/gsd.js';

describe('parseStateMd', () => {
  it('parses YAML frontmatter (milestone, status, name)', () => {
    const content = `---
milestone: v2.0
milestone_name: "Automation Phase"
status: executing
---

# body`;
    const s = parseStateMd(content);
    expect(s.milestone).toBe('v2.0');
    expect(s.milestoneName).toBe('Automation Phase');
    expect(s.status).toBe('executing');
  });

  it('parses Phase: N of M (name) line', () => {
    const content = `---\nstatus: planning\n---\n\nPhase: 9 of 12 (multi-role-permissions)`;
    const s = parseStateMd(content);
    expect(s.phaseNum).toBe('9');
    expect(s.phaseTotal).toBe('12');
    expect(s.phaseName).toBe('multi-role-permissions');
  });

  it('falls back to body Status when frontmatter is absent', () => {
    const content = `# State\n\nStatus: Ready to plan phase 3`;
    expect(parseStateMd(content).status).toBe('planning');
  });

  it('picks up body Status even when Phase line is present but frontmatter has no status', () => {
    const content = `# State\n\nPhase: 2 of 5 (auth)\n\nStatus: Executing`;
    const s = parseStateMd(content);
    expect(s.phaseNum).toBe('2');
    expect(s.status).toBe('executing'); // was undefined before fix — body Status ignored when phaseMatch fired
  });

  it('treats `null` frontmatter values as absent', () => {
    const content = `---\nstatus: null\nmilestone: v1.0\n---`;
    const s = parseStateMd(content);
    expect(s.status).toBeUndefined();
    expect(s.milestone).toBe('v1.0');
  });
});

describe('getGsdInfo', () => {
  let dir: string;
  let claudeDir: string;
  let opts: { claudeDir: string; sharedCacheFile: string };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsd-cwd-'));
    claudeDir = mkdtempSync(join(tmpdir(), 'gsd-claude-'));
    mkdirSync(join(claudeDir, 'cache'), { recursive: true });
    // Point shared cache at a path inside claudeDir so tests don't read the
    // real ~/.cache/gsd on the dev machine.
    opts = { claudeDir, sharedCacheFile: join(claudeDir, 'shared-cache.json') };
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(claudeDir, { recursive: true, force: true });
  });

  it('returns null when no STATE.md and no update cache', () => {
    expect(getGsdInfo(dir, opts)).toBeNull();
  });

  it('reads update_available from legacy per-runtime cache', () => {
    writeFileSync(join(claudeDir, 'cache', 'gsd-update-check.json'), '{"update_available":true}');
    expect(getGsdInfo(dir, opts)?.updateAvailable).toBe(true);
  });

  it('reads GSD state from nearest .planning/STATE.md walking up from cwd', () => {
    const projectRoot = join(dir, 'project');
    const nested = join(projectRoot, 'src', 'deeply', 'nested');
    mkdirSync(join(projectRoot, '.planning'), { recursive: true });
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(projectRoot, '.planning', 'STATE.md'),
      `---\nmilestone: v1.2\nstatus: executing\n---\n\nPhase: 3 of 5 (auth)`,
    );
    const info = getGsdInfo(nested, opts);
    expect(info?.currentTask).toContain('v1.2');
    expect(info?.currentTask).toContain('executing');
    expect(info?.currentTask).toContain('auth (3/5)');
  });

  it('stops walking at home directory', () => {
    // cwd is a tmpdir outside any .planning ancestor
    expect(getGsdInfo(dir, opts)).toBeNull();
  });

  it('handles malformed JSON in cache gracefully', () => {
    writeFileSync(join(claudeDir, 'cache', 'gsd-update-check.json'), 'not json');
    expect(getGsdInfo(dir, opts)).toBeNull();
  });

  it('handles malformed STATE.md gracefully', () => {
    mkdirSync(join(dir, '.planning'), { recursive: true });
    writeFileSync(join(dir, '.planning', 'STATE.md'), '');
    expect(getGsdInfo(dir, opts)).toBeNull();
  });

  it('sanitizes control characters from formatted state', () => {
    mkdirSync(join(dir, '.planning'), { recursive: true });
    writeFileSync(
      join(dir, '.planning', 'STATE.md'),
      `---\nmilestone: v1.0\nmilestone_name: "Safe\x1b[31mPart\x00end"\nstatus: executing\n---`,
    );
    const task = getGsdInfo(dir, opts)?.currentTask ?? '';
    expect(task).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
    expect(task).toContain('Safe');
    expect(task).toContain('end');
  });
});
