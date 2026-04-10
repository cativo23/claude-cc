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
