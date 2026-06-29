import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { install, uninstall, commandSpeed } from '../src/installer.js';
import { createMockStdin, createMockStdout } from './tui/_mock-stdin.js';

describe('commandSpeed', () => {
  // 0 = npx@registry, 1 = npx cached, 2 = node path (version-pinned), 3 = bare `lumira` (always current)
  it.each([
    ['npx lumira@latest', 0],
    ['npx -y lumira@latest', 0],
    ['npx lumira@1.2.3', 0],
    ['npx lumira', 1],
    ['npx -y lumira', 1],
    ['/usr/local/bin/npx lumira', 1], // path-prefixed npx still counts as npx
    ['node /home/u/lumira/dist/index.js', 2],
    ['node "${CLAUDE_PLUGIN_ROOT}/dist/index.js"', 2],
    ['lumira', 3],   // bare binary — always resolves to current installed version
  ])('ranks %j as speed %i', (cmd, rank) => {
    expect(commandSpeed(cmd as string)).toBe(rank);
  });
});

describe('install', () => {
  let dir: string;
  let settingsPath: string;
  let backupPath: string;
  let configPath: string;

  // Read back the statusLine command that was written.
  const readCmd = () => JSON.parse(readFileSync(settingsPath, 'utf8')).statusLine.command;
  const flush = () => new Promise((r) => setImmediate(r));
  // Drive the 3-step wizard (preset → theme → icons) to its defaults.
  const completeWizard = async (stdin: ReturnType<typeof createMockStdin>) => {
    await flush(); stdin.pressKey('return');
    await flush(); stdin.pressKey('return');
    await flush(); stdin.pressKey('return');
  };

  // baseOpts: non-TTY, no global bin → resolves to the `npx lumira` fallback
  // (no prompt). installGlobal is stubbed so the real `npm i -g` never runs.
  const baseOpts = () => ({
    settingsPath,
    configPath,
    homeOverride: dir,
    stdin: createMockStdin(false),
    confirm: async () => true,
    hasGlobalBin: () => false,
    installGlobal: () => true,
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lumira-test-'));
    settingsPath = join(dir, 'settings.json');
    backupPath = join(dir, 'settings.json.lumira.bak');
    configPath = join(dir, 'config.json');
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  // ── The fix: what per-render command gets written ────────────────
  describe('statusLine command resolution', () => {
    it('falls back to `npx lumira` when no global bin and non-TTY', async () => {
      const output = await install(baseOpts());
      expect(readCmd()).toBe('npx lumira');
      expect(output).toContain('Configured');
    });

    it('writes the direct `lumira` binary when a global bin is present', async () => {
      const installGlobal = vi.fn(() => true);
      await install({ ...baseOpts(), hasGlobalBin: () => true, installGlobal });
      expect(readCmd()).toBe('lumira');
      expect(installGlobal).not.toHaveBeenCalled(); // already global, no install
    });

    it('offers a global install in a TTY and writes `lumira` on success', async () => {
      const installGlobal = vi.fn(() => true);
      const stdin = createMockStdin(true);
      const promise = install({
        ...baseOpts(), stdin, stdout: createMockStdout(),
        hasGlobalBin: () => false, installGlobal, confirm: async () => true,
      });
      await completeWizard(stdin);
      await promise;
      expect(installGlobal).toHaveBeenCalledOnce();
      expect(readCmd()).toBe('lumira');
    });

    it('falls back to `npx lumira` and warns when the global install fails', async () => {
      const stdin = createMockStdin(true);
      const promise = install({
        ...baseOpts(), stdin, stdout: createMockStdout(),
        hasGlobalBin: () => false, installGlobal: () => false, confirm: async () => true,
      });
      await completeWizard(stdin);
      const output = await promise;
      expect(readCmd()).toBe('npx lumira');
      expect(output).toContain('Global install failed');
    });

    it('falls back to `npx lumira` when the user declines the global install', async () => {
      const installGlobal = vi.fn(() => true);
      const stdin = createMockStdin(true);
      const promise = install({
        ...baseOpts(), stdin, stdout: createMockStdout(),
        hasGlobalBin: () => false, installGlobal, confirm: async () => false,
      });
      await completeWizard(stdin);
      const output = await promise;
      expect(installGlobal).not.toHaveBeenCalled();
      expect(readCmd()).toBe('npx lumira');
      expect(output).toContain('npm i -g lumira'); // tip toward the faster form
    });

    it('migrates a legacy `npx lumira@latest` command to `npx lumira`', async () => {
      writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'npx lumira@latest', padding: 0 } }));
      const output = await install(baseOpts());
      expect(readCmd()).toBe('npx lumira');
      expect(output).toContain('Upgraded');
      expect(existsSync(backupPath)).toBe(false); // our own command — no backup
    });

    it('upgrades `npx lumira@latest` to the direct `lumira` when a global bin exists', async () => {
      writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'npx lumira@latest', padding: 0 } }));
      await install({ ...baseOpts(), hasGlobalBin: () => true });
      expect(readCmd()).toBe('lumira');
    });

    it('leaves an already-direct `lumira` command untouched without prompting to install', async () => {
      writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'lumira', padding: 0 } }));
      const installGlobal = vi.fn(() => true);
      const output = await install({ ...baseOpts(), installGlobal });
      expect(readCmd()).toBe('lumira');
      expect(installGlobal).not.toHaveBeenCalled();
      expect(output).toContain('already configured');
    });

    it('migrates a plugin-cache node path to bare `lumira` when global bin exists', async () => {
      // Regression: `node /plugin-cache/1.8.2/dist/index.js` was mistakenly
      // classified as speed-2 (optimal) and skipped; now it migrates to `lumira`.
      const staleCmd = 'node "/home/u/.claude/plugins/cache/lumira/lumira/1.8.2/dist/index.js"';
      writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: staleCmd } }));
      const output = await install({ ...baseOpts(), hasGlobalBin: () => true });
      expect(readCmd()).toBe('lumira');
      expect(output).toContain('Upgraded');
    });

    it('does not downgrade or churn an equal `npx lumira` command', async () => {
      writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'npx lumira', padding: 0 } }));
      const output = await install(baseOpts());
      expect(readCmd()).toBe('npx lumira');
      expect(output).toContain('already configured');
      expect(existsSync(backupPath)).toBe(false);
    });
  });

  // ── settings.json read/merge/backup/atomicity ────────────────────
  describe('settings file handling', () => {
    it('creates settings.json with no backup when none exists', async () => {
      const output = await install(baseOpts());
      expect(existsSync(settingsPath)).toBe(true);
      expect(existsSync(backupPath)).toBe(false);
      expect(output).toContain('Configured');
    });

    it('preserves unrelated keys when settings exists without a statusLine', async () => {
      writeFileSync(settingsPath, JSON.stringify({ hooks: {} }, null, 2));
      await install(baseOpts());
      const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
      expect(data.hooks).toEqual({});
      expect(data.statusLine.command).toBe('npx lumira');
      expect(existsSync(backupPath)).toBe(false);
    });

    it('backs up and replaces a foreign statusLine after confirmation', async () => {
      writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'other-tool', padding: 0 } }));
      const output = await install(baseOpts());
      expect(existsSync(backupPath)).toBe(true);
      expect(JSON.parse(readFileSync(backupPath, 'utf8')).statusLine.command).toBe('other-tool');
      expect(readCmd()).toBe('npx lumira');
      expect(output).toContain('Backed up');
    });

    it('aborts and keeps the foreign statusLine when replacement is declined', async () => {
      writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'other-tool', padding: 0 } }));
      const output = await install({ ...baseOpts(), confirm: async () => false });
      expect(readCmd()).toBe('other-tool');
      expect(output).toContain('Aborted');
    });

    it.each([
      ['malformed JSON', 'this is { not valid JSON!!'],
      ['JSON null', 'null'],
      ['a JSON array', '[1,2,3]'],
    ])('recovers from %s and writes a fresh statusLine', async (_label, contents) => {
      writeFileSync(settingsPath, contents);
      const output = await install(baseOpts());
      expect(output).toContain('Could not parse');
      expect(readCmd()).toBe('npx lumira');
    });

    it('creates parent directories that do not exist', async () => {
      const nested = join(dir, 'nested', 'deep', 'settings.json');
      await install({ ...baseOpts(), settingsPath: nested });
      expect(existsSync(nested)).toBe(true);
      expect(JSON.parse(readFileSync(nested, 'utf8')).statusLine.command).toBe('npx lumira');
    });

    it('writes valid JSON atomically and leaves no .lumira.tmp file behind', async () => {
      await install(baseOpts());
      expect(() => JSON.parse(readFileSync(settingsPath, 'utf8'))).not.toThrow();
      expect(readdirSync(dir).filter(f => f.includes('lumira.tmp'))).toHaveLength(0);
    });

    it('strips ANSI escapes from a foreign command in the warning banner', async () => {
      writeFileSync(settingsPath, JSON.stringify({
        statusLine: { type: 'command', command: '\x1b[31mevil\x1b[0m', padding: 0 },
      }));
      const output = await install({ ...baseOpts(), confirm: async () => false });
      expect(output).not.toContain('\x1b[31m');
      expect(output).toContain('evil');
    });
  });

  // ── subagentStatusLine registration (issue #176) ─────────────────
  // Driven via the already-optimal path (statusLine = bare `lumira`) so no
  // command rewrite happens and the only confirm() call is the subagent prompt.
  describe('subagentStatusLine registration', () => {
    const optimalSettings = () =>
      writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'lumira', padding: 0 } }));
    const readSettings = () => JSON.parse(readFileSync(settingsPath, 'utf8'));

    it('registers `<cmd> subagent` when the user opts in (TTY)', async () => {
      optimalSettings();
      const stdin = createMockStdin(true);
      const promise = install({
        ...baseOpts(), stdin, stdout: createMockStdout(),
        hasGlobalBin: () => true, confirm: async () => true,
      });
      await completeWizard(stdin);
      await promise;
      const s = readSettings();
      expect(s.subagentStatusLine.command).toBe('lumira subagent');
      expect(s.statusLine.command).toBe('lumira'); // main statusLine untouched
    });

    it('does not register when the user declines', async () => {
      optimalSettings();
      const stdin = createMockStdin(true);
      const promise = install({
        ...baseOpts(), stdin, stdout: createMockStdout(),
        hasGlobalBin: () => true, confirm: async () => false,
      });
      await completeWizard(stdin);
      await promise;
      expect(readSettings().subagentStatusLine).toBeUndefined();
    });

    it('never prompts or registers in a non-TTY install', async () => {
      await install(baseOpts());
      expect(readSettings().subagentStatusLine).toBeUndefined();
    });

    it('leaves a foreign subagentStatusLine untouched (never clobbers)', async () => {
      writeFileSync(settingsPath, JSON.stringify({
        statusLine: { type: 'command', command: 'lumira', padding: 0 },
        subagentStatusLine: { type: 'command', command: 'my-own-renderer', padding: 0 },
      }));
      const stdin = createMockStdin(true);
      const promise = install({
        ...baseOpts(), stdin, stdout: createMockStdout(),
        hasGlobalBin: () => true, confirm: async () => true,
      });
      await completeWizard(stdin);
      await promise;
      expect(readSettings().subagentStatusLine.command).toBe('my-own-renderer');
    });
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

  it('removes both statusLine and subagentStatusLine when no backup exists', () => {
    const current = {
      statusLine: { type: 'command', command: 'npx lumira@latest', padding: 0 },
      subagentStatusLine: { type: 'command', command: 'lumira subagent', padding: 0 },
      hooks: {},
    };
    writeFileSync(settingsPath, JSON.stringify(current, null, 2));
    const output = uninstall({ settingsPath });
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine).toBeUndefined();
    expect(data.subagentStatusLine).toBeUndefined();
    expect(data.hooks).toEqual({});
    expect(output).toContain('Removed');
  });

  it('preserves a foreign subagentStatusLine on uninstall', () => {
    const current = {
      statusLine: { type: 'command', command: 'lumira', padding: 0 },
      subagentStatusLine: { type: 'command', command: 'my-own-renderer', padding: 0 },
    };
    writeFileSync(settingsPath, JSON.stringify(current, null, 2));
    uninstall({ settingsPath });
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(data.statusLine).toBeUndefined();
    expect(data.subagentStatusLine.command).toBe('my-own-renderer');
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
      // Stub bin detection so a TTY install never shells out to `npm i -g`.
      hasGlobalBin: () => false,
      installGlobal: () => true,
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
      hasGlobalBin: () => false,
      installGlobal: () => true,
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

    await install({ settingsPath, configPath, confirm: async () => true, stdin, hasGlobalBin: () => false, installGlobal: () => true });
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
      hasGlobalBin: () => false,
      installGlobal: () => true,
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
      hasGlobalBin: () => false,
      installGlobal: () => true,
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

  it('uninstall cleans up empty skills/ parent dir when no other skills remain', () => {
    mkdirSync(join(claudeHome, 'skills', 'lumira'), { recursive: true });
    writeFileSync(join(claudeHome, 'skills', 'lumira', 'SKILL.md'), 'dummy');

    const settingsPath = join(claudeHome, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'npx lumira@latest' } }));

    uninstall({ settingsPath, homeOverride: tmpHome });

    expect(existsSync(join(claudeHome, 'skills', 'lumira'))).toBe(false);
    expect(existsSync(join(claudeHome, 'skills'))).toBe(false);
  });

  it('uninstall preserves skills/ parent dir when other skills exist', () => {
    mkdirSync(join(claudeHome, 'skills', 'lumira'), { recursive: true });
    writeFileSync(join(claudeHome, 'skills', 'lumira', 'SKILL.md'), 'dummy');
    mkdirSync(join(claudeHome, 'skills', 'other-skill'), { recursive: true });
    writeFileSync(join(claudeHome, 'skills', 'other-skill', 'SKILL.md'), 'keep me');

    const settingsPath = join(claudeHome, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: 'npx lumira@latest' } }));

    uninstall({ settingsPath, homeOverride: tmpHome });

    expect(existsSync(join(claudeHome, 'skills', 'lumira'))).toBe(false);
    expect(existsSync(join(claudeHome, 'skills', 'other-skill', 'SKILL.md'))).toBe(true);
  });
});
