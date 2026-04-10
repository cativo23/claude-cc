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
    writeFileSync(join(dir, 'config.json'), '{"layout":"singleline","display":{"model":false}}');
    const c = loadConfig(dir);
    expect(c.layout).toBe('singleline');
    expect(c.display.model).toBe(false);
    expect(c.display.branch).toBe(true);
  });

  it('preset balanced disables burnRate, duration, etc.', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"balanced"}');
    const c = loadConfig(dir);
    expect(c.preset).toBe('balanced');
    expect(c.layout).toBe('auto');
    expect(c.display.burnRate).toBe(false);
    expect(c.display.duration).toBe(false);
    expect(c.display.version).toBe(false);
    // core toggles stay on
    expect(c.display.model).toBe(true);
    expect(c.display.cost).toBe(true);
    expect(c.display.contextBar).toBe(true);
  });

  it('preset minimal disables most toggles', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"minimal"}');
    const c = loadConfig(dir);
    expect(c.preset).toBe('minimal');
    expect(c.layout).toBe('singleline');
    expect(c.display.tokens).toBe(false);
    expect(c.display.tools).toBe(false);
    expect(c.display.todos).toBe(false);
    // essentials stay on
    expect(c.display.model).toBe(true);
    expect(c.display.branch).toBe(true);
    expect(c.display.cost).toBe(true);
  });

  it('user display overrides win over preset', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"minimal","display":{"tokens":true}}');
    const c = loadConfig(dir);
    expect(c.preset).toBe('minimal');
    // preset says false, user says true → user wins
    expect(c.display.tokens).toBe(true);
  });

  it('preset full keeps all toggles on', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"full"}');
    const c = loadConfig(dir);
    expect(c.preset).toBe('full');
    expect(c.layout).toBe('multiline');
    expect(c.display.burnRate).toBe(true);
    expect(c.display.version).toBe(true);
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
    expect(r.layout).toBe('singleline');
  });
  it('--balanced sets preset and layout=auto', () => {
    const r = mergeCliFlags(DEFAULT_CONFIG, ['node', 'i', '--balanced']);
    expect(r.preset).toBe('balanced');
    expect(r.layout).toBe('auto');
  });
  it('--full sets preset and layout=multiline', () => {
    const r = mergeCliFlags(DEFAULT_CONFIG, ['node', 'i', '--full']);
    expect(r.preset).toBe('full');
    expect(r.layout).toBe('multiline');
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
    expect(r.layout).toBe('singleline');
  });
  it('parses --icons=none', () => { expect(mergeCliFlags(DEFAULT_CONFIG, ['node', 'i', '--icons=none']).icons).toBe('none'); });
});
