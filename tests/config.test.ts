import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, mergeCliFlags } from '../src/config.js';
import { DEFAULT_CONFIG } from '../src/types.js';

describe('loadConfig', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-cfg-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns defaults when no config', () => { expect(loadConfig(join(dir, 'nope'))).toEqual(DEFAULT_CONFIG); });
  it('merges partial config', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"layout":"minimal","display":{"model":false}}');
    const c = loadConfig(dir);
    expect(c.layout).toBe('minimal');
    expect(c.display.model).toBe(false);
    expect(c.display.branch).toBe(true);
  });
});

describe('mergeCliFlags', () => {
  it('overrides layout to minimal', () => { expect(mergeCliFlags(DEFAULT_CONFIG, ['node', 'i', '--minimal']).layout).toBe('minimal'); });
  it('enables gsd', () => { expect(mergeCliFlags(DEFAULT_CONFIG, ['node', 'i', '--gsd']).gsd).toBe(true); });
  it('no flags = unchanged', () => { expect(mergeCliFlags(DEFAULT_CONFIG, ['node', 'i'])).toEqual(DEFAULT_CONFIG); });
});
