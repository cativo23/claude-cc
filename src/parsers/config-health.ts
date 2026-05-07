import type { HudConfig } from '../types.js';
import { findStateMd } from './gsd.js';
import type { ColorMode } from '../render/colors.js';

export type HealthSeverity = 'warn' | 'info';

export interface HealthHint {
  severity: HealthSeverity;
  hint: string;
}

export function getConfigHealth(config: HudConfig, colorMode: ColorMode, cwd: string): HealthHint[] {
  const hints: HealthHint[] = [];

  // Theme set but named-ANSI mode can't render RGB colors
  if (config.theme && colorMode === 'named') {
    hints.push({ severity: 'warn', hint: 'theme has no effect in named-ANSI mode' });
  }

  // Powerline requested but named-ANSI can't render RGB backgrounds
  if (config.style === 'powerline' && colorMode === 'named') {
    hints.push({ severity: 'warn', hint: 'powerline falling back to classic (named-ANSI)' });
  }

  // GSD enabled but no STATE.md found walking up from cwd.
  if (config.gsd && cwd) {
    if (!findStateMd(cwd)) hints.push({ severity: 'info', hint: 'GSD on but no .planning/STATE.md found' });
  }

  return hints;
}
