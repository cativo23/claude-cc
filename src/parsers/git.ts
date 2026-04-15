import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { readTtlCache, writeTtlCache } from '../utils/cache.js';
import { safeExec, type ExecOptions } from '../utils/exec.js';
import type { GitStatus } from '../types.js';
import { EMPTY_GIT } from '../types.js';

type ExecFn = (cmd: string, args: string[], opts?: ExecOptions) => Promise<string>;
const GIT_CACHE_TTL = 5000;

function cacheKey(cwd: string): string {
  return 'git-' + createHash('md5').update(cwd).digest('hex').slice(0, 8);
}

export async function parseGitStatus(cwd: string, exec: ExecFn = safeExec): Promise<GitStatus> {
  const key = cacheKey(cwd);
  const cached = readTtlCache<GitStatus>(key, tmpdir(), GIT_CACHE_TTL);
  if (cached) return cached;

  const rawBranch = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeoutMs: 2000 });
  if (!rawBranch) return EMPTY_GIT;
  const branch = rawBranch.replace(/[\x00-\x1f\x7f-\x9f]/g, '');

  const result: GitStatus = { branch, staged: 0, modified: 0, untracked: 0 };
  const status = await exec('git', ['status', '--porcelain'], { cwd, timeoutMs: 2000 });
  if (status) {
    const lines = status.split('\n').filter(Boolean);
    // staged: any non-space, non-? in col 0 means something is in the index
    result.staged = lines.filter(l => l[0] !== ' ' && l[0] !== '?').length;
    // modified: worktree changes (col 1 = M or D)
    result.modified = lines.filter(l => l[1] === 'M' || l[1] === 'D').length;
    result.untracked = lines.filter(l => l.startsWith('??')).length;
  }

  writeTtlCache(key, result, tmpdir());
  return result;
}
