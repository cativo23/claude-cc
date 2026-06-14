import { createColors, detectColorMode } from './colors.js';
import { renderLine1 } from './line1.js';
import { renderLine2 } from './line2.js';
import { renderLine3 } from './line3.js';
import { renderLine4 } from './line4.js';
import { renderMinimal } from './minimal.js';
import { renderPowerlineLine1 } from './powerline-line1.js';
import { renderPowerlineLine2 } from './powerline-line2.js';
import { renderPowerlineLine3 } from './powerline-line3.js';
import { resolveTheme } from '../themes.js';
export function render(ctx) {
    const colorMode = ctx.config.colors.mode === 'auto' ? detectColorMode() : ctx.config.colors.mode;
    const theme = resolveTheme(ctx.config.theme, colorMode);
    const c = createColors(colorMode, theme);
    const isQwen = ctx.input.platform === 'qwen-code';
    if (isQwen || ctx.config.layout === 'singleline' || (ctx.config.layout === 'auto' && ctx.cols < 70)) {
        return renderMinimal(ctx, c);
    }
    // Powerline mode requires RGB bg escapes; named-ANSI terminals can't
    // represent arbitrary backgrounds faithfully, so fall back to classic renderers.
    const wantsPowerline = ctx.config.style === 'powerline' && colorMode !== 'named';
    const lines = [];
    lines.push(wantsPowerline ? renderPowerlineLine1(ctx, colorMode, theme) : renderLine1(ctx, c));
    lines.push(wantsPowerline ? renderPowerlineLine2(ctx, colorMode, theme, c) : renderLine2(ctx, c));
    const l3 = wantsPowerline ? renderPowerlineLine3(ctx, colorMode, theme) : renderLine3(ctx, c);
    if (l3)
        lines.push(l3);
    // Line 4 renders when either GSD is on OR a custom command targets line 4.
    // The renderer short-circuits to '' when both are absent, so this gate just
    // avoids invoking the renderer when we know it has nothing to do — keeping
    // the previous behaviour for users without either feature configured.
    const hasL4CustomCmds = (ctx.customCommands ?? []).some(o => o.line === 4 && o.state !== 'hidden');
    if (ctx.config.gsd || hasL4CustomCmds) {
        const l4 = renderLine4(ctx, c);
        if (l4)
            lines.push(l4);
    }
    return lines.filter(Boolean).join('\n');
}
//# sourceMappingURL=index.js.map