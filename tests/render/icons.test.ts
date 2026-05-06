import { describe, it, expect } from 'vitest';
import { ICONS, NERD_ICONS, EMOJI_ICONS, NO_ICONS, resolveIcons } from '../../src/render/icons.js';

describe('ICONS (legacy export)', () => {
  it('is the same as NERD_ICONS', () => {
    expect(ICONS).toBe(NERD_ICONS);
  });
});

describe('NERD_ICONS', () => {
  it('uses nerd font codepoints', () => {
    expect(NERD_ICONS.model).toBe('\uEE0D');
    expect(NERD_ICONS.branch).toBe('\uE725');
    expect(NERD_ICONS.folder).toBe('\uF07C');
    expect(NERD_ICONS.fire).toBe('\uF06D');
    expect(NERD_ICONS.skull).toBe('\uEE15');
  });
});

describe('EMOJI_ICONS', () => {
  it('uses emoji codepoints', () => {
    expect(EMOJI_ICONS.model).toBe('\u{1F916}');
    expect(EMOJI_ICONS.branch).toBe('\u{1F33F}');
    expect(EMOJI_ICONS.folder).toBe('\u{1F4C2}');
    expect(EMOJI_ICONS.fire).toBe('\u{1F525}');
    expect(EMOJI_ICONS.skull).toBe('\u{1F480}');
  });
});

describe('NO_ICONS', () => {
  it('uses empty strings for decorative icons', () => {
    expect(NO_ICONS.model).toBe('');
    expect(NO_ICONS.branch).toBe('');
    expect(NO_ICONS.folder).toBe('');
    expect(NO_ICONS.clock).toBe('');
  });

  it('uses ASCII fallbacks for semantic icons', () => {
    expect(NO_ICONS.fire).toBe('!');
    expect(NO_ICONS.skull).toBe('!!');
    expect(NO_ICONS.warning).toBe('!');
  });
});

describe('IconSet.battery', () => {
  // Battery glyph maps usedPercentage to a visual indicator. The Nerd Font
  // family ships a discrete progression that mirrors hardware battery widgets;
  // we honour that spectrum so a glance at the glyph alone communicates load.
  it('NERD_ICONS.battery returns Material Design battery codepoints by 10% bucket', () => {
    expect(NERD_ICONS.battery(0)).toBe('\u{F008E}');   // outline
    expect(NERD_ICONS.battery(9)).toBe('\u{F008E}');
    expect(NERD_ICONS.battery(10)).toBe('\u{F007A}');  // 10
    expect(NERD_ICONS.battery(29)).toBe('\u{F007B}');  // 20
    expect(NERD_ICONS.battery(50)).toBe('\u{F007E}');  // 50
    expect(NERD_ICONS.battery(70)).toBe('\u{F0080}');  // 70
    expect(NERD_ICONS.battery(78)).toBe('\u{F0080}');  // still 70 bucket
    expect(NERD_ICONS.battery(80)).toBe('\u{F0081}');  // 80
    expect(NERD_ICONS.battery(85)).toBe('\u{F0081}');  // still 80 bucket — alert reserved for 100%
    expect(NERD_ICONS.battery(90)).toBe('\u{F0082}');  // 90
    expect(NERD_ICONS.battery(99)).toBe('\u{F0082}');  // still 90 bucket
  });

  it('NERD_ICONS.battery returns alert glyph only at the 100% ceiling — quota exhausted', () => {
    expect(NERD_ICONS.battery(100)).toBe('\u{F0083}');
  });

  it('EMOJI_ICONS.battery uses 🔋 normally, 🪫 at ≥85%, and 💀 at the 100% ceiling', () => {
    expect(EMOJI_ICONS.battery(50)).toBe('\u{1F50B}');   // 🔋 normal
    expect(EMOJI_ICONS.battery(84)).toBe('\u{1F50B}');   // 🔋 just below critical
    expect(EMOJI_ICONS.battery(85)).toBe('\u{1FAAB}');   // 🪫 critical zone starts
    expect(EMOJI_ICONS.battery(99)).toBe('\u{1FAAB}');   // 🪫 still below ceiling
    expect(EMOJI_ICONS.battery(100)).toBe('\u{1F480}');  // 💀 quota exhausted
  });

  it('NO_ICONS.battery returns empty string regardless of percentage — matches the icon-less mode contract', () => {
    expect(NO_ICONS.battery(0)).toBe('');
    expect(NO_ICONS.battery(50)).toBe('');
    expect(NO_ICONS.battery(100)).toBe('');
  });

  it('NERD_ICONS.battery rounds fractional percentages to align with .toFixed(0) display', () => {
    // Math.round(89.4) = 89 → 80-bucket. Math.round(89.5) = 90 → 90-bucket.
    expect(NERD_ICONS.battery(89.4)).toBe('\u{F0081}');  // rounds down to 89 → 80-bucket
    expect(NERD_ICONS.battery(89.5)).toBe('\u{F0082}');  // rounds up to 90 → 90-bucket
    expect(NERD_ICONS.battery(99.4)).toBe('\u{F0082}');  // rounds down to 99 → 90-bucket
    expect(NERD_ICONS.battery(99.5)).toBe('\u{F0083}');  // rounds up to 100 → alert (matches .toFixed(0))
    expect(NERD_ICONS.battery(100.0)).toBe('\u{F0083}'); // exact 100 → alert
    expect(NERD_ICONS.battery(150)).toBe('\u{F0083}');   // over-range still alert
  });

  it('NERD_ICONS.battery returns outline glyph for non-finite / negative inputs defensively', () => {
    // `Number.isFinite` rejects NaN, +Infinity, -Infinity uniformly. Treating
    // them all as "no data" (outline) is safer than guessing intent.
    expect(NERD_ICONS.battery(NaN)).toBe('\u{F008E}');
    expect(NERD_ICONS.battery(-5)).toBe('\u{F008E}');
    expect(NERD_ICONS.battery(Infinity)).toBe('\u{F008E}');
    expect(NERD_ICONS.battery(-Infinity)).toBe('\u{F008E}');
    // Finite over-range still hits alert (semantically "past the ceiling").
    expect(NERD_ICONS.battery(150)).toBe('\u{F0083}');
  });

  it('EMOJI_ICONS.battery uses 💀 at the 100% ceiling — aligns with nerd alert doctrine', () => {
    expect(EMOJI_ICONS.battery(99.5)).toBe('\u{1F480}');  // rounds to 100 → 💀
    expect(EMOJI_ICONS.battery(100)).toBe('\u{1F480}');   // exact ceiling → 💀
    expect(EMOJI_ICONS.battery(99.4)).toBe('\u{1FAAB}');  // rounds to 99 → still 🪫
  });
});

describe('resolveIcons', () => {
  it('returns NERD_ICONS by default', () => {
    expect(resolveIcons()).toBe(NERD_ICONS);
    expect(resolveIcons(undefined)).toBe(NERD_ICONS);
  });

  it('returns NERD_ICONS for "nerd"', () => {
    expect(resolveIcons('nerd')).toBe(NERD_ICONS);
  });

  it('returns EMOJI_ICONS for "emoji"', () => {
    expect(resolveIcons('emoji')).toBe(EMOJI_ICONS);
  });

  it('returns NO_ICONS for "none"', () => {
    expect(resolveIcons('none')).toBe(NO_ICONS);
  });
});
