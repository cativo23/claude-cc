import type { ColorMode } from './colors.js';
import { displayWidth, truncField } from './text.js';
import { stripAnsi } from './colors.js';
import { type RGB, rgbTo256Index } from '../themes.js';
// Re-export the canonical name list type so this module stays the runtime
// home of POWERLINE_STYLES while types.ts is the single source of truth
// for the name set. A test asserts the map keys match the const.
import type { PowerlineStyleName as CanonicalName } from '../types.js';

// Powerline renderer — segment-based with colored backgrounds and glyph
// separators that blend adjacent segment colors. See research notes: all
// common implementations (powerline-go, oh-my-posh, vim-airline) agree on
// `sep.fg = current.bg, sep.bg = next.bg` to produce the blend effect.

const RESET = '\x1b[0m';
const RESET_BG = '\x1b[49m';

export interface PowerlineSegment {
  text: string;
  icon?: string;
  bg: RGB;
  fg?: RGB;
  /** Lower = dropped first when terminal width is exceeded. */
  priority: number;
}

/** Aliased from types.ts so types.ts is the single source of truth. */
export type PowerlineStyleName = CanonicalName;

interface Style {
  leftCap?: string;
  sep?: string;
  rightCap?: string;
  /** True = diamond mode: each segment is isolated with its own caps + a space gap. */
  gap?: boolean;
  /** Visual width cost of a separator glyph (Nerd Font glyphs are 1 col). */
  sepWidth: number;
}

export const POWERLINE_STYLES: Record<Exclude<PowerlineStyleName, 'auto'>, Style> = {
  arrow:      { sep: '', sepWidth: 1 },
  flame:      { sep: '', sepWidth: 1 },
  slant:      { sep: '', sepWidth: 1 },
  // Round uses thin `` between same-pill segments and `` at
  // bg transitions. We always use `` here because each lumira segment
  // has a distinct bg — the thin variant would only apply if we re-used a bg.
  round:      { leftCap: '', sep: '', rightCap: '', sepWidth: 1 },
  diamond:    { leftCap: '', rightCap: '', gap: true, sepWidth: 2 },
  // `▶` (U+25B6) sits in the 0x25A0–0x25FF range which displayWidth treats as
  // double-width. Must match that assumption or powerlineWidth drifts from
  // the actual rendered width.
  compatible: { sep: '▶', sepWidth: 2 },
  plain:      { sep: ' ', sepWidth: 1 },
};

export function resolveStyle(name: PowerlineStyleName, hasNerdFont: boolean): Style {
  if (name === 'auto') return hasNerdFont ? POWERLINE_STYLES.arrow : POWERLINE_STYLES.compatible;
  return POWERLINE_STYLES[name] ?? POWERLINE_STYLES.arrow;
}

function bgEscape(c: RGB, mode: ColorMode): string {
  if (mode === 'truecolor') return `\x1b[48;2;${c.r};${c.g};${c.b}m`;
  if (mode === '256') return `\x1b[48;5;${rgbTo256Index(c.r, c.g, c.b)}m`;
  // named mode caller shouldn't reach here — powerline falls back to classic
  return '';
}

function fgEscape(c: RGB, mode: ColorMode): string {
  if (mode === 'truecolor') return `\x1b[38;2;${c.r};${c.g};${c.b}m`;
  if (mode === '256') return `\x1b[38;5;${rgbTo256Index(c.r, c.g, c.b)}m`;
  return '';
}

const DEFAULT_FG: RGB = { r: 255, g: 255, b: 255 };

/** Width of a rendered segment's visible text (not including separators/caps). */
function segTextWidth(seg: PowerlineSegment): number {
  const body = seg.icon ? `${seg.icon} ${seg.text}` : seg.text;
  // One leading + one trailing space of padding per segment.
  return 2 + displayWidth(body);
}

/** Total visible width the segment list would render to, given a style. */
export function powerlineWidth(segments: PowerlineSegment[], style: Style): number {
  if (segments.length === 0) return 0;
  const bodyW = segments.reduce((sum, s) => sum + segTextWidth(s), 0);

  if (style.gap) {
    // diamond: leftCap + body + rightCap per segment, space between segments.
    return segments.length * (style.sepWidth + 0) // caps already included in sepWidth=2
      + bodyW
      + (segments.length - 1); // spaces between pills
  }
  // continuous: optional leftCap, N-1 seps between, 1 sep at end (or rightCap),
  // plus body width.
  let w = bodyW;
  if (style.leftCap) w += 1;
  w += (segments.length - 1) * style.sepWidth;
  // Terminator glyph — rightCap is always 1 col (Nerd Font PUA), while sep
  // can be wider (e.g. `▶` for compatible). Use sepWidth when the terminator
  // is a sep, otherwise 1.
  w += style.rightCap ? 1 : style.sepWidth;
  return w;
}

/**
 * Drop lowest-priority segments until the projected width fits within `cols`.
 * Always preserves the highest-priority segment (typically the model name).
 */
export function applyPriorityEviction(
  segments: PowerlineSegment[],
  style: Style,
  cols: number,
): PowerlineSegment[] {
  if (segments.length === 0) return segments;
  const safeCols = Math.max(1, cols - 4);
  let kept = [...segments];
  while (kept.length > 1 && powerlineWidth(kept, style) > safeCols) {
    // Find lowest-priority segment, scanning right-to-left so ties resolve in
    // favour of earlier-inserted (higher-importance) segments. With strict `<`
    // and a left-to-right scan, equal priorities would drop the model first —
    // violating the exported contract that the highest-priority segment is
    // preserved.
    let lowestIdx = kept.length - 1;
    let lowest = kept[lowestIdx].priority;
    for (let i = kept.length - 2; i >= 0; i--) {
      if (kept[i].priority < lowest) { lowest = kept[i].priority; lowestIdx = i; }
    }
    kept.splice(lowestIdx, 1);
  }
  // If still over budget with one segment, truncate its text.
  if (kept.length === 1 && powerlineWidth(kept, style) > safeCols) {
    const seg = kept[0];
    // Chrome = fixed cost the style adds around segment content. Must match
    // `powerlineWidth` for a one-segment case, otherwise the truncated result
    // can still exceed safeCols by one column (notably for diamond, which has
    // two caps vs arrow's single terminator).
    const terminatorW = style.rightCap ? 1 : style.sepWidth;
    const chrome = style.gap
      ? 2 /* leftCap + rightCap */ + 2 /* padding */
      : (style.leftCap ? 1 : 0) + terminatorW + 2 /* padding */;
    const iconCost = seg.icon ? displayWidth(seg.icon) + 1 : 0;
    const budget = Math.max(1, safeCols - chrome - iconCost);
    // Strip ANSI/OSC 8 wrappers before truncating — truncField iterates raw
    // code points and would otherwise cut mid-escape. Safe on plain strings
    // too (stripAnsi is a no-op when no escapes are present).
    kept = [{ ...seg, text: truncField(stripAnsi(seg.text), budget) }];
  }
  return kept;
}

export function renderPowerline(
  segments: PowerlineSegment[],
  style: Style,
  mode: ColorMode,
  cols: number,
): string {
  if (segments.length === 0) return '';
  const fitted = applyPriorityEviction(segments, style, cols);
  const out: string[] = [];

  const body = (seg: PowerlineSegment) => {
    const fg = seg.fg ?? DEFAULT_FG;
    const parts = [bgEscape(seg.bg, mode), fgEscape(fg, mode), ' '];
    if (seg.icon) { parts.push(seg.icon, ' '); }
    parts.push(seg.text, ' ');
    return parts.join('');
  };

  if (style.gap) {
    // Diamond: each segment is a self-contained pill.
    for (let i = 0; i < fitted.length; i++) {
      const seg = fitted[i];
      out.push(fgEscape(seg.bg, mode), style.leftCap!);
      out.push(body(seg));
      out.push(RESET_BG, fgEscape(seg.bg, mode), style.rightCap!, RESET);
      if (i < fitted.length - 1) out.push(' ');
    }
    return out.join('');
  }

  // Continuous mode.
  if (style.leftCap) {
    out.push(fgEscape(fitted[0].bg, mode), style.leftCap);
  }
  for (let i = 0; i < fitted.length; i++) {
    const seg = fitted[i];
    out.push(body(seg));
    if (i < fitted.length - 1) {
      const next = fitted[i + 1];
      // sep.fg = current.bg, sep.bg = next.bg — the classic powerline blend.
      out.push(bgEscape(next.bg, mode), fgEscape(seg.bg, mode), style.sep!);
    }
  }
  // Terminator: transition from last seg's bg back to the default bg.
  const last = fitted[fitted.length - 1];
  out.push(RESET_BG, fgEscape(last.bg, mode), style.rightCap ?? style.sep!, RESET);
  return out.join('');
}
