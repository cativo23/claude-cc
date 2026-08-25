import { describe, it, expect } from 'vitest';
import {
  buildContextBar,
  formatGitChanges,
  getCustomCommandsForLine,
  renderCustomCommand,
  SEP,
  SEP_MINIMAL,
} from '../../src/render/shared.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import { NERD_ICONS, EMOJI_ICONS, NO_ICONS } from '../../src/render/icons.js';
import type { GitStatus } from '../../src/types.js';
import type { CustomCommandOutput } from '../../src/parsers/custom-commands.js';

const c = createColors('named');


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

  it('uses 20 segments at cols >= 100 (adaptive default)', () => {
    const bar100 = stripAnsi(buildContextBar(50, c, { cols: 120 }));
    const barDefault = stripAnsi(buildContextBar(50, c));
    expect(bar100.length).toBe(barDefault.length);
  });

  it('uses 12 segments at cols=60-99 (adaptive)', () => {
    const bar60 = stripAnsi(buildContextBar(50, c, { cols: 60 }));
    const bar100 = stripAnsi(buildContextBar(50, c, { cols: 120 }));
    // 12-segment bar is shorter than 20-segment
    expect(bar60.length).toBeLessThan(bar100.length);
  });

  it('uses 8 segments at cols < 60 (adaptive)', () => {
    const bar50 = stripAnsi(buildContextBar(50, c, { cols: 59 }));
    const bar60 = stripAnsi(buildContextBar(50, c, { cols: 60 }));
    // 8-segment bar is shorter than 12-segment
    expect(bar50.length).toBeLessThan(bar60.length);
  });

  it('pins exact bar lengths at boundaries (regression guard)', () => {
    // The bar prefix counts filled+empty cells; the rest is " 50%" suffix.
    const cellsAt = (cols: number) => {
      const out = stripAnsi(buildContextBar(50, c, { cols }));
      const m = out.match(/^[█░]+/);
      return m ? m[0].length : 0;
    };
    expect(cellsAt(100)).toBe(20); // exact boundary: ≥100 → 20
    expect(cellsAt(99)).toBe(12);  // one below → 12
    expect(cellsAt(60)).toBe(12);  // exact boundary: ≥60 → 12
    expect(cellsAt(59)).toBe(8);   // one below → 8
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
  // Tests pin critical=85 explicitly so they continue exercising the original
  // critical/critical+5 boundary semantics regardless of the default threshold
  // (issue #138 lowered the default critical to 78 — these tests verify the
  // mechanic, not the default value).
  it('shows /compact? hint at critical-(critical+5)% (85-89%)', () => {
    const bar = stripAnsi(buildContextBar(87, c, { warningThreshold: 70, criticalThreshold: 85 }));
    expect(bar).toContain('/compact?');
    expect(bar).not.toContain('/compact!');
  });

  it('shows /compact! hint at >= critical+5% (90%+)', () => {
    const bar = stripAnsi(buildContextBar(95, c, { warningThreshold: 70, criticalThreshold: 85 }));
    expect(bar).toContain('/compact!');
  });

  it('does not show compact hint below critical (85%)', () => {
    const bar = stripAnsi(buildContextBar(80, c, { warningThreshold: 70, criticalThreshold: 85 }));
    expect(bar).not.toContain('/compact');
  });

  it('shows /compact? at exactly critical (85%) — boundary inclusive', () => {
    const bar = stripAnsi(buildContextBar(85, c, { warningThreshold: 70, criticalThreshold: 85 }));
    expect(bar).toContain('/compact?');
    expect(bar).not.toContain('/compact!');
  });

  it('shows /compact! at exactly critical+5 (90%) — boundary inclusive', () => {
    const bar = stripAnsi(buildContextBar(90, c, { warningThreshold: 70, criticalThreshold: 85 }));
    expect(bar).toContain('/compact!');
  });

  it('hides compact hint when showHint=false', () => {
    const bar = stripAnsi(buildContextBar(95, c, { warningThreshold: 70, criticalThreshold: 85, showHint: false }));
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

describe('buildContextBar — configurable thresholds', () => {
  it('respects custom warningThreshold for fire icon', () => {
    // With warning=50, fire should show at 50% (no longer green/yellow zone)
    const bar = buildContextBar(50, c, { warningThreshold: 50, criticalThreshold: 90 });
    expect(bar).toContain(''); // fire icon
  });

  it('respects custom criticalThreshold for skull icon', () => {
    // With critical=60, skull should show at 60%
    const bar = buildContextBar(60, c, { warningThreshold: 30, criticalThreshold: 60 });
    expect(bar).toContain(''); // skull icon
  });

  it('color transitions to orange at custom warning threshold', () => {
    // With warning=40, pct=45 should be orange (\x1b[38;5;208m), not yellow
    const bar = buildContextBar(45, c, { warningThreshold: 40, criticalThreshold: 80 });
    expect(bar).toContain('\x1b[38;5;208m');
  });

  it('color transitions to blinkRed at custom critical threshold', () => {
    // With critical=50, pct=55 should be blinkRed (\x1b[5;31m)
    const bar = buildContextBar(55, c, { warningThreshold: 30, criticalThreshold: 50 });
    expect(bar).toContain('\x1b[5;31m');
  });

  it('default thresholds (70/85) preserved when opts omitted', () => {
    // pct=72 → fire icon (>=70), still orange (<85)
    const bar = buildContextBar(72, c);
    expect(bar).toContain('');
    expect(bar).not.toContain('');
    // pct=86 → skull icon (>=85)
    const skullBar = buildContextBar(86, c);
    expect(skullBar).toContain('');
  });
});

describe('buildContextBar — out-of-range pct', () => {
  it('does not throw RangeError when pct > 100', () => {
    expect(() => buildContextBar(105, c)).not.toThrow();
    expect(stripAnsi(buildContextBar(105, c))).toContain('%');
  });

  it('does not throw RangeError when pct < 0', () => {
    expect(() => buildContextBar(-5, c)).not.toThrow();
  });

  it('does not crash on NaN pct', () => {
    expect(() => buildContextBar(NaN, c)).not.toThrow();
  });
});

// Issue #138: The auto-compact warning glyph fires in the window just below
// the platform's auto-compact threshold (Claude 80%, Qwen 70%) \u2014 independent
// of the user-configurable warning/critical thresholds. The glyph reads RED
// to signal "irreversible compaction imminent".
describe('buildContextBar \u2014 nearAutoCompact glyph', () => {
  it('nearAutoCompact: true emits warning glyph (nerd icon set)', () => {
    const bar = buildContextBar(76, c, { nearAutoCompact: true, iconSet: NERD_ICONS });
    expect(bar).toContain(NERD_ICONS.warning);
  });

  it('nearAutoCompact: true emits emoji warning glyph', () => {
    const bar = buildContextBar(76, c, { nearAutoCompact: true, iconSet: EMOJI_ICONS });
    expect(bar).toContain(EMOJI_ICONS.warning);
  });

  it('nearAutoCompact omitted \u2192 no warning glyph', () => {
    const bar = buildContextBar(76, c, { iconSet: NERD_ICONS });
    expect(bar).not.toContain(NERD_ICONS.warning);
  });

  it('nearAutoCompact: false \u2192 no warning glyph', () => {
    const bar = buildContextBar(76, c, { nearAutoCompact: false, iconSet: NERD_ICONS });
    expect(bar).not.toContain(NERD_ICONS.warning);
  });

  it('coexists with fire glyph in the warning zone', () => {
    // pct=76, warning=65 \u2192 fire icon fires; nearAutoCompact also fires.
    const bar = buildContextBar(76, c, {
      nearAutoCompact: true,
      warningThreshold: 65,
      criticalThreshold: 90,
      iconSet: NERD_ICONS,
    });
    expect(bar).toContain(NERD_ICONS.warning);
    expect(bar).toContain(NERD_ICONS.fire);
  });

  it('coexists with skull glyph past critical', () => {
    // The \u26a0 glyph is independent of the critical color tier \u2014 both should render.
    const bar = buildContextBar(78, c, {
      nearAutoCompact: true,
      warningThreshold: 65,
      criticalThreshold: 78,
      iconSet: NERD_ICONS,
    });
    expect(bar).toContain(NERD_ICONS.warning);
    expect(bar).toContain(NERD_ICONS.skull);
  });

  it('warning glyph carries the red ANSI escape', () => {
    // Red in the named-ANSI palette is `\x1b[31m` (see render/colors.ts).
    // The warning glyph must be colored red \u2014 distinct from orange fire (208)
    // or blinkRed skull (5;31). The escape should immediately precede the glyph.
    const bar = buildContextBar(76, c, { nearAutoCompact: true, iconSet: NERD_ICONS });
    const pattern = new RegExp(`\\x1b\\[31m[^\\x1b]*${NERD_ICONS.warning}`);
    expect(bar).toMatch(pattern);
  });

  it('showIcons: false suppresses the warning glyph', () => {
    const bar = buildContextBar(76, c, {
      nearAutoCompact: true,
      showIcons: false,
      iconSet: NERD_ICONS,
    });
    expect(bar).not.toContain(NERD_ICONS.warning);
  });

  it('NO_ICONS set emits ASCII "!" warning glyph (independent of fire "!" fallback)', () => {
    // NO_ICONS.fire and NO_ICONS.warning both happen to be '!'. To prove the
    // warning glyph is actually emitted (not just the fire fallback), compare
    // counts: with nearAutoCompact:true we expect strictly MORE '!' chars than
    // without it. Use no warningThreshold/criticalThreshold tweak \u2014 at 76%
    // with defaults (post-impl: 65/78), fire fires either way; the delta must
    // come from the warning glyph.
    const without = stripAnsi(buildContextBar(76, c, { iconSet: NO_ICONS }));
    const withFlag = stripAnsi(buildContextBar(76, c, { nearAutoCompact: true, iconSet: NO_ICONS }));
    const countBangs = (s: string) => (s.match(/!/g) ?? []).length;
    expect(countBangs(withFlag)).toBeGreaterThan(countBangs(without));
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

// \u2500\u2500 Custom command render helpers (issue #143 phase 3) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Build a CustomCommandOutput with sane defaults; tests only override what
// they care about. Keeps individual cases short and intent-focused.
function mkOutput(overrides: Partial<CustomCommandOutput> = {}): CustomCommandOutput {
  return {
    id: 'test',
    text: 'hello',
    state: 'ok',
    line: 1,
    ansi: false,
    ...overrides,
  };
}

describe('getCustomCommandsForLine', () => {
  it('returns [] for undefined input', () => {
    expect(getCustomCommandsForLine(undefined, 1)).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(getCustomCommandsForLine([], 1)).toEqual([]);
  });

  it('filters to outputs matching the requested line', () => {
    const outs = [
      mkOutput({ id: 'a', line: 1 }),
      mkOutput({ id: 'b', line: 2 }),
      mkOutput({ id: 'c', line: 1 }),
    ];
    const filtered = getCustomCommandsForLine(outs, 1);
    expect(filtered.map(o => o.id)).toEqual(['a', 'c']);
  });

  it('drops outputs in hidden state regardless of line match', () => {
    const outs = [
      mkOutput({ id: 'visible', line: 2, state: 'ok' }),
      mkOutput({ id: 'gone', line: 2, state: 'hidden', text: '' }),
    ];
    const filtered = getCustomCommandsForLine(outs, 2);
    expect(filtered.map(o => o.id)).toEqual(['visible']);
  });

  it('preserves insertion order', () => {
    const outs = [
      mkOutput({ id: 'first', line: 3 }),
      mkOutput({ id: 'second', line: 3 }),
      mkOutput({ id: 'third', line: 3 }),
    ];
    expect(getCustomCommandsForLine(outs, 3).map(o => o.id)).toEqual(['first', 'second', 'third']);
  });
});

describe('renderCustomCommand', () => {
  const colors = createColors('named');

  it('renders plain ok output without color or label', () => {
    const out = renderCustomCommand(mkOutput({ text: 'plain' }), colors);
    expect(out).toBe('plain');
  });

  it('collapses an embedded newline even when the entry was cached before the write-side fix existed', () => {
    // Defense in depth: custom-refresh.ts sanitizes before writing, but a
    // pre-existing cache entry (or any future write path that forgets to)
    // must not still visibly break the statusline into two lines.
    const out = renderCustomCommand(mkOutput({ text: 'up 3 days\n' }), colors);
    expect(out).toBe('up 3 days');
    expect(out).not.toContain('\n');
  });

  it('collapses a newline embedded inside an ANSI SGR sequence without corrupting the escape (ansi: true)', () => {
    const out = renderCustomCommand(
      mkOutput({ text: '\x1b[32mfoo\nbar\x1b[0m', ansi: true }),
      colors,
    );
    expect(out).toBe('\x1b[32mfoo bar\x1b[0m');
  });

  it('renders nothing when the output sanitizes down to empty (whitespace/newline-only stdout)', () => {
    // A legacy cache entry that was only "\n", or a command whose stdout is
    // pure whitespace, must render as fully absent — not an empty-but-truthy
    // color escape or an orphaned label with a trailing space.
    expect(renderCustomCommand(mkOutput({ text: '\n' }), colors)).toBe('');
    expect(renderCustomCommand(mkOutput({ text: '\n', color: 'green' }), colors)).toBe('');
    expect(renderCustomCommand(mkOutput({ text: '\n', label: '◆' }), colors)).toBe('');
  });

  it('strips ANSI from text when ansi: false', () => {
    // Embedded ANSI in user-provided text must not leak through when ansi is off.
    const out = renderCustomCommand(
      mkOutput({ text: '\x1b[31mred\x1b[0m text', ansi: false }),
      colors,
    );
    expect(stripAnsi(out)).toBe('red text');
    expect(out).not.toContain('\x1b[31m');
  });

  it('passes ANSI through when ansi: true', () => {
    const out = renderCustomCommand(
      mkOutput({ text: '\x1b[31mred\x1b[0m', ansi: true }),
      colors,
    );
    expect(out).toContain('\x1b[31m');
  });

  it('prepends label with a single space when set', () => {
    const out = renderCustomCommand(mkOutput({ text: 'value', label: '\u25c6' }), colors);
    expect(stripAnsi(out)).toBe('\u25c6 value');
  });

  it('applies color when ansi: false and color set', () => {
    const out = renderCustomCommand(mkOutput({ text: 'green', color: 'green' }), colors);
    // Named-ANSI green is \x1b[32m
    expect(out).toContain('\x1b[32m');
    expect(stripAnsi(out)).toBe('green');
  });

  it('does NOT apply color when ansi: true (avoids nested escapes)', () => {
    const out = renderCustomCommand(
      mkOutput({ text: 'preset', color: 'green', ansi: true }),
      colors,
    );
    // No wrapper escape \u2014 only the raw text comes through.
    expect(out).toBe('preset');
  });

  it('returns empty string for hidden state', () => {
    expect(renderCustomCommand(mkOutput({ state: 'hidden', text: '' }), colors)).toBe('');
  });

  it('dims output when state is stale', () => {
    const out = renderCustomCommand(mkOutput({ text: 'fading', state: 'stale' }), colors);
    // dim escape is \x1b[2m in named mode
    expect(out).toContain('\x1b[2m');
    expect(stripAnsi(out)).toBe('fading');
  });

  it('stale dim wraps a colored output (dim applied last)', () => {
    const out = renderCustomCommand(
      mkOutput({ text: 'x', state: 'stale', color: 'green' }),
      colors,
    );
    // dim escape must be present somewhere outside the color escape.
    expect(out).toContain('\x1b[2m');
    expect(out).toContain('\x1b[32m');
  });

  it('renders timeout/error states with their text untouched (parser already remapped)', () => {
    const timeout = renderCustomCommand(mkOutput({ text: '\u2026', state: 'timeout' }), colors);
    expect(stripAnsi(timeout)).toBe('\u2026');
    const error = renderCustomCommand(mkOutput({ text: '?', state: 'error' }), colors);
    expect(stripAnsi(error)).toBe('?');
  });

  it('ignores unknown color names without throwing', () => {
    const out = renderCustomCommand(
      // Cast intentionally: simulate parser drift / mis-typed config.
      mkOutput({ text: 'safe', color: 'nope' as unknown as CustomCommandOutput['color'] }),
      colors,
    );
    expect(stripAnsi(out)).toBe('safe');
  });

  describe('valueMap (custom widgets)', () => {
    const valueMap = [
      { lt: 60, icon: '🟢' },
      { lt: 80, icon: '🟡', color: 'yellow' as const },
      { icon: '🔴', color: 'red' as const },
    ];

    it('prepends the matching tier icon and applies its color', () => {
      const out = renderCustomCommand(mkOutput({ text: '95', valueMap }), colors);
      expect(stripAnsi(out)).toBe('🔴 95');
      expect(out).toContain(colors.red('🔴 95'));
    });

    it('matches the first tier for a low value, no color override needed', () => {
      const out = renderCustomCommand(mkOutput({ text: '10', valueMap }), colors);
      expect(stripAnsi(out)).toBe('🟢 10');
    });

    it('renders the icon uncolored when the matching tier has no color of its own', () => {
      const noColorMap = [{ lt: 60, icon: '🟢' }];
      const out = renderCustomCommand(mkOutput({ text: '10', valueMap: noColorMap }), colors);
      expect(stripAnsi(out)).toBe('🟢 10');
      expect(out).not.toContain('\x1b[');
    });

    it("tier's color overrides the widget's static color", () => {
      const out = renderCustomCommand(mkOutput({ text: '95', color: 'cyan', valueMap }), colors);
      expect(out).toContain(colors.red('🔴 95'));
      expect(out).not.toContain('\x1b[36m'); // cyan
    });

    it('falls back to the static color when the output does not parse as numeric', () => {
      const out = renderCustomCommand(mkOutput({ text: 'not-a-number', color: 'green', valueMap }), colors);
      expect(stripAnsi(out)).toBe('not-a-number');
      expect(out).toContain(colors.green('not-a-number'));
    });

    it('ignores valueMap entirely when ansi is true', () => {
      const out = renderCustomCommand(mkOutput({ text: '95', ansi: true, valueMap }), colors);
      expect(out).toBe('95');
    });

    it('combines a static label with the tier icon: "label icon value"', () => {
      const out = renderCustomCommand(mkOutput({ text: '95', label: 'cpu', valueMap }), colors);
      expect(stripAnsi(out)).toBe('cpu 🔴 95');
    });

    it('dims the tier color when state is stale', () => {
      const out = renderCustomCommand(mkOutput({ text: '95', state: 'stale', valueMap }), colors);
      expect(out).toContain(colors.dim(colors.red('🔴 95')));
    });

    it('does not throw and falls back to static behavior when a value has no matching tier and no catch-all', () => {
      const noCatchAll = [{ lt: 10, icon: '🟢' }];
      const out = renderCustomCommand(mkOutput({ text: '50', color: 'yellow', valueMap: noCatchAll }), colors);
      expect(stripAnsi(out)).toBe('50');
      expect(out).toContain(colors.yellow('50'));
    });
  });
});
