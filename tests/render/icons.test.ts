import { describe, it, expect } from 'vitest';
import { ICONS } from '../../src/render/icons.js';

describe('ICONS', () => {
  it('exports all required icon codepoints', () => {
    expect(ICONS.model).toBe('\uEE0D');
    expect(ICONS.branch).toBe('\uE725');
    expect(ICONS.folder).toBe('\uF07C');
    expect(ICONS.fire).toBe('\uF06D');
    expect(ICONS.skull).toBe('\uEE15');
    expect(ICONS.comment).toBe('\uF075');
    expect(ICONS.clock).toBe('\uF017');
    expect(ICONS.bolt).toBe('\uF0E7');
    expect(ICONS.tree).toBe('\uF1BB');
    expect(ICONS.cubes).toBe('\uF1B3');
    expect(ICONS.hammer).toBe('\uEEFF');
    expect(ICONS.warning).toBe('\uF071');
    expect(ICONS.barFull).toBe('\u2588');
    expect(ICONS.barEmpty).toBe('\u2591');
    expect(ICONS.ellipsis).toBe('\u2026');
    expect(ICONS.dash).toBe('\u2014');
  });
});
