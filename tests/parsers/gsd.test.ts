import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getGsdInfo } from '../../src/parsers/gsd.js';

describe('getGsdInfo', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gsd-')); mkdirSync(join(dir, 'cache'), { recursive: true }); mkdirSync(join(dir, 'todos'), { recursive: true }); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns null when no data', () => { expect(getGsdInfo('s', dir)).toBeNull(); });
  it('detects update available', () => {
    writeFileSync(join(dir, 'cache', 'gsd-update-check.json'), '{"update_available":true}');
    expect(getGsdInfo('s', dir)?.updateAvailable).toBe(true);
  });
  it('reads current task', () => {
    writeFileSync(join(dir, 'todos', 's-agent-1.json'), JSON.stringify([{ status: 'in_progress', activeForm: 'Building X' }]));
    expect(getGsdInfo('s', dir)?.currentTask).toBe('Building X');
  });

  it('sanitizes session ID with special characters', () => {
    writeFileSync(join(dir, 'todos', 'abc-agent-1.json'), JSON.stringify([{ status: 'in_progress', activeForm: 'Task' }]));
    // ../evil gets sanitized to empty or safe string — should not match
    expect(getGsdInfo('../evil', dir)).toBeNull();
  });

  it('sanitizes session ID with slashes', () => {
    expect(getGsdInfo('../../etc/passwd', dir)).toBeNull();
  });

  it('handles malformed JSON in cache file', () => {
    writeFileSync(join(dir, 'cache', 'gsd-update-check.json'), 'not json');
    expect(getGsdInfo('s', dir)).toBeNull();
  });

  it('handles malformed JSON in todos file', () => {
    writeFileSync(join(dir, 'todos', 's-agent-1.json'), 'broken json');
    expect(getGsdInfo('s', dir)).toBeNull();
  });
});
