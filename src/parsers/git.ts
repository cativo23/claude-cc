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

  const branch = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeoutMs: 2000 });
  if (!branch) return EMPTY_GIT;

  const result: GitStatus = { branch, staged: 0, modified: 0, untracked: 0 };
  const status = await exec('git', ['status', '--porcelain'], { cwd, timeoutMs: 2000 });
  if (status) {
    const lines = status.split('\n').filter(Boolean);
    // staged: index status is A/D/R/C/T (not space, not ?, not M which shows as modified)
    result.staged = lines.filter(l => l[0] !== ' ' && l[0] !== '?' && l[0] !== 'M').length;
    // modified: M in index (col 0) or worktree (col 1)
    result.modified = lines.filter(l => l[0] === 'M' || l[1] === 'M').length;
    result.untracked = lines.filter(l => l.startsWith('??')).length;
  }

  writeTtlCache(key, result, tmpdir());
  return result;
}
