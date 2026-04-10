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

  // Theme overrides (truecolor only — resolveTheme returns null otherwise)
  if (theme && mode === 'truecolor') {
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
  return str.replace(/\x1b\[\??[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][AB012]/g, '');
}

export function detectColorMode(): ColorMode {
  const colorterm = (process.env['COLORTERM'] ?? '').toLowerCase();
  if (colorterm === 'truecolor' || colorterm === '24bit') return 'truecolor';
  const term = process.env['TERM'] ?? '';
  const termProgram = process.env['TERM_PROGRAM'] ?? '';
  if (term.endsWith('-256color') || termProgram === 'iTerm.app' || termProgram === 'Hyper') return '256';
  return 'named';
}

export function getContextColor(pct: number): ColorName {
  if (pct < 50) return 'green';
  if (pct < 65) return 'yellow';
  if (pct < 80) return 'orange';
  return 'blinkRed';
}

export function getQuotaColor(pct: number): ColorName {
  if (pct < 50) return 'green';
  if (pct < 70) return 'yellow';
  if (pct < 85) return 'orange';
  return 'blinkRed';
}
