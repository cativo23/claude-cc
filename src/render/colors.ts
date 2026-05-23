import { DEFAULT_CONTEXT_WARNING_THRESHOLD, DEFAULT_CONTEXT_CRITICAL_THRESHOLD, QUOTA_CRITICAL } from '../types.js';

export type ColorMode = 'named' | '256' | 'truecolor';
export type ColorName = 'cyan' | 'magenta' | 'yellow' | 'green' | 'orange' | 'red' | 'blinkRed' | 'gray' | 'brightBlue' | 'dim' | 'bold';

const RST = '\x1b[0m';

export interface Colors {
  cyan: (s: string) => string;
  magenta: (s: string) => string;
  yellow: (s: string) => string;
  green: (s: string) => string;
  orange: (s: string) => string;
  red: (s: string) => string;
  blinkRed: (s: string) => string;
  gray: (s: string) => string;
  brightBlue: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
}

export function createColors(mode: ColorMode, theme?: import('../themes.js').ThemePalette | null): Colors {
  const wrap = (code: string) => (s: string) => `${code}${s}${RST}`;

  // Named ANSI colors as default — respects terminal theme (like the original JS).
  // Only orange uses 256-color (no named ANSI equivalent).
  // Truecolor/256 modes available for users who override via config.
  const named: Colors = {
    cyan: wrap('\x1b[36m'), magenta: wrap('\x1b[35m'),
    yellow: wrap('\x1b[33m'), green: wrap('\x1b[32m'),
    orange: wrap('\x1b[38;5;208m'), red: wrap('\x1b[31m'),
    blinkRed: wrap('\x1b[5;31m'), gray: wrap('\x1b[90m'),
    brightBlue: wrap('\x1b[94m'), dim: wrap('\x1b[2m'), bold: wrap('\x1b[1m'),
  };

  // Theme overrides: applied for both truecolor and 256-color modes.
  // `resolveTheme` projects the palette's RGB values to 256-color indices when
  // mode is '256', and returns null for 'named' mode (named ANSI has only 8
  // base hues — not enough fidelity to honour a theme accurately, so we fall
  // back to built-in defaults instead of approximating with wrong colors).
  if (theme && (mode === 'truecolor' || mode === '256')) {
    return {
      ...named,
      cyan: wrap(theme.cyan), magenta: wrap(theme.magenta),
      yellow: wrap(theme.yellow), green: wrap(theme.green),
      orange: wrap(theme.orange), red: wrap(theme.red),
      brightBlue: wrap(theme.brightBlue), gray: wrap(theme.gray),
    };
  }

  if (mode === 'truecolor') {
    return {
      ...named,
      cyan: wrap('\x1b[38;2;0;255;255m'), magenta: wrap('\x1b[38;2;255;0;255m'),
      yellow: wrap('\x1b[38;2;255;255;0m'), green: wrap('\x1b[38;2;0;255;0m'),
      orange: wrap('\x1b[38;2;255;165;0m'),
      brightBlue: wrap('\x1b[38;2;100;149;237m'),
    };
  }
  if (mode === '256') {
    return {
      ...named,
      cyan: wrap('\x1b[38;5;51m'), magenta: wrap('\x1b[38;5;201m'),
      yellow: wrap('\x1b[38;5;226m'), green: wrap('\x1b[38;5;46m'),
      brightBlue: wrap('\x1b[38;5;111m'),
    };
  }
  return named;
}

export function stripAnsi(str: string): string {
  // OSC sequences terminate with either BEL (\x07) or ST (\x1b\\). OSC 8
  // hyperlinks use ST, so both terminators must be matched — otherwise the
  // URL and the wrapping markers leak into displayWidth() calculations.
  return str.replace(/\x1b\[\??[0-9;]*[a-zA-Z]|\x1b\][\s\S]*?(?:\x07|\x1b\\)|\x1b[()][AB012]/g, '');
}

export function detectColorMode(): ColorMode {
  const colorterm = (process.env['COLORTERM'] ?? '').toLowerCase();
  if (colorterm === 'truecolor' || colorterm === '24bit') return 'truecolor';
  const term = process.env['TERM'] ?? '';
  const termProgram = process.env['TERM_PROGRAM'] ?? '';
  if (term.endsWith('-256color') || termProgram === 'iTerm.app' || termProgram === 'Hyper') return '256';
  return 'named';
}

/**
 * Map a context-fill percentage to its alarm color.
 *
 * Zones (with default 65/78): green<50, yellow 50–65, orange 65–78, red 78+.
 *
 * **Asymmetry by design:** the green→yellow boundary is fixed at 50%, the
 * "universally healthy" mark. So if a user sets `warning ≤ 50`, the yellow
 * zone collapses entirely and the bar jumps green→orange at `warning`. That's
 * consistent with the field's contract ("percentage at which the bar turns
 * orange") — yellow is just a soft pre-alarm buffer that only exists when
 * there's room for it between 50 and `warning`.
 */
export function getContextColor(
  pct: number,
  warning = DEFAULT_CONTEXT_WARNING_THRESHOLD,
  critical = DEFAULT_CONTEXT_CRITICAL_THRESHOLD,
): ColorName {
  if (pct < warning) return pct < 50 ? 'green' : 'yellow';
  if (pct < critical) return 'orange';
  return 'blinkRed';
}

/**
 * Color for the pace delta value (how far ahead/behind of expected quota burn).
 * Green when on-pace or behind (delta ≤ 0), escalating through yellow/orange/blinkRed
 * as the ahead-of-pace burn rate increases.
 */
export function getPaceColor(delta: number): ColorName {
  if (delta <= 0) return 'green';
  if (delta <= 15) return 'yellow';
  if (delta <= 30) return 'orange';
  return 'blinkRed';
}

/**
 * Cache hit rate severity tier — the single source of truth for the cache
 * widget's threshold boundaries. Rendered only when below the alarm threshold
 * (≥90% is hidden as healthy steady-state), so the tiers reflect degrees of
 * "something is wrong" rather than degrees of healthy.
 *   70–89%: mild     (TTL expiry, fresh content arrived — yellow / versionBg)
 *   40–69%: moderate (caching not engaging — orange / taskBg)
 *    <40%:  critical (cache likely broken — blinkRed / branchDirtyBg)
 * Both classic-mode fg (getCacheHitColor) and powerline-mode bg (the helper
 * in powerline-line2.ts) consume this so the boundaries cannot drift apart.
 */
export type CacheHitTier = 'mild' | 'moderate' | 'critical';

export function getCacheHitTier(pct: number): CacheHitTier {
  if (pct >= 70) return 'mild';
  if (pct >= 40) return 'moderate';
  return 'critical';
}

export function getCacheHitColor(pct: number): ColorName {
  switch (getCacheHitTier(pct)) {
    case 'mild': return 'yellow';
    case 'moderate': return 'orange';
    case 'critical': return 'blinkRed';
  }
}

export function getQuotaColor(pct: number): ColorName {
  if (!Number.isFinite(pct)) return 'blinkRed'; // NaN/Infinity → maximum urgency, caller should gate upstream
  if (pct < 50) return 'green';
  if (pct < 70) return 'yellow';
  if (pct < QUOTA_CRITICAL) return 'orange';
  return 'blinkRed';
}

/**
 * API latency severity tier — the single source of truth for the api-latency
 * widget's threshold boundaries. Both classic-mode fg (getApiLatencyColor) and
 * powerline-mode bg (the helper in powerline-line2.ts) consume this so the
 * boundaries cannot drift apart.
 *   <40%:  healthy  (API is fast — dim, low visual noise)
 *   40-69%: notable  (API is slower than typical — default fg, worth noting)
 *   70-89%: warn     (API dominating session — yellow)
 *   >=90%:  critical (almost all time waiting on API — orange, diagnostic not emergency)
 */
export type ApiLatencyTier = 'healthy' | 'notable' | 'warn' | 'critical';

export function getApiLatencyTier(pct: number): ApiLatencyTier {
  if (pct < 40) return 'healthy';
  if (pct < 70) return 'notable';
  if (pct < 90) return 'warn';
  return 'critical';
}

/**
 * Color for the API latency value, consuming the SSOT tier.
 * Returns null for 'notable' — the caller emits the text without any ANSI
 * wrapper so it renders in the terminal's default foreground.
 */
export function getApiLatencyColor(pct: number): ColorName | null {
  switch (getApiLatencyTier(pct)) {
    case 'healthy': return 'dim';
    case 'notable': return null;
    case 'warn': return 'yellow';
    case 'critical': return 'orange';
  }
}
