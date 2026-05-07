import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { install, uninstall } from '../src/installer.js';
import { createMockStdin, createMockStdout } from './tui/_mock-stdin.js';

describe('install', () => {
  let dir: string;
  let settingsPath: string;
  let backupPath: string;
  let configPath: string;

  // Helper: non-TTY stdin + isolated home + temp config path. Installs run
  // through the single interactive path with wizard defaults.
  const baseOpts = () => ({
    settingsPath,
    configPath,
    homeOverride: dir,
    stdin: createMockStdin(false),
    confirm: async () => true,
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lumira-test-'));
    settingsPath = join(dir, 'settings.json');
    backupPath = join(dir, 'settings.json.lumira.bak');
    configPath = join(dir, 'config.json');
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('creates settings file when none exists', async () => {
    const output = await install(baseOpts());
    expect(existsSync(settingsPath)).toBe(true);
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('npx lumira@latest');
    expect(output).toContain('Configured');
  });

  it('adds statusLine when settings exists without one', async () => {
    writeFileSync(settingsPath, JSON.stringify({ hooks: {} }, null, 2));
    await install(baseOpts());
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('npx lumira@latest');
    expect(data.hooks).toEqual({});
    expect(existsSync(backupPath)).toBe(false);
  });

  it('backs up and replaces existing statusLine after confirmation', async () => {
    const original = { statusLine: { type: 'command', command: 'other-tool', padding: 0 } };
    writeFileSync(settingsPath, JSON.stringify(original, null, 2));
    const output = await install(baseOpts());
    expect(existsSync(backupPath)).toBe(true);
    const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
    expect(backup.statusLine.command).toBe('other-tool');
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('npx lumira@latest');
    expect(output).toContain('Backed up');
  });

  it('skips when already configured with lumira', async () => {
    const existing = { statusLine: { type: 'command', command: 'npx lumira@latest', padding: 0 } };
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
    const output = await install(baseOpts());
    expect(output).toContain('already configured');
    expect(existsSync(backupPath)).toBe(false);
  });

  it('aborts when user declines replacement', async () => {
    const original = { statusLine: { type: 'command', command: 'other-tool', padding: 0 } };
    writeFileSync(settingsPath, JSON.stringify(original, null, 2));
    const output = await install({ ...baseOpts(), confirm: async () => false });
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('other-tool');
    expect(output).toContain('Aborted');
  });

  it('recovers from malformed settings.json and creates fresh settings', async () => {
    writeFileSync(settingsPath, 'this is { not valid JSON!!');
    const output = await install(baseOpts());
    expect(output).toContain('Could not parse');
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('npx lumira@latest');
    expect(output).toContain('Configured');
  });

  it('creates parent directory when it does not exist', async () => {
    const nestedSettingsPath = join(dir, 'nested', 'deep', 'settings.json');
    const output = await install({ ...baseOpts(), settingsPath: nestedSettingsPath });
    expect(existsSync(nestedSettingsPath)).toBe(true);
    const data = JSON.parse(readFileSync(nestedSettingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('npx lumira@latest');
    expect(output).toContain('Configured');
  });

  it('handles settings.json containing JSON null (treats as fresh)', async () => {
    writeFileSync(settingsPath, 'null');
    const output = await install(baseOpts());
    expect(output).toContain('Could not parse');
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('npx lumira@latest');
  });

  it('handles settings.json containing a JSON array (treats as fresh)', async () => {
    writeFileSync(settingsPath, '[1,2,3]');
    const output = await install(baseOpts());
    expect(output).toContain('Could not parse');
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('npx lumira@latest');
  });

  it('writes settings.json atomically — result is valid JSON', async () => {
    await install(baseOpts());
    expect(() => JSON.parse(readFileSync(settingsPath, 'utf8'))).not.toThrow();
  });

  it('writes temp file in same dir as settingsPath (no cross-fs rename)', async () => {
    // Temp file lives beside settings.json (same-fs rename). Includes process.pid
    // so concurrent installs don't collide. Neither the PID-based name nor the
    // legacy static name should remain after a successful install.
    await install(baseOpts());
    const leftover = readdirSync(dir).filter(f => f.includes('lumira.tmp'));
    expect(leftover).toHaveLength(0);
    expect(existsSync(settingsPath)).toBe(true);
  });

  it('strips ANSI escapes from foreign statusLine.command in the warning banner', async () => {
    const malicious = '\x1b[31mevil\x1b[0m';
    writeFileSync(settingsPath, JSON.stringify({
      statusLine: { type: 'command', command: malicious, padding: 0 },
    }, null, 2));
    const output = await install({ ...baseOpts(), confirm: async () => false });
    expect(output).not.toContain('\x1b[31m');
    expect(output).toContain('evil');
  });
});

describe('uninstall', () => {
  let dir: string;
  let settingsPath: string;
  let backupPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lumira-test-'));
    settingsPath = join(dir, 'settings.json');
    backupPath = join(dir, 'settings.json.lumira.bak');
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('restores from backup when backup exists', () => {
    const backup = { statusLine: { type: 'command', command: 'old-tool', padding: 0 }, hooks: {} };
    const current = { statusLine: { type: 'command', command: 'npx lumira@latest', padding: 0 }, hooks: {} };
    writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    writeFileSync(settingsPath, JSON.stringify(current, null, 2));
    const output = uninstall({ settingsPath });
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('old-tool');
    expect(existsSync(backupPath)).toBe(false);
    expect(output).toContain('Restored');
  });

  it('removes statusLine key when no backup exists', () => {
    const current = { statusLine: { type: 'command', command: 'npx lumira@latest', padding: 0 }, hooks: {} };
    writeFileSync(settingsPath, JSON.stringify(current, null, 2));
    const output = uninstall({ settingsPath });
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine).toBeUndefined();
    expect(data.hooks).toEqual({});
    expect(output).toContain('Removed');
  });

  it('prints message when no settings file exists', () => {
    const output = uninstall({ settingsPath });
    expect(output).toContain('Nothing to uninstall');
  });

  it('warns and skips restore when backup is corrupt', () => {
    const current = { statusLine: { type: 'command', command: 'npx lumira@latest', padding: 0 } };
    writeFileSync(settingsPath, JSON.stringify(current, null, 2));
    writeFileSync(backupPath, 'this is not valid JSON!!!');
    const output = uninstall({ settingsPath });
    expect(output).toContain('corrupt');
    expect(existsSync(backupPath)).toBe(false);
    // Should fall through to removing statusLine key
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine).toBeUndefined();
  });

  it('warns "Could not parse" (not "write") when settings.json is malformed during uninstall', () => {
    writeFileSync(settingsPath, 'this is { not valid JSON!!');
    const output = uninstall({ settingsPath });
    expect(output).toContain('Could not parse');
    expect(output).not.toContain('Could not write');
  });

  it('leaves no .lumira.tmp file after successful uninstall', () => {
    const current = { statusLine: { type: 'command', command: 'npx lumira@latest', padding: 0 }, hooks: {} };
    writeFileSync(settingsPath, JSON.stringify(current, null, 2));
    uninstall({ settingsPath });
    const leftover = readdirSync(dir).filter(f => f.includes('lumira.tmp'));
    expect(leftover).toHaveLength(0);
  });
});

describe('install — wizard integration', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lumira-wizard-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  async function flush() { await new Promise((r) => setImmediate(r)); }

  it('writes config.json with wizard result after wizard completes', async () => {
    const settingsPath = join(dir, 'settings.json');
    const configPath = join(dir, 'config.json');
    const stdin = createMockStdin(true);
    const stdout = createMockStdout();

    const promise = install({
      settingsPath, configPath,
      confirm: async () => true,
      stdin, stdout,
    });

    // defaults: preset=balanced, theme=(none), icons=nerd
    await flush(); stdin.pressKey('return');
    await flush(); stdin.pressKey('return');
    await flush(); stdin.pressKey('return');

    await promise;
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(cfg).toEqual({ preset: 'balanced', icons: 'nerd' });
  });

  it('skips wizard and writes defaults when stdin is not a TTY', async () => {
    const settingsPath = join(dir, 'settings.json');
    const configPath = join(dir, 'config.json');
    const stdin = createMockStdin(false);

    const output = await install({
      settingsPath, configPath,
      confirm: async () => true,
      stdin,
    });

    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(cfg).toEqual({ preset: 'balanced', icons: 'nerd' });
    expect(output).toContain('Non-interactive');
  });

  it('aborts cleanly when user Escs — no settings.json, no config.json', async () => {
    const settingsPath = join(dir, 'settings.json');
    const configPath = join(dir, 'config.json');
    const stdin = createMockStdin(true);

    const promise = install({ settingsPath, configPath, confirm: async () => true, stdin });
    await flush();
    stdin.pressKey('escape');

    const output = await promise;
    expect(existsSync(settingsPath)).toBe(false);
    expect(existsSync(configPath)).toBe(false);
    expect(output.toLowerCase()).toContain('cancel');
  });

  it('preserves unrelated keys when config.json already has user edits', async () => {
    const configPath = join(dir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ display: { tokens: false } }));
    const settingsPath = join(dir, 'settings.json');
    const stdin = createMockStdin(false);

    await install({ settingsPath, configPath, confirm: async () => true, stdin });
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(cfg.display).toEqual({ tokens: false });
    expect(cfg.preset).toBe('balanced');
  });
});

describe('install — skill dual install for Qwen', () => {
  let tmpHome: string;
  let claudeHome: string;
  let qwenHome: string;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'lumira-home-'));
    claudeHome = join(tmpHome, '.claude');
    qwenHome = join(tmpHome, '.qwen');
    mkdirSync(claudeHome, { recursive: true });
  });
  afterEach(() => { rmSync(tmpHome, { recursive: true, force: true }); });

  it('installs skill only under .claude when ~/.qwen/ does not exist', async () => {
    const settingsPath = join(claudeHome, 'settings.json');
    const configPath = join(tmpHome, 'config.json');
    const stdin = createMockStdin(false);

    await install({
      settingsPath, configPath,
      confirm: async () => true,
      stdin,
      homeOverride: tmpHome,
    });

    expect(existsSync(join(claudeHome, 'skills', 'lumira', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(qwenHome, 'skills', 'lumira', 'SKILL.md'))).toBe(false);
  });

  it('installs skill under both .claude and .qwen when ~/.qwen/ exists', async () => {
    mkdirSync(qwenHome, { recursive: true });
    const settingsPath = join(claudeHome, 'settings.json');
    const configPath = join(tmpHome, 'config.json');
    const stdin = createMockStdin(false);

    const output = await install({
      settingsPath, configPath,
      confirm: async () => true,
      stdin,
      homeOverride: tmpHome,
    });

    expect(existsSync(join(claudeHome, 'skills', 'lumira', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(qwenHome, 'skills', 'lumira', 'SKILL.md'))).toBe(true);
    // Qwen-detection notice appears in summary
    expect(output.toLowerCase()).toContain('qwen');
  });

  it('uninstall removes skill from both destinations', () => {
    mkdirSync(join(claudeHome, 'skills', 'lumira'), { recursive: true });
    writeFileSync(join(claudeHome, 'skills', 'lumira', 'SKILL.md'), 'dummy');
    mkdirSync(join(qwenHome, 'skills', 'lumira'), { recursive: true });
    writeFileSync(join(qwenHome, 'skills', 'lumira', 'SKILL.md'), 'dummy');

    const settingsPath = join(claudeHome, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'npx lumira@latest' } }));

    uninstall({ settingsPath, homeOverride: tmpHome });

    expect(existsSync(join(claudeHome, 'skills', 'lumira', 'SKILL.md'))).toBe(false);
    expect(existsSync(join(qwenHome, 'skills', 'lumira', 'SKILL.md'))).toBe(false);
  });
});
