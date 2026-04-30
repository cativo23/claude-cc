import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, mergeCliFlags, _resetMigrationFlags, saveConfig } from '../src/config.js';
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

  it('parses style: "powerline"', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"style":"powerline"}');
    expect(loadConfig(dir).style).toBe('powerline');
  });
  it('parses style: "classic"', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"style":"classic"}');
    expect(loadConfig(dir).style).toBe('classic');
  });
  it('ignores invalid style value', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"style":"bogus"}');
    expect(loadConfig(dir).style).toBeUndefined();
  });
  it('parses powerline.style', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"powerline":{"style":"flame"}}');
    expect(loadConfig(dir).powerline?.style).toBe('flame');
  });
  it('ignores invalid powerline.style value', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"powerline":{"style":"bogus"}}');
    expect(loadConfig(dir).powerline).toBeUndefined();
  });
  it('ignores malformed powerline (string instead of object)', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"powerline":"arrow"}');
    expect(loadConfig(dir).powerline).toBeUndefined();
  });
  it('accepts all 8 valid powerline styles', () => {
    mkdirSync(dir, { recursive: true });
    for (const s of ['arrow', 'flame', 'slant', 'round', 'diamond', 'compatible', 'plain', 'auto']) {
      writeFileSync(join(dir, 'config.json'), `{"powerline":{"style":"${s}"}}`);
      expect(loadConfig(dir).powerline?.style).toBe(s);
    }
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

describe('saveConfig', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-save-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('creates config.json with only the three wizard keys', () => {
    saveConfig({ preset: 'balanced', icons: 'nerd' }, join(dir, 'config.json'));
    const content = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    expect(content).toEqual({ preset: 'balanced', icons: 'nerd' });
  });

  it('writes with 0o600 permissions', () => {
    const p = join(dir, 'config.json');
    saveConfig({ preset: 'minimal', icons: 'nerd' }, p);
    const mode = statSync(p).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('preserves other keys in an existing config', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({
      display: { tokens: false },
      colors: { mode: 'truecolor' },
      preset: 'full',
    }));
    saveConfig({ preset: 'balanced', theme: 'dracula', icons: 'nerd' }, p);
    const content = JSON.parse(readFileSync(p, 'utf8'));
    expect(content).toEqual({
      display: { tokens: false },
      colors: { mode: 'truecolor' },
      preset: 'balanced',
      theme: 'dracula',
      icons: 'nerd',
    });
  });

  it('overwrites corrupt JSON with wizard keys only', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, 'not { valid json');
    saveConfig({ preset: 'minimal', icons: 'emoji' }, p);
    const content = JSON.parse(readFileSync(p, 'utf8'));
    expect(content).toEqual({ preset: 'minimal', icons: 'emoji' });
  });

  it('omits theme key when undefined in input', () => {
    const p = join(dir, 'config.json');
    saveConfig({ preset: 'balanced', icons: 'nerd' }, p);
    const content = JSON.parse(readFileSync(p, 'utf8'));
    expect('theme' in content).toBe(false);
  });

  it('creates the parent directory if missing', () => {
    const p = join(dir, 'nested', 'deep', 'config.json');
    saveConfig({ preset: 'full', icons: 'nerd' }, p);
    expect(existsSync(p)).toBe(true);
  });

  it('does not leave a stale .tmp file behind', () => {
    const p = join(dir, 'config.json');
    saveConfig({ preset: 'balanced', icons: 'nerd' }, p);
    expect(existsSync(p + '.tmp')).toBe(false);
  });

  it('removes theme from existing config when new save has no theme', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({ theme: 'dracula', preset: 'full', icons: 'nerd' }));
    saveConfig({ preset: 'full', icons: 'nerd' }, p);  // no theme
    const content = JSON.parse(readFileSync(p, 'utf8'));
    expect('theme' in content).toBe(false);
  });
});

describe('qwen preset migration', () => {
  let dir: string;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cc-cfg-qwen-'));
    _resetMigrationFlags();
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    errSpy.mockRestore();
  });

  it('coerces legacy preset "qwen" to "minimal"', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"qwen"}');
    const c = loadConfig(dir);
    expect(c.preset).toBe('minimal');
    expect(c.layout).toBe('singleline');
  });

  it('writes a deprecation warning to stderr when "qwen" preset is seen', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"qwen"}');
    loadConfig(dir);
    const calls = errSpy.mock.calls.flat().join('');
    expect(calls).toContain("'qwen' preset is removed");
  });
});
