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

  it('parses preset from config', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"balanced"}');
    expect(loadConfig(dir).preset).toBe('balanced');
  });
  it('ignores invalid preset', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"fancy"}');
    expect(loadConfig(dir).preset).toBeUndefined();
  });
  it('parses theme string', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"theme":"catppuccin"}');
    expect(loadConfig(dir).theme).toBe('catppuccin');
  });
  it('parses valid icons value', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"icons":"emoji"}');
    expect(loadConfig(dir).icons).toBe('emoji');
  });
  it('ignores invalid icons value', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"icons":"sparkles"}');
    expect(loadConfig(dir).icons).toBeUndefined();
  });
  it('includes contextTokens in display defaults', () => {
    expect(loadConfig(join(dir, 'nope')).display.contextTokens).toBe(true);
  });
});

describe('mergeCliFlags', () => {
  it('--minimal sets preset and layout', () => {
    const r = mergeCliFlags(DEFAULT_CONFIG, ['node', 'i', '--minimal']);
    expect(r.preset).toBe('minimal');
    expect(r.layout).toBe('minimal');
  });
  it('--balanced sets preset and layout=auto', () => {
    const r = mergeCliFlags(DEFAULT_CONFIG, ['node', 'i', '--balanced']);
    expect(r.preset).toBe('balanced');
    expect(r.layout).toBe('auto');
  });
  it('--full sets preset and layout=full', () => {
    const r = mergeCliFlags(DEFAULT_CONFIG, ['node', 'i', '--full']);
    expect(r.preset).toBe('full');
    expect(r.layout).toBe('full');
  });
  it('enables gsd', () => { expect(mergeCliFlags(DEFAULT_CONFIG, ['node', 'i', '--gsd']).gsd).toBe(true); });
  it('no flags = unchanged', () => { expect(mergeCliFlags(DEFAULT_CONFIG, ['node', 'i'])).toEqual(DEFAULT_CONFIG); });
  it('--preset=balanced drives layout', () => {
    const r = mergeCliFlags(DEFAULT_CONFIG, ['node', 'i', '--preset=balanced']);
    expect(r.preset).toBe('balanced');
    expect(r.layout).toBe('auto');
  });
  it('--preset=minimal drives layout', () => {
    const r = mergeCliFlags(DEFAULT_CONFIG, ['node', 'i', '--preset=minimal']);
    expect(r.preset).toBe('minimal');
    expect(r.layout).toBe('minimal');
  });
  it('parses --icons=none', () => { expect(mergeCliFlags(DEFAULT_CONFIG, ['node', 'i', '--icons=none']).icons).toBe('none'); });
});
