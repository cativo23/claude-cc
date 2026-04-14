import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseGitStatus } from '../../src/parsers/git.js';
import { EMPTY_GIT } from '../../src/types.js';

// Clear cache before each test to avoid stale data
beforeEach(() => {
  vi.resetModules();
});

describe('parseGitStatus', () => {
  it('parses branch and porcelain output', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce('main')
      .mockResolvedValueOnce('M  file.ts\n?? new.ts\nA  added.ts');
    const result = await parseGitStatus('/test', exec);
    expect(result.branch).toBe('main');
    expect(result.staged).toBe(2);
    expect(result.modified).toBe(0);
    expect(result.untracked).toBe(1);
  });

  it('counts MM as both staged and modified', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce('dev')
      .mockResolvedValueOnce('MM file.ts\nA  added.ts\n M only-worktree.ts\nD  deleted.ts\n?? new.ts');
    const result = await parseGitStatus('/test2', exec);
    expect(result.staged).toBe(3);
    expect(result.modified).toBe(2);
    expect(result.untracked).toBe(1);
  });

  it('returns empty on empty branch', async () => {
    const exec = vi.fn().mockResolvedValue('');
    expect(await parseGitStatus('/not-a-repo', exec)).toEqual(EMPTY_GIT);
  });

  it('handles no changes', async () => {
    const exec = vi.fn().mockResolvedValueOnce('feature/test').mockResolvedValueOnce('');
    const result = await parseGitStatus('/clean', exec);
    expect(result.branch).toBe('feature/test');
    expect(result.staged).toBe(0);
  });


  it('ignores whitespace-only status output', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce('main')
      .mockResolvedValueOnce('   \n  ');
    const result = await parseGitStatus('/test-ws', exec);
    expect(result.staged).toBe(0);
    expect(result.modified).toBe(0);
    expect(result.untracked).toBe(0);
  });

});
