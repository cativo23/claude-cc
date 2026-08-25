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

  it('returns defaults when config.json contains JSON null', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), 'null');
    expect(loadConfig(dir)).toEqual(DEFAULT_CONFIG);
  });

  it('returns defaults when config.json contains a JSON array', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '[1,2,3]');
    expect(loadConfig(dir)).toEqual(DEFAULT_CONFIG);
  });

  it('returns defaults when config.json contains a JSON scalar (number)', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '42');
    expect(loadConfig(dir)).toEqual(DEFAULT_CONFIG);
  });
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
    // apiLatency stays on so balanced users see the v1.4.0 widget out of the box
    expect(c.display.apiLatency).toBe(true);
    // addedDirs and worktreeBreadcrumb default ON in balanced (data-gated, no clutter)
    expect(c.display.addedDirs).toBe(true);
    expect(c.display.worktreeBreadcrumb).toBe(true);
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
    // apiLatency is off in minimal — renderMinimal does not surface line2
    // widgets, so the toggle matches the dead-toggle convention used by
    // burnRate/rateLimits/paceDelta/etc. above.
    expect(c.display.apiLatency).toBe(false);
    // addedDirs and worktreeBreadcrumb are OFF in minimal (too noisy for single-line)
    expect(c.display.addedDirs).toBe(false);
    expect(c.display.worktreeBreadcrumb).toBe(false);
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
    // apiLatency is the v1.4.0 headline widget — on by default in full.
    expect(c.display.apiLatency).toBe(true);
    // addedDirs and worktreeBreadcrumb are ON in full (data-gated, no clutter when data absent)
    expect(c.display.addedDirs).toBe(true);
    expect(c.display.worktreeBreadcrumb).toBe(true);
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
  it('parses line1Align: "packed"', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"line1Align":"packed"}');
    expect(loadConfig(dir).line1Align).toBe('packed');
  });
  it('parses line1Align: "justified"', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"line1Align":"justified"}');
    expect(loadConfig(dir).line1Align).toBe('justified');
  });
  it('falls back to justified on an invalid line1Align value', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"line1Align":"bogus"}');
    expect(loadConfig(dir).line1Align).toBe('justified');
  });
  it('defaults line1Align to justified when omitted', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"style":"classic"}');
    expect(loadConfig(dir).line1Align).toBe('justified');
  });

  describe('refreshInterval', () => {
    it('parses a valid positive integer', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), '{"refreshInterval":5}');
      expect(loadConfig(dir).refreshInterval).toBe(5);
    });
    it('clamps values below CC\'s documented minimum of 1 up to 1', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), '{"refreshInterval":0}');
      expect(loadConfig(dir).refreshInterval).toBe(1);
    });
    it('clamps negative values up to 1', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), '{"refreshInterval":-5}');
      expect(loadConfig(dir).refreshInterval).toBe(1);
    });
    it('truncates a non-integer value', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), '{"refreshInterval":2.9}');
      expect(loadConfig(dir).refreshInterval).toBe(2);
    });
    it('ignores a non-numeric value (stays undefined) and warns once to stderr', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), '{"refreshInterval":"5"}');
      const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      expect(loadConfig(dir).refreshInterval).toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('refreshInterval'));
      spy.mockRestore();
    });
    it('defaults to undefined when omitted', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), '{"style":"classic"}');
      expect(loadConfig(dir).refreshInterval).toBeUndefined();
    });
  });

  describe('context bar thresholds', () => {
    beforeEach(() => { _resetMigrationFlags(); });

    it('defaults to 65/78 when omitted (issue #138: lowered to fire before auto-compact)', () => {
      expect(loadConfig(join(dir, 'nope')).display.contextWarningThreshold).toBe(65);
      expect(loadConfig(join(dir, 'nope')).display.contextCriticalThreshold).toBe(78);
    });

    it('accepts valid user values', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), '{"display":{"contextWarningThreshold":60,"contextCriticalThreshold":80}}');
      const c = loadConfig(dir);
      expect(c.display.contextWarningThreshold).toBe(60);
      expect(c.display.contextCriticalThreshold).toBe(80);
    });

    it('clamps values above 100 to 100', () => {
      mkdirSync(dir, { recursive: true });
      // 150 → 100, 50 → 50, but 100 >= 50 means inverted → falls back to defaults
      writeFileSync(join(dir, 'config.json'), '{"display":{"contextWarningThreshold":50,"contextCriticalThreshold":150}}');
      const c = loadConfig(dir);
      expect(c.display.contextWarningThreshold).toBe(50);
      expect(c.display.contextCriticalThreshold).toBe(100);
    });

    it('clamps negative values to 0', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), '{"display":{"contextWarningThreshold":-10,"contextCriticalThreshold":50}}');
      const c = loadConfig(dir);
      expect(c.display.contextWarningThreshold).toBe(0);
      expect(c.display.contextCriticalThreshold).toBe(50);
    });

    it('falls back to defaults when warning >= critical (inverted)', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), '{"display":{"contextWarningThreshold":90,"contextCriticalThreshold":50}}');
      const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const c = loadConfig(dir);
      expect(c.display.contextWarningThreshold).toBe(65);
      expect(c.display.contextCriticalThreshold).toBe(78);
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('thresholds invalid'));
      errSpy.mockRestore();
    });

    it('emits the inversion warn only once per process', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), '{"display":{"contextWarningThreshold":90,"contextCriticalThreshold":50}}');
      const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      loadConfig(dir);
      loadConfig(dir);
      loadConfig(dir);
      expect(errSpy.mock.calls.filter(c => String(c[0]).includes('thresholds invalid')).length).toBe(1);
      errSpy.mockRestore();
    });

    it('preserves defaults when only one value is supplied and the pair is valid', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), '{"display":{"contextWarningThreshold":60}}');
      const c = loadConfig(dir);
      expect(c.display.contextWarningThreshold).toBe(60);
      expect(c.display.contextCriticalThreshold).toBe(78);
    });
  });

  // Issue #143 phase 1 — Custom Command widget config schema. Validates
  // user-supplied commands at load time, drops invalid entries silently
  // (same pattern as other config sections), clamps numeric fields, and
  // gates the whole feature behind `enabled: false` by default.
  describe('customCommands', () => {
    it('defaults to { enabled: false, commands: [] } when omitted', () => {
      expect(loadConfig(join(dir, 'nope')).customCommands).toEqual({ enabled: false, commands: [] });
    });

    it('parses a fully-specified command with all defaults applied to omitted fields', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: {
          enabled: true,
          commands: [
            { id: 'k8s', command: ['kubectl', 'config', 'current-context'], line: 2 },
          ],
        },
      }));
      const c = loadConfig(dir);
      expect(c.customCommands.enabled).toBe(true);
      expect(c.customCommands.commands).toHaveLength(1);
      const cmd = c.customCommands.commands[0];
      expect(cmd.id).toBe('k8s');
      expect(cmd.command).toEqual(['kubectl', 'config', 'current-context']);
      expect(cmd.line).toBe(2);
      // Defaults
      expect(cmd.refreshMs).toBe(5000);
      expect(cmd.timeoutMs).toBe(1500);
      expect(cmd.maxBytes).toBe(256);
      expect(cmd.onError).toBe('hide');
      expect(cmd.onTimeout).toBe('stale');
      expect(cmd.ansi).toBe(false);
      expect(cmd.label).toBeUndefined();
      expect(cmd.env).toBeUndefined();
      expect(cmd.cwd).toBeUndefined();
      expect(cmd.color).toBeUndefined();
    });

    it('clamps timeoutMs above 2000 to 2000', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 1, timeoutMs: 5000 }] },
      }));
      expect(loadConfig(dir).customCommands.commands[0].timeoutMs).toBe(2000);
    });

    it('clamps maxBytes above 4096 to 4096', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 1, maxBytes: 100000 }] },
      }));
      expect(loadConfig(dir).customCommands.commands[0].maxBytes).toBe(4096);
    });

    it('clamps refreshMs below 500 to 500', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 1, refreshMs: 100 }] },
      }));
      expect(loadConfig(dir).customCommands.commands[0].refreshMs).toBe(500);
    });

    it('truncates env to 32 entries', () => {
      mkdirSync(dir, { recursive: true });
      const env: Record<string, string> = {};
      for (let i = 0; i < 50; i++) env[`KEY_${i}`] = `v${i}`;
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 1, env }] },
      }));
      const cmd = loadConfig(dir).customCommands.commands[0];
      expect(Object.keys(cmd.env ?? {}).length).toBe(32);
    });

    it('sanitizes a label containing a newline (would otherwise break the statusline)', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 1, label: 'a\nb' }] },
      }));
      expect(loadConfig(dir).customCommands.commands[0].label).toBe('a b');
    });

    it('strips ANSI escapes embedded in a label', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 1, label: '\x1b[31mred\x1b[0m' }] },
      }));
      expect(loadConfig(dir).customCommands.commands[0].label).toBe('red');
    });

    it('truncates a label longer than 24 chars', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 1, label: 'x'.repeat(50) }] },
      }));
      expect(loadConfig(dir).customCommands.commands[0].label).toBe('x'.repeat(24));
    });

    it('omits label entirely when it sanitizes down to an empty string', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 1, label: '\n\n' }] },
      }));
      expect(loadConfig(dir).customCommands.commands[0].label).toBeUndefined();
    });

    it('drops command with empty command array', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: [], line: 1 }] },
      }));
      expect(loadConfig(dir).customCommands.commands).toEqual([]);
    });

    it('allows command: ["sh", "-c", "ls"] (we do not ban shell wrappers)', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'shellish', command: ['sh', '-c', 'ls'], line: 1 }] },
      }));
      const cmds = loadConfig(dir).customCommands.commands;
      expect(cmds).toHaveLength(1);
      expect(cmds[0].command).toEqual(['sh', '-c', 'ls']);
    });

    it('rejects command as a single string (must be array)', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: 'ls', line: 1 }] },
      }));
      expect(loadConfig(dir).customCommands.commands).toEqual([]);
    });

    it('drops duplicate id (second wins-policy = keep first, drop later duplicates)', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [
          { id: 'dup', command: ['echo', 'one'], line: 1 },
          { id: 'dup', command: ['echo', 'two'], line: 2 },
        ] },
      }));
      const cmds = loadConfig(dir).customCommands.commands;
      expect(cmds).toHaveLength(1);
      expect(cmds[0].command).toEqual(['echo', 'one']);
    });

    it('accepts enabled: true with empty commands array', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [] },
      }));
      expect(loadConfig(dir).customCommands).toEqual({ enabled: true, commands: [] });
    });

    it('defaults enabled to false when omitted', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { commands: [{ id: 'a', command: ['echo'], line: 1 }] },
      }));
      expect(loadConfig(dir).customCommands.enabled).toBe(false);
    });

    it('falls back to onError default ("hide") when value is invalid', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 1, onError: 'explode' }] },
      }));
      expect(loadConfig(dir).customCommands.commands[0].onError).toBe('hide');
    });

    it('drops command with invalid line value (e.g. 5)', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 5 }] },
      }));
      expect(loadConfig(dir).customCommands.commands).toEqual([]);
    });

    it('drops command with non-numeric line value', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 'a' }] },
      }));
      expect(loadConfig(dir).customCommands.commands).toEqual([]);
    });

    // I5: cwd must be absolute. Relative paths like '../../etc' would silently
    // escape the renderer's cwd to attacker-controlled locations.
    it('drops cwd when not an absolute path (relative paths rejected)', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'rel', command: ['echo'], line: 1, cwd: '../../etc' }] },
      }));
      expect(loadConfig(dir).customCommands.commands[0].cwd).toBeUndefined();
    });

    it('accepts cwd when absolute', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'abs', command: ['echo'], line: 1, cwd: '/tmp' }] },
      }));
      expect(loadConfig(dir).customCommands.commands[0].cwd).toBe('/tmp');
    });

    // I6: refreshMs has an upper bound now (24h). Larger values clamp.
    it('clamps refreshMs above 86_400_000 (24h) down to 86_400_000', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 1, refreshMs: 100_000_000 }] },
      }));
      expect(loadConfig(dir).customCommands.commands[0].refreshMs).toBe(86_400_000);
    });

    // I7: reject ids containing path separators (slash/backslash).
    it('drops command with id containing slash', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'bad/id', command: ['echo'], line: 1 }] },
      }));
      expect(loadConfig(dir).customCommands.commands).toEqual([]);
    });

    it('drops command with id containing backslash', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'bad\\id', command: ['echo'], line: 1 }] },
      }));
      expect(loadConfig(dir).customCommands.commands).toEqual([]);
    });

    // I7: reject reserved Object.prototype-shadowing ids.
    it('drops command with id === "__proto__" (prototype pollution guard)', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: '__proto__', command: ['echo'], line: 1 }] },
      }));
      expect(loadConfig(dir).customCommands.commands).toEqual([]);
    });

    it('drops command with id === "constructor"', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'constructor', command: ['echo'], line: 1 }] },
      }));
      expect(loadConfig(dir).customCommands.commands).toEqual([]);
    });

    // I8: cast-after-guard means malformed (non-string) onError doesn't sneak
    // through. The guard now also rejects non-string values cleanly.
    it('falls back to onError default when value is not a string', () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.json'), JSON.stringify({
        customCommands: { enabled: true, commands: [{ id: 'a', command: ['echo'], line: 1, onError: 42 }] },
      }));
      expect(loadConfig(dir).customCommands.commands[0].onError).toBe('hide');
    });
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
  it('gsd is on by default (self-gates to nothing when no GSD is present, mirroring GSD itself)', () => {
    expect(DEFAULT_CONFIG.gsd).toBe(true);
  });
  it('--gsd enables gsd from a disabled config', () => {
    expect(mergeCliFlags({ ...DEFAULT_CONFIG, gsd: false }, ['node', 'i', '--gsd']).gsd).toBe(true);
  });
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

describe('compactionCount display toggle — preset defaults', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-cfg-compact-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('compactionCount is ON by default (full preset)', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"full"}');
    expect(loadConfig(dir).display.compactionCount).toBe(true);
  });

  it('compactionCount is ON in balanced preset', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"balanced"}');
    expect(loadConfig(dir).display.compactionCount).toBe(true);
  });

  it('compactionCount is OFF in minimal preset', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"minimal"}');
    expect(loadConfig(dir).display.compactionCount).toBe(false);
  });

  it('compactionCount is true when no config file exists (DEFAULT_DISPLAY)', () => {
    expect(loadConfig(join(dir, 'nope')).display.compactionCount).toBe(true);
  });

  it('fastMode is ON in balanced preset', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"balanced"}');
    expect(loadConfig(dir).display.fastMode).toBe(true);
  });

  it('fastMode is OFF in minimal preset', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.json'), '{"preset":"minimal"}');
    expect(loadConfig(dir).display.fastMode).toBe(false);
  });

  it('fastMode is true when no config file exists (DEFAULT_DISPLAY)', () => {
    expect(loadConfig(join(dir, 'nope')).display.fastMode).toBe(true);
  });
});
