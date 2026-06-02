import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { GsdInfo } from '../types.js';
import { sanitizeTermString } from '../normalize.js';
import { debug } from '../utils/debug.js';

const log = debug('gsd');

// Max directory levels to walk upward looking for .planning/STATE.md
const STATE_WALK_MAX = 10;

interface GsdState {
  status?: string;
  milestone?: string;
  milestoneName?: string;
  phaseNum?: string;
  phaseTotal?: string;
  phaseName?: string;
  activePhase?: string;
  nextAction?: string;
  nextPhases?: string[];
  completedPhases?: string;
  totalPhases?: string;
  percent?: string;
}

/**
 * Parse .planning/STATE.md: YAML frontmatter + `Phase: N of M (name)` line.
 * Mirrors the format produced by the GSD CLI (get-shit-done >= 1.x).
 */
export function parseStateMd(content: string): GsdState {
  const state: GsdState = {};

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fmText = fmMatch[1];

    // Parse simple scalar fields
    for (const line of fmText.split('\n')) {
      const m = line.match(/^(\w+):\s*(.+)/);
      if (!m) continue;
      const [, key, val] = m;
      const v = val.trim().replace(/^(["'])(.*)\1$/, '$2');
      if (v === 'null' || v === '') continue;
      if (key === 'status') state.status = v;
      else if (key === 'milestone') state.milestone = v;
      else if (key === 'milestone_name') state.milestoneName = v;
      else if (key === 'active_phase') state.activePhase = v;
      else if (key === 'next_action') state.nextAction = v;
    }

    // Parse next_phases: flow form [a, b]
    const flowMatch = fmText.match(/^next_phases:\s*\[([^\]]*)\]/m);
    if (flowMatch && flowMatch[1]) {
      const items = flowMatch[1].split(',').map(s => {
        const trimmed = s.trim().replace(/^(["'])(.*)\1$/, '$2');
        return trimmed;
      }).filter(s => s.length > 0);
      if (items.length > 0) state.nextPhases = items;
    }

    // Parse next_phases: block-list form
    if (!state.nextPhases) {
      const blockMatch = fmText.match(/^next_phases:\s*\n((?:[ \t]*-[ \t]*[^\n]+\n?)*)/m);
      if (blockMatch && blockMatch[1]) {
        const items: string[] = [];
        for (const itemLine of blockMatch[1].split('\n')) {
          const itemM = itemLine.match(/^[ \t]*-[ \t]*(.+)/);
          if (itemM) {
            const itemVal = itemM[1].trim().replace(/^(["'])(.*)\1$/, '$2');
            if (itemVal) items.push(itemVal);
          }
        }
        if (items.length > 0) state.nextPhases = items;
      }
    }

    // Parse progress block
    const progressMatch = fmText.match(/^progress:\s*\n((?:[ \t]+\w+:.+\n?)+)/m);
    if (progressMatch && progressMatch[1]) {
      const progressText = progressMatch[1];
      const completedM = progressText.match(/completed_phases:\s*(\d+)/);
      if (completedM) state.completedPhases = completedM[1];
      const totalM = progressText.match(/total_phases:\s*(\d+)/);
      if (totalM) state.totalPhases = totalM[1];
      const percentM = progressText.match(/percent:\s*(\d+)/);
      if (percentM) state.percent = percentM[1];
    }
  }

  const phaseMatch = content.match(/^Phase:\s*(\d+)\s+of\s+(\d+)(?:\s+\(([^)]+)\))?/m);
  if (phaseMatch) {
    state.phaseNum = phaseMatch[1];
    state.phaseTotal = phaseMatch[2];
    state.phaseName = phaseMatch[3];
  }
  if (!state.status) {
    // Fallback: parse body Status line when frontmatter status is missing
    const bodyStatus = content.match(/^Status:\s*(.+)/m);
    if (bodyStatus) {
      const raw = bodyStatus[1].trim().toLowerCase();
      if (raw.includes('ready to plan') || raw.includes('planning')) state.status = 'planning';
      else if (raw.includes('execut')) state.status = 'executing';
      else if (raw.includes('complet') || raw.includes('archived')) state.status = 'complete';
    }
  }

  return state;
}

/** Render a 10-segment progress bar: █████░░░░░ 50%. */
function renderProgressBar(percent: string | number | undefined): string {
  if (percent === undefined || percent === null) return '';
  const pct = Math.max(0, Math.min(100, parseInt(String(percent), 10)));
  if (isNaN(pct)) return '';
  const filled = Math.floor(pct / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  return `${bar} ${pct}%`;
}

/** Walk up from `cwd` looking for `.planning/STATE.md`; stop at home or filesystem root. */
export function findStateMd(cwd: string): string | null {
  const home = homedir();
  let current = resolve(cwd);
  for (let i = 0; i < STATE_WALK_MAX; i++) {
    const candidate = join(current, '.planning', 'STATE.md');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current || current === home) break;
    current = parent;
  }
  return null;
}

/** Format a GSD state into a compact status string: `milestone · status · phase`. */
function formatState(s: GsdState): string {
  const parts: string[] = [];

  // Milestone segment with optional progress bar
  if (s.milestone || s.milestoneName) {
    const ver = s.milestone ?? '';
    const name = s.milestoneName && s.milestoneName !== 'milestone' ? s.milestoneName : '';
    const bar = renderProgressBar(s.percent);
    const msParts = [ver, name, bar].filter(Boolean);
    if (msParts.length > 0) parts.push(msParts.join(' '));
  }

  // Scene selection: activePhase → nextAction → milestone-complete → default
  const phasesStr = s.nextPhases?.length ? s.nextPhases.join('/') : null;

  if (s.activePhase) {
    // Scene 1: activePhase (with optional status)
    parts.push(s.status ? `Phase ${s.activePhase} ${s.status}` : `Phase ${s.activePhase}`);
  } else if (s.nextAction && phasesStr) {
    // Scene 2: nextAction + phases when idle
    parts.push(`next ${s.nextAction} ${phasesStr}`);
  } else if (Number(s.percent) === 100 || (s.completedPhases && s.totalPhases && s.completedPhases === s.totalPhases)) {
    // Scene 3: milestone complete
    parts.push('milestone complete');
  } else {
    // Scene 4 (default): preserve existing behavior
    if (s.status) parts.push(s.status);
    if (s.phaseNum && s.phaseTotal) {
      const phase = s.phaseName ? `${s.phaseName} (${s.phaseNum}/${s.phaseTotal})` : `ph ${s.phaseNum}/${s.phaseTotal}`;
      parts.push(phase);
    }
  }

  return parts.join(' · ');
}

/** Compare two semver versions. Returns 1 if a > b, -1 if a < b, 0 if equal. */
function semverCompare(a: string, b: string): number {
  const parseVer = (v: string) => {
    const parts = v.replace(/^v/, '').split('.').map(p => parseInt(p, 10));
    return { major: parts[0] ?? 0, minor: parts[1] ?? 0, patch: parts[2] ?? 0 };
  };
  const av = parseVer(a);
  const bv = parseVer(b);
  if (av.major !== bv.major) return av.major > bv.major ? 1 : -1;
  if (av.minor !== bv.minor) return av.minor > bv.minor ? 1 : -1;
  if (av.patch !== bv.patch) return av.patch > bv.patch ? 1 : -1;
  return 0;
}

interface CacheData {
  updateAvailable: boolean;
  staleHooks: boolean;
  devInstall: boolean;
}

/**
 * Read GSD update-check cache. Checks the shared tool-agnostic cache first
 * (`~/.cache/gsd/`, introduced by GSD #1421), then falls back to the legacy
 * per-runtime location (`~/.claude/cache/`) for older GSD installs.
 * Returns update status, stale hooks flag, and dev install flag.
 */
function readUpdateCache(sharedCacheFile: string, legacyCacheFile: string): CacheData {
  const result: CacheData = { updateAvailable: false, staleHooks: false, devInstall: false };
  const candidates: Array<[string, string]> = [
    ['shared', sharedCacheFile],
    ['legacy', legacyCacheFile],
  ];
  for (const [source, file] of candidates) {
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
        update_available?: boolean;
        stale_hooks?: string[];
        installed?: string;
        latest?: string;
      };
      if (parsed.update_available) {
        result.updateAvailable = true;
        log('update cache:', source, file);
      }
      if (Array.isArray(parsed.stale_hooks) && parsed.stale_hooks.length > 0) {
        result.staleHooks = true;
      }
      // DevInstall: stale_hooks present AND installed > latest
      if (result.staleHooks && parsed.installed && parsed.latest) {
        if (semverCompare(parsed.installed, parsed.latest) > 0) {
          result.devInstall = true;
        }
      }
      return result;
    } catch { /* ignore malformed */ }
  }
  return result;
}

export interface GsdInfoOptions {
  /** Per-runtime claude config dir (holds `cache/gsd-update-check.json` in old GSD). */
  claudeDir?: string;
  /** Tool-agnostic shared cache file path. Overridable for tests. */
  sharedCacheFile?: string;
}

export function getGsdInfo(cwd: string, opts: GsdInfoOptions = {}): GsdInfo | null {
  const claudeDir = opts.claudeDir ?? process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude');
  const sharedCacheFile = opts.sharedCacheFile ?? join(homedir(), '.cache', 'gsd', 'gsd-update-check.json');
  const legacyCacheFile = join(claudeDir, 'cache', 'gsd-update-check.json');
  const cacheData = readUpdateCache(sharedCacheFile, legacyCacheFile);

  let currentTask: string | undefined;
  const stateFile = findStateMd(cwd || process.cwd());
  if (stateFile) {
    log('STATE.md found:', stateFile);
    try {
      const state = parseStateMd(readFileSync(stateFile, 'utf8'));
      const formatted = formatState(state);
      if (formatted) {
        currentTask = sanitizeTermString(formatted);
        log('state parsed:', state);
      }
    } catch (err) {
      log('STATE.md parse error:', (err as Error).message);
    }
  } else {
    log('no STATE.md found walking up from:', cwd || process.cwd());
  }

  if (!cacheData.updateAvailable && !cacheData.staleHooks && !currentTask) {
    log('no gsd signal — update=false, staleHooks=false, task=none (line4 will be empty)');
    return null;
  }
  return {
    updateAvailable: cacheData.updateAvailable || undefined,
    staleHooks: cacheData.staleHooks || undefined,
    devInstall: cacheData.devInstall || undefined,
    currentTask,
  };
}
