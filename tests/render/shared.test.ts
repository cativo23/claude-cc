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
    // Default format: bar pct
    expect(bar).toMatch(/░ 50%/);
  });

  it('supports custom segment count', () => {
    const bar10 = stripAnsi(buildContextBar(50, c, { segments: 10 }));
    const barDefault = stripAnsi(buildContextBar(50, c));
    // 10-segment bar is shorter than 20-segment
    expect(bar10.length).toBeLessThan(barDefault.length);
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

describe('buildContextBar — compact hint', () => {
  it('shows /compact? hint at 80-89%', () => {
    const bar = stripAnsi(buildContextBar(85, c));
    expect(bar).toContain('/compact?');
    expect(bar).not.toContain('/compact!');
  });

  it('shows /compact! hint at 90%+', () => {
    const bar = stripAnsi(buildContextBar(95, c));
    expect(bar).toContain('/compact!');
  });

  it('does not show compact hint below 80%', () => {
    const bar = stripAnsi(buildContextBar(70, c));
    expect(bar).not.toContain('/compact');
  });

  it('shows /compact? at exactly 80% (boundary inclusive)', () => {
    const bar = stripAnsi(buildContextBar(80, c));
    expect(bar).toContain('/compact?');
    expect(bar).not.toContain('/compact!');
  });

  it('shows /compact! at exactly 90% (boundary inclusive)', () => {
    const bar = stripAnsi(buildContextBar(90, c));
    expect(bar).toContain('/compact!');
  });

  it('hides compact hint when showHint=false', () => {
    const bar = stripAnsi(buildContextBar(95, c, { showHint: false }));
    expect(bar).not.toContain('/compact');
  });
});

describe('buildContextBar — plain mode (powerline)', () => {
  it('emits no inline color codes for the bar cells when plain=true', () => {
    const out = buildContextBar(50, c, { plain: true, showHint: false, showIcons: false });
    // First 20 chars (the bar itself) should be raw glyphs, no escape sequences.
    // Find the first space (separates bar from %); bar substring is everything before.
    const spaceIdx = out.indexOf(' ');
    const barSlice = out.slice(0, spaceIdx);
    expect(barSlice).not.toMatch(/\x1b\[/);
  });

  it('replaces full resets with bg-preserving partial reset', () => {
    // The colored % still wraps with the named-ANSI reset (\x1b[0m). In plain
    // mode that gets rewritten to \x1b[39;22;25m so the caller's bg flows
    // through. Verify no full \x1b[0m survives.
    const out = buildContextBar(85, c, { plain: true });
    expect(out).not.toContain('\x1b[0m');
    expect(out).toContain('\x1b[39;22;25m');
  });

  it('keeps the percentage value colored', () => {
    // 70% triggers `orange` (`\x1b[38;5;208m`); 85% would trigger blinkRed.
    const out = buildContextBar(70, c, { plain: true });
    expect(out).toContain('\x1b[38;5;208m');
  });

  it('classic mode (plain=false) is unchanged — still uses \\x1b[0m', () => {
    const out = buildContextBar(50, c, { plain: false });
    expect(out).toContain('\x1b[0m');
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
