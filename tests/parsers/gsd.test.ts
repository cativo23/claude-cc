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
});
