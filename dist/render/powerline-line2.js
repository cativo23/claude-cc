import { renderPowerline, resolveStyle, } from './powerline.js';
import { QUOTA_CRITICAL } from '../types.js';
import { buildContextBar, formatQwenMetrics, getCustomCommandsForLine, getPrPrefix, renderCustomCommand } from './shared.js';
import { formatTokens, formatCost, formatBurnRate } from '../utils/format.js';
import { detectColorMode, getCacheHitTier, getApiLatencyTier, getPaceColor } from './colors.js';
import { computeApiLatency, formatApiLatency } from './api-latency.js';
import { getConfigHealth } from '../parsers/config-health.js';
import { computePaceDelta, formatPaceDelta } from './pace.js';
import { computeQuotaProjection, formatProjectionWarning } from './quota-projection.js';
const SEVEN_DAY_WINDOW_SEC = 7 * 24 * 3600;
const SEVEN_DAY_MIN_ELAPSED_SEC = 3600; // 1h floor — see quota-projection.ts
import { derivePowerlinePalette, DEFAULT_POWERLINE_PALETTE, } from '../themes.js';
// Maps the cache severity tier (SSOT in colors.ts) to a powerline bg slot.
// `mild` keeps versionBg as the visual baseline since the segment is already
// inside the <90% alarm-mode gate; `moderate` and `critical` escalate to the
// warm/critical slots already used by cost and >=85% rate-limits respectively.
function getCacheHitBg(rate, palette) {
    switch (getCacheHitTier(rate)) {
        case 'mild': return palette.versionBg;
        case 'moderate': return palette.taskBg;
        case 'critical': return palette.branchDirtyBg;
    }
}
// Maps PR review state to a powerline bg slot (urgency via background, not text color).
// approved  → dirBg   (neutral — PR is ready, low urgency)
// pending   → taskBg  (warm — waiting on reviewers)
// changes_requested → branchDirtyBg (hot — action needed from author)
// draft     → dirBg   (neutral — not ready for review)
function getPrReviewBg(reviewState, palette) {
    switch (reviewState) {
        case 'changes_requested': return palette.branchDirtyBg;
        case 'pending': return palette.taskBg;
        case 'approved':
        case 'draft':
        default: return palette.dirBg;
    }
}
// Maps the API latency tier (SSOT in colors.ts) to a powerline bg slot.
// healthy/notable → dirBg (neutral; api is fast or only slightly slow)
// warn            → taskBg (warm; api is dominating session time)
// critical        → branchDirtyBg (hot; almost all time spent waiting on API)
function getApiLatencyBg(pct, palette) {
    switch (getApiLatencyTier(pct)) {
        case 'healthy': return palette.dirBg;
        case 'notable': return palette.dirBg;
        case 'warn': return palette.taskBg;
        case 'critical': return palette.branchDirtyBg;
    }
}
// Line 2 powerline palette — reuses PowerlinePalette bg slots with semantic remapping:
//   modelBg    → context bar segment
//   taskBg     → cost/tokens segment
//   versionBg  → duration segment
//
// Context bar policy: cells inherit segment bg (proportion reads from cell
// length, no need for a colored gradient). The percentage value, warning
// icon (☠/🔥), and `/compact?` hint keep their alarm colors — these are the
// urgency channels the user actually needs at a glance. Decision rationale
// recorded against PR #47.
function buildSegments(ctx, palette, c) {
    const { input, config: { display }, icons, mcp, transcript: { thinkingEffort, compactionCount } } = ctx;
    const segments = [];
    // Context bar — always highest priority. plain=true so the bar cells inherit
    // the powerline segment bg; only %/icon/hint emit color escapes.
    const pct = input.context.realUsedPercentage ?? input.context.usedPercentage;
    if (display.contextBar) {
        const bar = buildContextBar(pct, c, {
            iconSet: icons,
            plain: true,
            cols: ctx.cols,
            warningThreshold: display.contextWarningThreshold,
            criticalThreshold: display.contextCriticalThreshold,
            nearAutoCompact: input.context.nearAutoCompact,
        });
        segments.push({ text: bar, bg: palette.modelBg, fg: palette.fg, priority: 100 });
    }
    // Context tokens — prefer windowSize from payload over back-derivation.
    // total_input_tokens is cumulative across the session; current context size
    // is windowSize × usedPercentage / 100. Falls back to back-derivation for
    // legacy payloads without context_window_size. Mirrors line2.ts behaviour.
    if (display.contextTokens && pct > 0) {
        const capacity = input.context.windowSize
            ?? (input.tokens.input > 0 ? Math.round(input.tokens.input / (pct / 100)) : 0);
        if (capacity > 0) {
            const used = Math.round(capacity * pct / 100);
            segments.push({ text: `${formatTokens(used)}/${formatTokens(capacity)}`, bg: palette.dirBg, fg: palette.fg, priority: 90 });
        }
    }
    // Compaction counter — self-gating at 0; priority 88 keeps it adjacent to
    // the context family (contextBar=100, contextTokens=90).
    if (display.compactionCount && compactionCount > 0) {
        segments.push({ text: `⊙ ${compactionCount}`, bg: palette.dirBg, fg: palette.fg, priority: 88 });
    }
    // 7d projection — computed once, surfaced inside the 7d segment when the
    // badge is visible (≥50%), or as a standalone segment when it isn't. Mirrors
    // classic line2: badge filter hides noise, projection surfaces signal.
    // Independent of `display.rateLimits` — mirrors paceDelta below; users who
    // hide rate-limit badges still benefit from the exhaustion warning.
    let sevenDayProjWarning = '';
    if (display.quotaProjection && input.rateLimits?.sevenDay) {
        const sd = input.rateLimits.sevenDay;
        if (Number.isFinite(sd.usedPercentage)) {
            const proj = computeQuotaProjection(sd.usedPercentage, sd.resetsAt, SEVEN_DAY_WINDOW_SEC, undefined, SEVEN_DAY_MIN_ELAPSED_SEC);
            if (proj && proj.willExhaustBefore) {
                sevenDayProjWarning = formatProjectionWarning(proj);
            }
        }
    }
    let sevenDayWarningAttachedToBadge = false;
    // Colour the projection inline (only when it rides inside the 7d badge
    // segment). The standalone segment expresses severity via bg colour
    // (branchDirtyBg for 🔥, taskBg for ⚠), so it does not need an inline wrap.
    const colorProjectionInline = (warning) => {
        const isCritical = warning.startsWith('🔥');
        return (isCritical ? c.red : c.yellow)(warning);
    };
    // Rate limits — urgency expressed via priority (critical survives eviction longer).
    // Loop order (5h then 7d) is always preserved; priority is the eviction knob only.
    // Note: countdown timer (line2.ts:127) is intentionally omitted in powerline mode.
    // The pace delta segment below already communicates time-to-exhaustion, and the
    // critical bg (branchDirtyBg) carries the urgency signal that countdown would.
    if (display.rateLimits && input.rateLimits) {
        const limits = [
            ['5h', input.rateLimits.fiveHour],
            ['7d', input.rateLimits.sevenDay],
        ];
        for (const [label, win] of limits) {
            if (!win || !Number.isFinite(win.usedPercentage) || win.usedPercentage < 50)
                continue;
            const critical = win.usedPercentage >= QUOTA_CRITICAL;
            const bg = critical ? palette.branchDirtyBg : palette.taskBg;
            let text = `${icons.battery(win.usedPercentage)} ${win.usedPercentage.toFixed(0)}%(${label})`;
            // 7d quota projection — rides inside the existing segment (no new
            // powerline cell) so it inherits the segment's bg and survives/falls
            // together under fitSegments eviction. The inline severity colour keeps
            // the warning's urgency visible across the segment background.
            if (label === '7d' && sevenDayProjWarning) {
                text += ` ${colorProjectionInline(sevenDayProjWarning)}`;
                sevenDayWarningAttachedToBadge = true;
            }
            segments.push({ text, bg, fg: palette.fg, priority: critical ? 85 : 40 });
        }
    }
    // 7d projection standalone — surfaces when the badge is hidden (<50%) but
    // the burn rate predicts exhaustion. 🔥 (sub-12h) escalates to branchDirtyBg
    // with priority 86 — one above the 5h critical (85). The 5h critical has a
    // redundant carrier in paceDelta, but standalone 🔥 has no other surface; if
    // narrow-cols eviction must drop one, the more actionable signal stays. ⚠
    // (non-imminent) sits at priority 50 and yields to short-window urgency.
    if (sevenDayProjWarning && !sevenDayWarningAttachedToBadge) {
        const isCritical = sevenDayProjWarning.startsWith('🔥');
        segments.push({
            text: sevenDayProjWarning,
            bg: isCritical ? palette.branchDirtyBg : palette.taskBg,
            fg: palette.fg,
            priority: isCritical ? 86 : 50,
        });
    }
    // Pace delta — how far ahead/behind of expected quota burn rate.
    // Independent of display.rateLimits — the pace signal can render without the
    // raw 5h/7d percentages and vice versa.
    if (display.paceDelta && input.rateLimits) {
        const fiveHourWin = input.rateLimits.fiveHour;
        if (fiveHourWin && Number.isFinite(fiveHourWin.usedPercentage)) {
            const pace = computePaceDelta(fiveHourWin.usedPercentage, fiveHourWin.resetsAt);
            if (pace != null) {
                const paceStr = formatPaceDelta(pace);
                if (paceStr === 'on pace') {
                    segments.push({ text: 'on pace', bg: palette.dirBg, fg: palette.fg, priority: 60 });
                }
                else {
                    const paceIcon = pace.delta > 1 ? icons.car : pace.delta < -1 ? icons.turtle : '';
                    const iconPrefix = paceIcon ? `${paceIcon}` : '';
                    const coloredText = c[getPaceColor(pace.delta)](`${iconPrefix}${paceStr}`);
                    segments.push({ text: coloredText, bg: palette.dirBg, fg: palette.fg, priority: 60 });
                }
            }
        }
    }
    // Cost + burn rate
    if (display.cost && input.cost != null) {
        let costText = formatCost(input.cost);
        if (display.burnRate && input.durationMs != null) {
            const burn = formatBurnRate(input.cost, input.durationMs);
            if (burn)
                costText += ` ${burn}`;
        }
        segments.push({ text: costText, bg: palette.taskBg, fg: palette.fg, priority: 70 });
    }
    // API latency — ratio of API wait time to wall-clock session duration.
    // Priority 65: between cost (70) and tokens/pace (60). Only rendered when
    // both fields are present — old Claude Code versions omit total_api_duration_ms.
    if (display.apiLatency && input.apiDurationMs != null) {
        const pct = computeApiLatency(input.durationMs, input.apiDurationMs);
        if (pct != null) {
            const text = formatApiLatency(pct);
            const bg = getApiLatencyBg(pct, palette);
            segments.push({ text, bg, fg: palette.fg, priority: 65 });
        }
    }
    // Tokens ↑↓ (cumulative input/output)
    if (display.tokens) {
        const inTokens = input.tokens.input;
        const outTokens = input.tokens.output;
        const parts = [];
        if (inTokens > 0)
            parts.push(`${formatTokens(inTokens)}↑`);
        if (outTokens > 0)
            parts.push(`${formatTokens(outTokens)}↓`);
        if (parts.length > 0) {
            segments.push({ text: `${icons.comment} ${parts.join(' ')}`, bg: palette.dirBg, fg: palette.fg, priority: 60 });
        }
    }
    // Cache metrics (hit rate) — alarm-mode: only when <90%. See line2.ts for why.
    // Bg escalates with degradation: versionBg (70-89), taskBg (40-69), branchDirtyBg (<40).
    if (display.cacheMetrics && input.cacheHitRate != null && input.cacheHitRate < 90) {
        const bg = getCacheHitBg(input.cacheHitRate, palette);
        segments.push({ text: `${input.cacheHitRate}%${icons.lightning}`, bg, fg: palette.fg, priority: 50 });
    }
    // MCP servers
    if (display.mcp && mcp) {
        const total = mcp.servers.length;
        const errors = mcp.servers.filter(s => s.status === 'error').length;
        const mcpText = errors > 0 ? `MCP ${total - errors}/${total}` : `MCP ${total}`;
        segments.push({ text: mcpText, bg: palette.taskBg, fg: palette.fg, priority: 50 });
    }
    // PR widget (CC ≥ 2.1.145)
    if (display.pr && input.pr) {
        const { number, url, reviewState } = input.pr;
        const stateStr = reviewState ?? '';
        const text = `${icons.pr} ${getPrPrefix(url)}${number}${stateStr ? ` ${stateStr}` : ''}`;
        const bg = getPrReviewBg(reviewState, palette);
        segments.push({ text, bg, fg: palette.fg, priority: 55 });
    }
    // Qwen metrics
    const qwenParts = formatQwenMetrics(input, c, icons);
    for (const part of qwenParts) {
        segments.push({ text: part, bg: palette.versionBg, fg: palette.fg, priority: 45 });
    }
    // Vim mode (low priority — no right side in powerline, append as left segment)
    if (display.vim && input.vimMode) {
        segments.push({ text: `[${input.vimMode}]`, bg: palette.dirBg, fg: palette.fg, priority: 30 });
    }
    // Effort level (hidden if medium)
    const effort = input.effortLevel || thinkingEffort;
    if (display.effort && effort && effort !== 'medium') {
        segments.push({ text: `^${effort}`, bg: palette.versionBg, fg: palette.fg, priority: 30 });
    }
    // Extended thinking indicator — priority 28 (one below effort/vim at 30) so it
    // evicts before them on narrow terminals; thinking is informational, not urgent.
    if (display.thinking && input.thinkingEnabled) {
        segments.push({ text: icons.thinking, bg: palette.dirBg, fg: palette.fg, priority: 28 });
    }
    // Fast mode — same tier as thinking (informational, evicts before effort/vim).
    if (display.fastMode && input.fastMode) {
        segments.push({ text: `${icons.lightning}fast`, bg: palette.dirBg, fg: palette.fg, priority: 27 });
    }
    // Config health hints (opt-in, lowest priority — evicted first on narrow terminals)
    if (display.health && input.cwd) {
        const colorMode = ctx.config.colors.mode === 'auto' ? detectColorMode() : ctx.config.colors.mode;
        const hints = getConfigHealth(ctx.config, colorMode, input.cwd);
        for (const h of hints) {
            const prefix = h.severity === 'warn' ? '⚠ ' : 'ℹ ';
            segments.push({ text: `${prefix}${h.hint}`, bg: palette.versionBg, fg: palette.fg, priority: 10 });
        }
    }
    // Custom commands (issue #143 phase 3) — neutral dirBg, priority 15 so user
    // widgets evict before lumira's own line2 metrics. Inline fg color/dim from
    // renderCustomCommand renders on top of the segment bg.
    for (const out of getCustomCommandsForLine(ctx.customCommands, 2)) {
        const text = renderCustomCommand(out, c);
        if (text) {
            segments.push({ text, bg: palette.dirBg, fg: palette.fg, priority: 15 });
        }
    }
    return segments;
}
/** Render line2 in powerline style. Caller must ensure mode != 'named'. */
export function renderPowerlineLine2(ctx, mode, theme, c) {
    const palette = theme
        ? (theme.powerline ?? derivePowerlinePalette(theme))
        : DEFAULT_POWERLINE_PALETTE;
    const styleName = (ctx.config.powerline?.style ?? 'auto');
    const hasNerdFont = (ctx.config.icons ?? 'nerd') === 'nerd';
    const style = resolveStyle(styleName, hasNerdFont);
    const segments = buildSegments(ctx, palette, c);
    if (segments.length === 0)
        return '';
    return renderPowerline(segments, style, mode, ctx.cols);
}
//# sourceMappingURL=powerline-line2.js.map