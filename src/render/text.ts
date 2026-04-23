import { stripAnsi } from './colors.js';

export function displayWidth(str: string): number {
  const clean = stripAnsi(str);
  let w = 0;
  for (const ch of clean) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0xFE00 && cp <= 0xFE0F) || cp === 0x200D || (cp >= 0x0300 && cp <= 0x036F)) continue;
    if (cp >= 0x1F000 || (cp >= 0x2300 && cp <= 0x257F) || (cp >= 0x25A0 && cp <= 0x25FF) ||
        (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x2B00 && cp <= 0x2BFF) ||
        (cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3000 && cp <= 0x303F) || (cp >= 0xFF00 && cp <= 0xFFEF)) {
      w += 2;
    } else { w += 1; }
  }
  return w;
}

export function truncField(str: string, max: number): string {
  if (displayWidth(str) <= max) return str;
  // Build truncated string character by character using display width
  let result = '';
  let w = 0;
  for (const ch of str) {
    const cw = displayWidth(ch);
    if (w + cw + 1 > max) break; // +1 for ellipsis
    result += ch;
    w += cw;
  }
  return result + '\u2026';
}

export function truncatePath(str: string, maxLen: number = 20): string {
  if (!str) return '';
  const normalized = str.replace(/\\/g, '/');
  if (normalized.length <= maxLen) return normalized;
  const parts = normalized.split('/');
  const filename = parts.pop() || normalized;
  if (filename.length >= maxLen) return filename.slice(0, maxLen - 3) + '...';
  return '.../' + filename;
}

export function fitSegments(left: string[], right: string[], sep: string, cols: number): string {
  const safeCols = Math.max(1, cols - 4);

  for (let l = left.length; l >= 1; l--) {
    const lSlice = left.slice(0, l);
    const leftStr = lSlice.join(sep);
    const leftW = displayWidth(leftStr);

    if (leftW > safeCols) continue;

    for (let r = right.length; r >= 0; r--) {
      const rSlice = right.slice(0, r);
      if (rSlice.length === 0) return leftStr;
      const rightStr = rSlice.join(sep);
      const rightW = displayWidth(rightStr);
      if (leftW + 1 + rightW <= safeCols) {
        const gap = Math.max(1, safeCols - leftW - rightW);
        return leftStr + ' '.repeat(gap) + rightStr;
      }
    }
  }

  // Last resort: even the first left segment alone exceeds safeCols.
  // Safe because left[0] is the model name (~20 chars) — callers must ensure
  // the first segment is short enough to truncate gracefully.
  // Strip ANSI before hard-truncating to avoid cutting mid-escape-sequence.
  return truncField(stripAnsi(left[0] ?? ''), safeCols);
}

export function padLine(left: string, right: string, cols: number): string {
  const leftW = displayWidth(left);
  const rightW = displayWidth(right);
  const gap = Math.max(1, cols - leftW - rightW);
  return left + ' '.repeat(gap) + right;
}
