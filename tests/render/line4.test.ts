import { describe, it, expect } from 'vitest';
import { renderLine4 } from '../../src/render/line4.js';
import { createColors, stripAnsi } from '../../src/render/colors.js';
import type { GsdInfo } from '../../src/types.js';

const c = createColors('named');

describe('renderLine4', () => {
  it('returns empty string when gsd is null', () => {
    expect(renderLine4(null, c)).toBe('');
  });

  it('returns empty string when no task and no update', () => {
    const gsd: GsdInfo = { currentTask: undefined, updateAvailable: false };
    expect(renderLine4(gsd, c)).toBe('');
  });

  it('shows current task', () => {
    const gsd: GsdInfo = { currentTask: 'Fix critical bug' };
    const out = stripAnsi(renderLine4(gsd, c));
    expect(out).toContain('GSD');
    expect(out).toContain('Fix critical bug');
  });

  it('shows update available warning', () => {
    const gsd: GsdInfo = { updateAvailable: true };
    const out = stripAnsi(renderLine4(gsd, c));
    expect(out).toContain('GSD update available');
  });

  it('shows both task and update', () => {
    const gsd: GsdInfo = { currentTask: 'My task', updateAvailable: true };
    const out = stripAnsi(renderLine4(gsd, c));
    expect(out).toContain('My task');
    expect(out).toContain('GSD update available');
  });
});
