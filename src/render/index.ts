import { createColors, detectColorMode, type ColorMode } from './colors.js';
import { renderLine1 } from './line1.js';
import { renderLine2 } from './line2.js';
import { renderLine3 } from './line3.js';
import { renderLine4 } from './line4.js';
import { renderMinimal } from './minimal.js';
import { renderPowerlineLine1 } from './powerline-line1.js';
import { resolveTheme } from '../themes.js';
import type { RenderContext } from '../types.js';

export function render(ctx: RenderContext): string {
  const colorMode: ColorMode = ctx.config.colors.mode === 'auto' ? detectColorMode() : ctx.config.colors.mode;
  const theme = resolveTheme(ctx.config.theme, colorMode);
  const c = createColors(colorMode, theme);

  const isQwen = ctx.input.platform === 'qwen-code';
  if (isQwen || ctx.config.layout === 'singleline' || (ctx.config.layout === 'auto' && ctx.cols < 70)) {
    return renderMinimal(ctx, c);
  }

  // Powerline mode requires RGB bg escapes; named-ANSI terminals can't
  // represent arbitrary backgrounds faithfully, so fall back to classic line1.
  const wantsPowerline = ctx.config.style === 'powerline' && colorMode !== 'named';

  const lines: string[] = [];
  lines.push(wantsPowerline ? renderPowerlineLine1(ctx, colorMode, theme) : renderLine1(ctx, c));
  lines.push(renderLine2(ctx, c));
  const l3 = renderLine3(ctx, c);
  if (l3) lines.push(l3);
  if (ctx.config.gsd) { const l4 = renderLine4(ctx, c); if (l4) lines.push(l4); }
  return lines.filter(Boolean).join('\n');
}
