import { describe, it, expect } from 'vitest';
import { safeExec } from '../../src/utils/exec.js';

describe('safeExec', () => {
  it('returns trimmed stdout on success', async () => {
    const result = await safeExec('echo', ['hello world']);
    expect(result).toBe('hello world');
  });
  it('returns empty string on command failure', async () => {
    const result = await safeExec('false', []);
    expect(result).toBe('');
  });
  it('returns empty string on non-existent command', async () => {
    const result = await safeExec('nonexistent-command-xyz', []);
    expect(result).toBe('');
  });
  it('respects timeout', async () => {
    const result = await safeExec('sleep', ['10'], { timeoutMs: 100 });
    expect(result).toBe('');
  });
  it('passes cwd option', async () => {
    const result = await safeExec('pwd', [], { cwd: '/tmp' });
    expect(result).toBe('/tmp');
  });
});
