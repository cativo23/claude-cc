import { createColors, detectColorMode, type ColorMode } from './colors.js';
import { renderLine1 } from './line1.js';
import { renderLine2 } from './line2.js';
import { renderLine3 } from './line3.js';
import { renderLine4 } from './line4.js';
import { renderMinimal } from './minimal.js';
import type { RenderContext } from '../types.js';

export function render(ctx: RenderContext): string {
  const { input, git, transcript, tokenSpeed, memory, gsd, cols, config } = ctx;
  const colorMode: ColorMode = config.colors.mode === 'auto' ? detectColorMode() : config.colors.mode;
  const c = createColors(colorMode);

  if (config.layout === 'minimal' || (config.layout === 'auto' && cols < 70)) {
    return renderMinimal(input, git, transcript, tokenSpeed, gsd, c, config.display, cols);
  }

  const lines: string[] = [];
  lines.push(renderLine1(input, git, transcript, c, config.display, cols));
  lines.push(renderLine2(input, tokenSpeed, transcript.thinkingEffort, c, config.display, cols, memory));
  const l3 = renderLine3(transcript.tools, transcript.todos, c);
  if (l3) lines.push(l3);
  if (config.gsd) { const l4 = renderLine4(gsd, c); if (l4) lines.push(l4); }
  return lines.filter(Boolean).join('\n');
}
