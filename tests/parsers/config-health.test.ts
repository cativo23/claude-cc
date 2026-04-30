import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getConfigHealth } from '../../src/parsers/config-health.js';
import type { HudConfig } from '../../src/types.js';
import { DEFAULT_DISPLAY } from '../../src/types.js';

const baseConfig: HudConfig = {
  layout: 'auto',
  gsd: false,
  display: { ...DEFAULT_DISPLAY },
  colors: { mode: 'truecolor' },
};

describe('getConfigHealth', () => {
  it('returns no hints when config is clean', () => {
    expect(getConfigHealth(baseConfig, 'truecolor', '/tmp')).toHaveLength(0);
  });

  it('warns when theme is set but colorMode is named', () => {
    const config = { ...baseConfig, theme: 'dracula' };
    const hints = getConfigHealth(config, 'named', '/tmp');
    expect(hints).toHaveLength(1);
    expect(hints[0].severity).toBe('warn');
    expect(hints[0].hint).toContain('theme');
  });

  it('warns when powerline is set but colorMode is named', () => {
    const config = { ...baseConfig, style: 'powerline' as const };
    const hints = getConfigHealth(config, 'named', '/tmp');
    expect(hints).toHaveLength(1);
    expect(hints[0].severity).toBe('warn');
    expect(hints[0].hint).toContain('powerline');
  });

  it('emits both theme and powerline hints when both apply', () => {
    const config = { ...baseConfig, theme: 'nord', style: 'powerline' as const };
    const hints = getConfigHealth(config, 'named', '/tmp');
    expect(hints).toHaveLength(2);
  });

  it('emits info hint when gsd is on but no STATE.md found', () => {
    const config = { ...baseConfig, gsd: true };
    const hints = getConfigHealth(config, 'truecolor', '/tmp');
    expect(hints).toHaveLength(1);
    expect(hints[0].severity).toBe('info');
    expect(hints[0].hint).toContain('GSD');
  });

  it('no gsd hint when gsd is off', () => {
    const config = { ...baseConfig, gsd: false };
    const hints = getConfigHealth(config, 'truecolor', '/tmp');
    expect(hints).toHaveLength(0);
  });

  describe('GSD STATE.md walk', () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cc-health-')); });
    afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

    it('no gsd hint when STATE.md exists at cwd', () => {
      mkdirSync(join(dir, '.planning'), { recursive: true });
      writeFileSync(join(dir, '.planning', 'STATE.md'), '# state');
      const config = { ...baseConfig, gsd: true };
      expect(getConfigHealth(config, 'truecolor', dir)).toHaveLength(0);
    });

    it('no gsd hint when STATE.md is in an ancestor (walk ascends correctly)', () => {
      mkdirSync(join(dir, '.planning'), { recursive: true });
      writeFileSync(join(dir, '.planning', 'STATE.md'), '# state');
      const nested = join(dir, 'a', 'b', 'c');
      mkdirSync(nested, { recursive: true });
      const config = { ...baseConfig, gsd: true };
      // Pre-fix this would emit the "no STATE.md" hint because join(dir,'..')
      // never resolves and the walk silently bails after 10 iterations.
      expect(getConfigHealth(config, 'truecolor', nested)).toHaveLength(0);
    });

    it('emits gsd hint when no STATE.md exists in any ancestor', () => {
      const nested = join(dir, 'a', 'b');
      mkdirSync(nested, { recursive: true });
      const config = { ...baseConfig, gsd: true };
      const hints = getConfigHealth(config, 'truecolor', nested);
      expect(hints).toHaveLength(1);
      expect(hints[0].hint).toContain('GSD');
    });
  });
});
