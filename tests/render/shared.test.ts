import { describe, it, expect } from 'vitest';
import { getModelName, buildContextBar, formatGitChanges, SEP, SEP_MINIMAL } from '../../src/render/shared.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import type { GitStatus } from '../../src/types.js';

const c = createColors('named');

describe('getModelName', () => {
  it('returns string model as-is', () => {
    expect(getModelName('Claude Opus 4')).toBe('Claude Opus 4');
  });

  it('extracts display_name from object model', () => {
    expect(getModelName({ display_name: 'Sonnet 3.7' })).toBe('Sonnet 3.7');
  });

  it('returns empty string for unknown shape', () => {
    expect(getModelName('' as never)).toBe('');
  });
});

describe('buildContextBar', () => {
  it('uses 20 segments by default', () => {
    const bar = stripAnsi(buildContextBar(50, c));
    expect(bar).toContain('50%');
    // Default format: [bar] pct
    expect(bar).toMatch(/\] 50%/);
  });

  it('supports custom segment count', () => {
    const bar10 = stripAnsi(buildContextBar(50, c, { segments: 10 }));
    const barDefault = stripAnsi(buildContextBar(50, c));
    // 10-segment bar is shorter than 20-segment
    expect(bar10.length).toBeLessThan(barDefault.length);
  });

  it('puts pct inside bar when pctInsideBar is true', () => {
    const bar = stripAnsi(buildContextBar(50, c, { pctInsideBar: true }));
    // Format: [bar pct]
    expect(bar).toMatch(/50%\]$/);
  });

  it('shows decimal for pct < 10', () => {
    const bar = stripAnsi(buildContextBar(5, c));
    expect(bar).toContain('5.0%');
  });

  it('shows integer for pct >= 10', () => {
    const bar = stripAnsi(buildContextBar(55, c));
    expect(bar).toContain('55%');
    expect(bar).not.toContain('55.0%');
  });

  it('shows skull icon at >=80%', () => {
    const bar = buildContextBar(85, c);
    expect(bar).toContain('\uEE15'); // skull icon
  });

  it('shows fire icon at 65-79%', () => {
    const bar = buildContextBar(70, c);
    expect(bar).toContain('\uF06D'); // fire icon
  });

  it('hides icons when showIcons=false', () => {
    const bar = buildContextBar(85, c, { showIcons: false });
    expect(bar).not.toContain('\uEE15');
    const bar70 = buildContextBar(70, c, { showIcons: false });
    expect(bar70).not.toContain('\uF06D');
  });
});

describe('formatGitChanges', () => {
  it('formats staged as +', () => {
    const git: GitStatus = { branch: 'main', staged: 3, modified: 0, untracked: 0 };
    const parts = formatGitChanges(git, c);
    expect(stripAnsi(parts[0])).toBe('+3');
  });

  it('formats modified as ! (not ~)', () => {
    const git: GitStatus = { branch: 'main', staged: 0, modified: 2, untracked: 0 };
    const parts = formatGitChanges(git, c);
    expect(stripAnsi(parts[0])).toBe('!2');
  });

  it('formats untracked as ?', () => {
    const git: GitStatus = { branch: 'main', staged: 0, modified: 0, untracked: 5 };
    const parts = formatGitChanges(git, c);
    expect(stripAnsi(parts[0])).toBe('?5');
  });

  it('returns empty array when no changes', () => {
    const git: GitStatus = { branch: 'main', staged: 0, modified: 0, untracked: 0 };
    expect(formatGitChanges(git, c)).toEqual([]);
  });

  it('returns all parts in order: staged, modified, untracked', () => {
    const git: GitStatus = { branch: 'main', staged: 1, modified: 2, untracked: 3 };
    const parts = formatGitChanges(git, c).map(stripAnsi);
    expect(parts).toEqual(['+1', '!2', '?3']);
  });
});

describe('SEP constants', () => {
  it('SEP uses Unicode pipe', () => {
    expect(SEP).toContain('\u2502');
  });

  it('SEP_MINIMAL uses ASCII pipe', () => {
    expect(SEP_MINIMAL).toContain('|');
    expect(SEP_MINIMAL).not.toContain('\u2502');
  });
});
