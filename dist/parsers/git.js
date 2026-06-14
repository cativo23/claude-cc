import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { readTtlCache, writeTtlCache } from '../utils/cache.js';
import { safeExec } from '../utils/exec.js';
import { EMPTY_GIT } from '../types.js';
const GIT_CACHE_TTL = 5000;
function cacheKey(cwd) {
    return 'git-' + createHash('md5').update(cwd).digest('hex');
}
export async function parseGitStatus(cwd, exec = safeExec) {
    const key = cacheKey(cwd);
    const cached = readTtlCache(key, tmpdir(), GIT_CACHE_TTL);
    if (cached)
        return cached;
    const rawBranch = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeoutMs: 2000 });
    if (!rawBranch)
        return EMPTY_GIT;
    const branch = rawBranch.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
    const result = { branch, staged: 0, modified: 0, untracked: 0 };
    const status = await exec('git', ['status', '--porcelain'], { cwd, timeoutMs: 2000 });
    if (status) {
        const lines = status.split('\n').filter(Boolean);
        const UNMERGED = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);
        result.staged = lines.filter(l => l[0] !== ' ' && l[0] !== '?' && !UNMERGED.has(l.slice(0, 2))).length;
        // modified: worktree changes (col 1 = M or D)
        result.modified = lines.filter(l => l[1] === 'M' || l[1] === 'D').length;
        result.untracked = lines.filter(l => l.startsWith('??')).length;
    }
    writeTtlCache(key, result, tmpdir());
    return result;
}
//# sourceMappingURL=git.js.map