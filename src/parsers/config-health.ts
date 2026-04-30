import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { HudConfig } from '../types.js';
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
  // Use `dirname` (resolves), not `join(dir, '..')` (which appends literal `..`
  // and never reaches root — so the equality break never fires and the loop
  // would silently bail at the iteration cap on deeply-nested projects).
  if (config.gsd && cwd) {
    let found = false;
    let dir = cwd;
    for (let i = 0; i < 32; i++) {
      if (existsSync(join(dir, '.planning', 'STATE.md'))) { found = true; break; }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    if (!found) hints.push({ severity: 'info', hint: 'GSD on but no .planning/STATE.md found' });
  }

  return hints;
}
