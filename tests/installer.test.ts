import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { install } from '../src/installer.js';

describe('install', () => {
  let dir: string;
  let settingsPath: string;
  let backupPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lumira-test-'));
    settingsPath = join(dir, 'settings.json');
    backupPath = join(dir, 'settings.json.lumira.bak');
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('creates settings file when none exists', async () => {
    const output = await install({ settingsPath, confirm: async () => true });
    expect(existsSync(settingsPath)).toBe(true);
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('npx lumira@latest');
    expect(output).toContain('Configured');
  });

  it('adds statusLine when settings exists without one', async () => {
    writeFileSync(settingsPath, JSON.stringify({ hooks: {} }, null, 2));
    const output = await install({ settingsPath, confirm: async () => true });
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('npx lumira@latest');
    expect(data.hooks).toEqual({});
    expect(existsSync(backupPath)).toBe(false);
  });

  it('backs up and replaces existing statusLine after confirmation', async () => {
    const original = { statusLine: { type: 'command', command: 'other-tool', padding: 0 } };
    writeFileSync(settingsPath, JSON.stringify(original, null, 2));
    const output = await install({ settingsPath, confirm: async () => true });
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
    const output = await install({ settingsPath, confirm: async () => true });
    expect(output).toContain('already configured');
    expect(existsSync(backupPath)).toBe(false);
  });

  it('aborts when user declines replacement', async () => {
    const original = { statusLine: { type: 'command', command: 'other-tool', padding: 0 } };
    writeFileSync(settingsPath, JSON.stringify(original, null, 2));
    const output = await install({ settingsPath, confirm: async () => false });
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('other-tool');
    expect(output).toContain('Aborted');
  });

  it('recovers from malformed settings.json and creates fresh settings', async () => {
    writeFileSync(settingsPath, 'this is { not valid JSON!!');
    const output = await install({ settingsPath, confirm: async () => true });
    expect(output).toContain('Could not parse');
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('npx lumira@latest');
    expect(output).toContain('Configured');
  });

  it('creates parent directory when it does not exist', async () => {
    const nestedSettingsPath = join(dir, 'nested', 'deep', 'settings.json');
    const output = await install({ settingsPath: nestedSettingsPath, confirm: async () => true });
    expect(existsSync(nestedSettingsPath)).toBe(true);
    const data = JSON.parse(readFileSync(nestedSettingsPath, 'utf8'));
    expect(data.statusLine.command).toBe('npx lumira@latest');
    expect(output).toContain('Configured');
  });
});
