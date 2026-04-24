import { describe, it, expect } from 'vitest';
import {
  renderPowerline,
  resolveStyle,
  powerlineWidth,
  applyPriorityEviction,
  POWERLINE_STYLES,
  type PowerlineSegment,
} from '../../src/render/powerline.js';
import { stripAnsi } from '../../src/render/colors.js';
import { displayWidth } from '../../src/render/text.js';
import type { RGB } from '../../src/themes.js';

const RED: RGB = { r: 255, g: 0, b: 0 };
const GREEN: RGB = { r: 0, g: 255, b: 0 };
const BLUE: RGB = { r: 0, g: 0, b: 255 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };

function seg(text: string, bg: RGB, priority = 50, icon?: string): PowerlineSegment {
  return { text, bg, fg: WHITE, priority, icon };
}

describe('powerline', () => {
  describe('resolveStyle', () => {
    it('auto picks arrow when Nerd Font available', () => {
      expect(resolveStyle('auto', true).sep).toBe(POWERLINE_STYLES.arrow.sep);
    });

    it('auto picks compatible when Nerd Font unavailable', () => {
      expect(resolveStyle('auto', false).sep).toBe('▶');
    });

    it('returns exact style by name', () => {
      expect(resolveStyle('flame', true).sep).toBe(POWERLINE_STYLES.flame.sep);
      expect(resolveStyle('diamond', true).gap).toBe(true);
      expect(resolveStyle('plain', true).sep).toBe(' ');
    });
  });

  describe('renderPowerline', () => {
    it('emits arrow separator between segments in truecolor mode', () => {
      const out = renderPowerline(
        [seg('A', RED, 100), seg('B', GREEN, 90)],
        POWERLINE_STYLES.arrow,
        'truecolor',
        120,
      );
      expect(out).toContain(POWERLINE_STYLES.arrow.sep!);
      expect(out).toContain('\x1b[48;2;255;0;0m');  // bg A
      expect(out).toContain('\x1b[48;2;0;255;0m');  // bg B
      const clean = stripAnsi(out);
      expect(clean).toContain('A');
      expect(clean).toContain('B');
      // Sep appears twice: once between A/B, once as terminator.
      const sepCount = clean.split(POWERLINE_STYLES.arrow.sep!).length - 1;
      expect(sepCount).toBe(2);
    });

    it('projects to 256-color escapes when mode=256', () => {
      const out = renderPowerline([seg('A', RED, 100)], POWERLINE_STYLES.arrow, '256', 120);
      expect(out).toMatch(/\x1b\[48;5;\d+m/);
      expect(out).not.toContain('\x1b[48;2;');
    });

    it('diamond mode wraps each segment with caps', () => {
      const out = renderPowerline(
        [seg('A', RED, 100), seg('B', GREEN, 90)],
        POWERLINE_STYLES.diamond,
        'truecolor',
        120,
      );
      const clean = stripAnsi(out);
      expect(clean).toContain(POWERLINE_STYLES.diamond.leftCap!);
      expect(clean).toContain(POWERLINE_STYLES.diamond.rightCap!);
    });

    it('round mode wraps whole line with outer caps', () => {
      const out = renderPowerline(
        [seg('A', RED, 100), seg('B', GREEN, 90)],
        POWERLINE_STYLES.round,
        'truecolor',
        120,
      );
      const clean = stripAnsi(out);
      expect(clean.startsWith(POWERLINE_STYLES.round.leftCap!)).toBe(true);
      expect(clean.endsWith(POWERLINE_STYLES.round.rightCap!)).toBe(true);
    });

    it('separator fg = current.bg, bg = next.bg (the blend trick)', () => {
      // With two distinct bg colors, the separator between them should emit
      // fg(current.bg) + bg(next.bg) right before the sep glyph.
      const out = renderPowerline(
        [seg('A', RED, 100), seg('B', GREEN, 90)],
        POWERLINE_STYLES.arrow,
        'truecolor',
        120,
      );
      const sepIdx = out.indexOf(POWERLINE_STYLES.arrow.sep!);
      const beforeSep = out.slice(0, sepIdx);
      // The final fg/bg escapes before the sep glyph must set fg=red, bg=green.
      expect(beforeSep).toMatch(/\x1b\[48;2;0;255;0m\x1b\[38;2;255;0;0m$/);
    });

    it('returns empty string on empty input', () => {
      expect(renderPowerline([], POWERLINE_STYLES.arrow, 'truecolor', 120)).toBe('');
    });

    it('terminates with reset so subsequent output is not painted', () => {
      const out = renderPowerline([seg('A', RED, 100)], POWERLINE_STYLES.arrow, 'truecolor', 120);
      expect(out.endsWith('\x1b[0m')).toBe(true);
    });
  });

  describe('powerlineWidth', () => {
    it('accounts for segment padding, separator, and terminator', () => {
      // Single segment: ' A ' (3) + sep (1) = 4
      expect(powerlineWidth([seg('A', RED)], POWERLINE_STYLES.arrow)).toBe(4);
      // Two segments: ' A ' + sep + ' B ' + terminator-sep = 3+1+3+1 = 8
      expect(powerlineWidth([seg('A', RED), seg('B', GREEN)], POWERLINE_STYLES.arrow)).toBe(8);
    });

    it('matches the actual rendered display width for arrow', () => {
      const segments = [seg('hello', RED, 100), seg('world', GREEN, 90)];
      const rendered = renderPowerline(segments, POWERLINE_STYLES.arrow, 'truecolor', 120);
      expect(powerlineWidth(segments, POWERLINE_STYLES.arrow)).toBe(displayWidth(rendered));
    });

    it('width matches rendered output for all 7 styles', () => {
      const segments = [seg('hello', RED, 100), seg('world', GREEN, 90)];
      for (const name of ['arrow', 'flame', 'slant', 'round', 'diamond', 'compatible', 'plain'] as const) {
        const style = POWERLINE_STYLES[name];
        const rendered = renderPowerline(segments, style, 'truecolor', 120);
        expect(powerlineWidth(segments, style), `width mismatch for ${name}`)
          .toBe(displayWidth(rendered));
      }
    });
  });

  describe('applyPriorityEviction', () => {
    it('drops lowest-priority segment first when over budget', () => {
      const segments = [
        seg('model', RED, 100),
        seg('branch', GREEN, 80),
        seg('dir', BLUE, 60),
        seg('version', WHITE, 20),
      ];
      // Force a tight budget that can only fit two segments.
      const kept = applyPriorityEviction(segments, POWERLINE_STYLES.arrow, 20);
      expect(kept.map(s => s.text)).toContain('model');
      expect(kept.map(s => s.text)).not.toContain('version'); // priority 20 drops first
    });

    it('always preserves the highest-priority segment', () => {
      const segments = [seg('keep-me', RED, 100), seg('drop', GREEN, 10)];
      // Budget too tight for both but large enough to hold "keep-me" untruncated.
      const kept = applyPriorityEviction(segments, POWERLINE_STYLES.arrow, 20);
      expect(kept).toHaveLength(1);
      expect(kept[0].text).toBe('keep-me');
    });

    it('truncates single remaining segment if still over budget', () => {
      const segments = [seg('a-very-long-model-name-indeed', RED, 100)];
      const original = segments[0].text.length;
      const kept = applyPriorityEviction(segments, POWERLINE_STYLES.arrow, 15);
      expect(kept[0].text.length).toBeLessThan(original);
      expect(kept[0].text).toContain('…');
    });

    it('preserves the first segment when priorities tie', () => {
      // Previously strict `<` + left-to-right scan would drop the model on ties.
      const segments = [
        seg('keep-me', RED, 50),
        seg('drop',    GREEN, 50),
      ];
      const kept = applyPriorityEviction(segments, POWERLINE_STYLES.arrow, 20);
      expect(kept.map(s => s.text)).toContain('keep-me');
    });

    it('truncation budget respects diamond style geometry', () => {
      // Diamond uses leftCap+rightCap (2 cols) + padding (2) + content,
      // vs arrow's leftCap(0) + terminator(1) + padding(2) + content.
      // Budget calc must differ by 1 to stay within safeCols.
      const long = 'a'.repeat(50);
      const segments = [seg(long, RED, 100)];
      const kept = applyPriorityEviction(segments, POWERLINE_STYLES.diamond, 20);
      const rendered = renderPowerline(kept, POWERLINE_STYLES.diamond, 'truecolor', 20);
      const safeCols = 20 - 4;
      expect(displayWidth(rendered)).toBeLessThanOrEqual(safeCols);
    });

    it('truncates hyperlink-wrapped text without leaking raw escape bytes', () => {
      const osc = '\x1b]8;;https://example.com\x1b\\clickable-label-text\x1b]8;;\x1b\\';
      const segments = [{ text: osc, bg: RED, fg: WHITE, priority: 100 } as PowerlineSegment];
      const kept = applyPriorityEviction(segments, POWERLINE_STYLES.arrow, 15);
      // stripAnsi must run before truncField so the result is plain text + ellipsis,
      // not a cut-in-half OSC 8 sequence.
      expect(kept[0].text).not.toContain('\x1b');
      expect(kept[0].text).toContain('…');
    });
  });

  describe('stripAnsi handles powerline output', () => {
    it('strips all bg and fg escapes from rendered powerline', () => {
      const out = renderPowerline(
        [seg('A', RED, 100), seg('B', GREEN, 90)],
        POWERLINE_STYLES.arrow,
        'truecolor',
        120,
      );
      const clean = stripAnsi(out);
      expect(clean).not.toContain('\x1b');
      expect(clean).toContain('A');
      expect(clean).toContain('B');
    });
  });
});
