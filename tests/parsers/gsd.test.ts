import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getGsdInfo, parseStateMd } from '../../src/parsers/gsd.js';

// lumira mirrors GSD's own statusline (gsd-statusline.js v1.42.3) for all GSD
// content — same STATE.md field set, same update-cache semantics, same scenes.
// GSD is the source of truth; re-sync these tests when GSD's format changes.

describe('parseStateMd', () => {
  // ── frontmatter + phase + status ──────────────────────────────────────────
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
    const s = parseStateMd(`---\nstatus: planning\n---\n\nPhase: 9 of 12 (multi-role-permissions)`);
    expect(s.phaseNum).toBe('9');
    expect(s.phaseTotal).toBe('12');
    expect(s.phaseName).toBe('multi-role-permissions');
  });

  it('falls back to body Status when frontmatter is absent', () => {
    expect(parseStateMd(`# State\n\nStatus: Ready to plan phase 3`).status).toBe('planning');
  });

  it('picks up body Status even when a Phase line is present but frontmatter has no status', () => {
    const s = parseStateMd(`# State\n\nPhase: 2 of 5 (auth)\n\nStatus: Executing`);
    expect(s.phaseNum).toBe('2');
    expect(s.status).toBe('executing'); // body Status must not be ignored when phaseMatch fires
  });

  it('frontmatter status wins over body Status when both are present', () => {
    const s = parseStateMd(`---\nstatus: planning\n---\n\nPhase: 2 of 5 (auth)\n\nStatus: Executing`);
    expect(s.status).toBe('planning'); // frontmatter always wins; body Status is fallback only
    expect(s.phaseNum).toBe('2');
  });

  it('treats `null` frontmatter values as absent', () => {
    const s = parseStateMd(`---\nstatus: null\nmilestone: v1.0\n---`);
    expect(s.status).toBeUndefined();
    expect(s.milestone).toBe('v1.0');
  });

  // ── quote stripping ───────────────────────────────────────────────────────
  it('strips balanced double-quote pairs', () => {
    expect(parseStateMd(`---\nmilestone: "v1.0"\n---`).milestone).toBe('v1.0');
  });

  it('strips balanced single-quote pairs', () => {
    expect(parseStateMd(`---\nmilestone: 'v1.0'\n---`).milestone).toBe('v1.0');
  });

  it('preserves an unmatched leading quote', () => {
    expect(parseStateMd(`---\nmilestone: "foo\n---`).milestone).toBe('"foo');
  });

  it('preserves an unmatched trailing quote', () => {
    expect(parseStateMd(`---\nmilestone: foo"\n---`).milestone).toBe('foo"');
  });

  it('does not strip a mismatched quote pair', () => {
    expect(parseStateMd(`---\nmilestone: "foo'\n---`).milestone).toBe('"foo\'');
  });

  // ── GSD 1.42.3 lifecycle fields ───────────────────────────────────────────
  it('parses active_phase', () => {
    expect(parseStateMd(`---\nactive_phase: "4.5"\nstatus: executing\n---`).activePhase).toBe('4.5');
  });

  it('treats active_phase null/empty as absent', () => {
    expect(parseStateMd(`---\nactive_phase: null\n---`).activePhase).toBeUndefined();
    expect(parseStateMd(`---\nactive_phase:\n---`).activePhase).toBeUndefined();
  });

  it('parses next_action', () => {
    expect(parseStateMd(`---\nnext_action: execute-phase\n---`).nextAction).toBe('execute-phase');
  });

  it('parses next_phases in flow form [a, b]', () => {
    expect(parseStateMd(`---\nnext_phases: [4.5, 6]\n---`).nextPhases).toEqual(['4.5', '6']);
  });

  it('parses next_phases in block-list form', () => {
    expect(parseStateMd(`---\nnext_phases:\n  - "4.5"\n  - 6\n---`).nextPhases).toEqual(['4.5', '6']);
  });

  it('parses the nested progress block (completed/total/percent)', () => {
    const s = parseStateMd(`---\nprogress:\n  completed_phases: 3\n  total_phases: 6\n  percent: 50\n---`);
    expect(s.completedPhases).toBe('3');
    expect(s.totalPhases).toBe('6');
    expect(s.percent).toBe('50');
  });

  // ── gsd-core ≥ 1.4.x body fields (Plan, Resume file) ──────────────────────
  it('parses the compound Plan line "X of Y in current phase"', () => {
    const s = parseStateMd(`---\nstatus: executing\n---\n\nPhase: 16 of 5 (auth)\nPlan: 2 of 9 in current phase`);
    expect(s.planNum).toBe('2');
    expect(s.planTotal).toBe('9');
  });

  it('parses the bare Plan line "X of Y"', () => {
    const s = parseStateMd(`---\nstatus: executing\n---\n\nPlan: 3 of 7`);
    expect(s.planNum).toBe('3');
    expect(s.planTotal).toBe('7');
  });

  it('treats "Plan: —" (not started) as no plan progress', () => {
    const s = parseStateMd(`---\nstatus: planning\n---\n\nPlan: —`);
    expect(s.planNum).toBeUndefined();
    expect(s.planTotal).toBeUndefined();
  });

  it('parses a Resume file path', () => {
    const s = parseStateMd(`---\nstatus: executing\n---\n\nResume file: .planning/phases/16-x/16-UI-SPEC.md`);
    expect(s.resumeFile).toBe('.planning/phases/16-x/16-UI-SPEC.md');
  });

  it('treats "Resume file: None" as no resume file', () => {
    const s = parseStateMd(`---\nstatus: executing\n---\n\nResume file: None`);
    expect(s.resumeFile).toBeUndefined();
  });
});

describe('getGsdInfo', () => {
  let dir: string;
  let claudeDir: string;
  let opts: { claudeDir: string; sharedCacheFile: string; openGsdCacheFile: string };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsd-cwd-'));
    claudeDir = mkdtempSync(join(tmpdir(), 'gsd-claude-'));
    mkdirSync(join(claudeDir, 'cache'), { recursive: true });
    // Point all cache paths inside claudeDir so tests never read the real
    // ~/.cache/gsd on the dev machine.
    opts = {
      claudeDir,
      sharedCacheFile: join(claudeDir, 'shared-cache.json'),
      openGsdCacheFile: join(claudeDir, 'open-gsd-cache.json'),
    };
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(claudeDir, { recursive: true, force: true });
  });

  /** Write .planning/STATE.md at `dir` (or a nested subdir under it). */
  function writeState(content: string, subdir = ''): void {
    const root = subdir ? join(dir, subdir) : dir;
    mkdirSync(join(root, '.planning'), { recursive: true });
    writeFileSync(join(root, '.planning', 'STATE.md'), content);
  }
  /** Write the legacy per-runtime update-check cache. */
  function writeCache(json: string): void {
    writeFileSync(join(claudeDir, 'cache', 'gsd-update-check.json'), json);
  }
  /** Write the open-gsd per-package update-check cache (gsd-core ≥ 1.4.x). */
  function writeOpenGsdCache(json: string): void {
    writeFileSync(opts.openGsdCacheFile, json);
  }

  // ── signal gating ─────────────────────────────────────────────────────────
  it('returns null when there is no STATE.md ancestor and no update cache', () => {
    expect(getGsdInfo(dir, opts)).toBeNull();
  });

  it('reads update_available from the legacy per-runtime cache', () => {
    writeCache('{"update_available":true}');
    expect(getGsdInfo(dir, opts)?.updateAvailable).toBe(true);
  });

  it('reads update_available from the open-gsd per-package cache (gsd-core ≥ 1.4.x)', () => {
    writeOpenGsdCache('{"update_available":true,"installed":"1.4.5","latest":"1.5.0"}');
    expect(getGsdInfo(dir, opts)?.updateAvailable).toBe(true);
  });

  it('open-gsd cache takes priority over legacy shared cache', () => {
    writeOpenGsdCache('{"update_available":true}');
    writeCache('{"update_available":false}');
    expect(getGsdInfo(dir, opts)?.updateAvailable).toBe(true);
  });

  it('walks up from cwd to the nearest .planning/STATE.md', () => {
    writeState(`---\nmilestone: v1.2\nstatus: executing\n---\n\nPhase: 3 of 5 (auth)`, 'project');
    const info = getGsdInfo(join(dir, 'project', 'src', 'deeply', 'nested'), opts);
    expect(info?.currentTask).toContain('v1.2');
    expect(info?.currentTask).toContain('executing');
    expect(info?.currentTask).toContain('auth (3/5)');
  });

  // ── resilience ────────────────────────────────────────────────────────────
  it('treats malformed cache JSON as no update', () => {
    writeCache('not json');
    expect(getGsdInfo(dir, opts)).toBeNull();
  });

  it('treats an empty STATE.md as no state', () => {
    writeState('');
    expect(getGsdInfo(dir, opts)).toBeNull();
  });

  it('sanitizes control characters out of the formatted state', () => {
    writeState(`---\nmilestone: v1.0\nmilestone_name: "Safe\x1b[31mPart\x00end"\nstatus: executing\n---`);
    const task = getGsdInfo(dir, opts)?.currentTask ?? '';
    expect(task).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
    expect(task).toContain('Safe');
    expect(task).toContain('end');
  });

  // ── GSD 1.42.3 scenes (mirror gsd-statusline.js formatGsdState) ────────────
  it('renders a 10-segment progress bar in the milestone segment', () => {
    writeState(`---\nmilestone: v2.0\nmilestone_name: "Automation"\nprogress:\n  completed_phases: 3\n  total_phases: 6\n  percent: 50\n---`);
    expect(getGsdInfo(dir, opts)?.currentTask).toContain('v2.0 Automation █████░░░░░ 50%');
  });

  it('renders the active_phase scene: "Phase X <status>"', () => {
    writeState(`---\nmilestone: v2.0\nactive_phase: "4.5"\nstatus: executing\n---`);
    expect(getGsdInfo(dir, opts)?.currentTask).toContain('Phase 4.5 executing');
  });

  it('renders the idle next_action scene: "next <action> <phases>"', () => {
    writeState(`---\nmilestone: v2.0\nnext_action: execute-phase\nnext_phases: [4.5]\n---`);
    expect(getGsdInfo(dir, opts)?.currentTask).toContain('next execute-phase 4.5');
  });

  it('renders "milestone complete" at percent 100', () => {
    writeState(`---\nmilestone: v2.0\nprogress:\n  completed_phases: 6\n  total_phases: 6\n  percent: 100\n---`);
    expect(getGsdInfo(dir, opts)?.currentTask).toContain('milestone complete');
  });

  // ── gsd-core ≥ 1.4.x: plan progress + resume indicator (Option B) ──────────
  it('appends plan progress "pX/Y" to the phase scene', () => {
    writeState(`---\nstatus: executing\n---\n\nPhase: 3 of 5 (auth)\nPlan: 2 of 9 in current phase`);
    expect(getGsdInfo(dir, opts)?.currentTask).toContain('auth (3/5) p2/9');
  });

  it('appends plan progress to the active_phase scene', () => {
    writeState(`---\nactive_phase: "4.5"\nstatus: executing\n---\n\nPlan: 1 of 4`);
    expect(getGsdInfo(dir, opts)?.currentTask).toContain('Phase 4.5 executing p1/4');
  });

  it('sets hasResume when a Resume file is present', () => {
    writeState(`---\nstatus: executing\n---\n\nPhase: 3 of 5 (auth)\nResume file: .planning/phases/3-auth/UI-SPEC.md`);
    expect(getGsdInfo(dir, opts)?.hasResume).toBe(true);
  });

  it('leaves hasResume undefined when Resume file is None', () => {
    writeState(`---\nstatus: executing\n---\n\nPhase: 3 of 5 (auth)\nResume file: None`);
    expect(getGsdInfo(dir, opts)?.hasResume).toBeUndefined();
  });

  // Guard: lumira's bar percent must mirror GSD's frontmatter `percent` VERBATIM.
  // gsd-core ≥ 1.4.x computes percent = min(completed_plans/total_plans,
  // completed_phases/total_phases) × 100 (already plan-based). lumira must NOT
  // recompute it — if GSD ever changes its ceiling formula, this test catches
  // silent divergence rather than mirroring the wrong number.
  it('mirrors GSD frontmatter percent verbatim in the bar (does not recompute from plans)', () => {
    // plans 12/25 = 48%, but GSD already published percent: 20 (its min() formula).
    writeState(`---\nmilestone: v3.0\nmilestone_name: "X"\nprogress:\n  total_phases: 5\n  completed_phases: 1\n  total_plans: 25\n  completed_plans: 12\n  percent: 20\n---`);
    const task = getGsdInfo(dir, opts)?.currentTask ?? '';
    expect(task).toContain('20%');
    expect(task).not.toContain('48%');
  });

  it('preserves the default "<status> · <phase>" scene when no lifecycle fields are present', () => {
    writeState(`---\nmilestone: v1.2\nstatus: executing\n---\n\nPhase: 3 of 5 (auth)`);
    const task = getGsdInfo(dir, opts)?.currentTask ?? '';
    expect(task).toContain('executing');
    expect(task).toContain('auth (3/5)');
  });

  // ── stale hooks + dev-install detection ───────────────────────────────────
  it('reports staleHooks when the cache lists stale hooks', () => {
    writeCache('{"stale_hooks":["a.js"]}');
    expect(getGsdInfo(dir, opts)?.staleHooks).toBe(true);
  });

  it('flags a dev install when the installed version is ahead of latest', () => {
    writeCache('{"stale_hooks":["a.js"],"installed":"1.43.0","latest":"1.42.3"}');
    const info = getGsdInfo(dir, opts);
    expect(info?.staleHooks).toBe(true);
    expect(info?.devInstall).toBe(true);
  });

  it('does not flag a dev install when installed is behind latest', () => {
    writeCache('{"stale_hooks":["a.js"],"installed":"1.42.0","latest":"1.42.3"}');
    expect(getGsdInfo(dir, opts)?.devInstall).toBeFalsy();
  });

  it('does not flag a dev install when installed equals latest', () => {
    writeCache('{"stale_hooks":["a.js"],"installed":"1.42.3","latest":"1.42.3"}');
    expect(getGsdInfo(dir, opts)?.devInstall).toBeFalsy();
  });

  it('does not flag a dev install when latest is unknown', () => {
    writeCache('{"stale_hooks":["a.js"],"installed":"1.42.3","latest":"unknown"}');
    const info = getGsdInfo(dir, opts);
    expect(info?.staleHooks).toBe(true);
    expect(info?.devInstall).toBeFalsy();
  });
});
