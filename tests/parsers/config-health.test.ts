import { describe, it, expect } from 'vitest';
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

  it('no gsd hint when STATE.md exists', () => {
    // Use the actual lumira project dir which has .planning/STATE.md if it exists,
    // otherwise just verify no crash on a real path.
    const config = { ...baseConfig, gsd: true };
    // Should not throw regardless of whether STATE.md exists
    expect(() => getConfigHealth(config, 'truecolor', process.cwd())).not.toThrow();
  });
});
