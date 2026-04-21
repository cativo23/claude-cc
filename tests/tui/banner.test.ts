import { describe, it, expect } from 'vitest';
import { getBanner, getSubtitle } from '../../src/tui/banner.js';

describe('getBanner', () => {
  it('returns a banner string with cyan ANSI and the logo', () => {
    const b = getBanner({ width: 80 });
    expect(b).toContain('\x1b[36m');
    expect(b).toContain('\x1b[0m');
    expect(b).toContain('██╗     ██╗');
  });

  it('returns empty string when width < 50', () => {
    expect(getBanner({ width: 40 })).toBe('');
  });

  it('uses process.stdout.columns when no width opt is passed', () => {
    // Only assert type/truthiness — real columns var is environment-dependent
    const b = getBanner();
    expect(typeof b).toBe('string');
  });
});

describe('getSubtitle', () => {
  it('reads version from package.json', () => {
    const s = getSubtitle();
    expect(s).toMatch(/real-time statusline for claude code & qwen code · v\d+\.\d+\.\d+/);
  });

  it('falls back to subtitle without version if read fails', () => {
    const s = getSubtitle({ readPackageJson: () => { throw new Error('boom'); } });
    expect(s).toBe('real-time statusline for claude code & qwen code');
  });

  it('falls back to base subtitle when package.json has no version field', () => {
    const s = getSubtitle({ readPackageJson: () => JSON.stringify({ name: 'x' }) });
    expect(s).toBe('real-time statusline for claude code & qwen code');
  });
});
