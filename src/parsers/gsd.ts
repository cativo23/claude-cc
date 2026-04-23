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
}

/**
 * Parse .planning/STATE.md: YAML frontmatter + `Phase: N of M (name)` line.
 * Mirrors the format produced by the GSD CLI (get-shit-done >= 1.x).
 */
export function parseStateMd(content: string): GsdState {
  const state: GsdState = {};

  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const m = line.match(/^(\w+):\s*(.+)/);
      if (!m) continue;
      const [, key, val] = m;
      const v = val.trim().replace(/^["']|["']$/g, '');
      if (v === 'null') continue;
      if (key === 'status') state.status = v;
      else if (key === 'milestone') state.milestone = v;
      else if (key === 'milestone_name') state.milestoneName = v;
    }
  }

  const phaseMatch = content.match(/^Phase:\s*(\d+)\s+of\s+(\d+)(?:\s+\(([^)]+)\))?/m);
  if (phaseMatch) {
    state.phaseNum = phaseMatch[1];
    state.phaseTotal = phaseMatch[2];
    state.phaseName = phaseMatch[3];
  } else if (!state.status) {
    // Fallback: parse body Status line when frontmatter is absent
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

/** Walk up from `cwd` looking for `.planning/STATE.md`; stop at home or filesystem root. */
function findStateMd(cwd: string): string | null {
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
  if (s.milestone || s.milestoneName) {
    const ver = s.milestone ?? '';
    const name = s.milestoneName && s.milestoneName !== 'milestone' ? s.milestoneName : '';
    const ms = [ver, name].filter(Boolean).join(' ');
    if (ms) parts.push(ms);
  }
  if (s.status) parts.push(s.status);
  if (s.phaseNum && s.phaseTotal) {
    const phase = s.phaseName ? `${s.phaseName} (${s.phaseNum}/${s.phaseTotal})` : `ph ${s.phaseNum}/${s.phaseTotal}`;
    parts.push(phase);
  }
  return parts.join(' · ');
}

/**
 * Read GSD update-check cache. Checks the shared tool-agnostic cache first
 * (`~/.cache/gsd/`, introduced by GSD #1421), then falls back to the legacy
 * per-runtime location (`~/.claude/cache/`) for older GSD installs.
 */
function readUpdateCache(sharedCacheFile: string, legacyCacheFile: string): boolean {
  const candidates: Array<[string, string]> = [
    ['shared', sharedCacheFile],
    ['legacy', legacyCacheFile],
  ];
  for (const [source, file] of candidates) {
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as { update_available?: boolean };
      if (parsed.update_available) {
        log('update cache:', source, file);
        return true;
      }
    } catch { /* ignore malformed */ }
  }
  return false;
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
  const updateAvailable = readUpdateCache(sharedCacheFile, legacyCacheFile);

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

  if (!updateAvailable && !currentTask) return null;
  return { updateAvailable, currentTask };
}
