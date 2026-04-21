import type { Readable, Writable } from 'node:stream';
import { interactiveSelect, type SelectOption } from './tui/select.js';
import { buildPreview } from './tui/preview.js';
import { THEMES } from './themes.js';
import type { WizardResult } from './config.js';

export interface WizardCurrent {
  preset?: 'full' | 'balanced' | 'minimal';
  theme?: string;
  icons?: 'nerd' | 'emoji' | 'none';
}

export interface RunWizardOpts {
  current: WizardCurrent;
  /** Optional string rendered above each step's title (e.g. an ASCII banner). */
  prelude?: string;
  stdin?: NodeJS.ReadStream | (Readable & {
    isTTY?: boolean;
    isRaw?: boolean;
    setRawMode?: (flag: boolean) => unknown;
  });
  stdout?: NodeJS.WriteStream | (Writable & { columns?: number });
}

const PRESET_OPTIONS: SelectOption<'full' | 'balanced' | 'minimal'>[] = [
  { label: 'full',     value: 'full',     description: '▸ everything on, 4 lines' },
  { label: 'balanced', value: 'balanced', description: '▸ essentials, auto-compact' },
  { label: 'minimal',  value: 'minimal',  description: '▸ single line, just the basics' },
];

const ICON_OPTIONS: SelectOption<'nerd' | 'emoji' | 'none'>[] = [
  { label: 'nerd',  value: 'nerd',  description: '▸ Nerd Font icons (default)' },
  { label: 'emoji', value: 'emoji', description: '▸ Unicode emoji icons' },
  { label: 'none',  value: 'none',  description: '▸ no icons, ASCII fallbacks' },
];

const NONE_THEME = '__none__';

function themeOptions(): SelectOption<string>[] {
  const names = Object.keys(THEMES);
  return [
    { label: '(none)', value: NONE_THEME },
    ...names.map((n) => ({ label: n, value: n })),
  ];
}

export async function runWizard(opts: RunWizardOpts): Promise<WizardResult | null> {
  const { current } = opts;

  // Build a partial opts spread so unused keys don't get passed as undefined
  const streams: Pick<RunWizardOpts, 'stdin' | 'stdout'> = {};
  if (opts.stdin)  streams.stdin  = opts.stdin;
  if (opts.stdout) streams.stdout = opts.stdout;

  // Step 1: preset
  const preset = await interactiveSelect({
    title: 'lumira setup · step 1/3 — preset',
    options: PRESET_OPTIONS,
    initial: current.preset ?? 'balanced',
    preview: (v) => buildPreview({ preset: v, theme: current.theme, icons: current.icons ?? 'nerd' }),
    prelude: opts.prelude,
    ...streams,
  });
  if (preset === null) return null;

  // Step 2: theme
  const themeValue = await interactiveSelect({
    title: 'lumira setup · step 2/3 — theme',
    options: themeOptions(),
    initial: current.theme ?? NONE_THEME,
    preview: (v) => buildPreview({
      preset,
      theme: v === NONE_THEME ? undefined : v,
      icons: current.icons ?? 'nerd',
    }),
    prelude: opts.prelude,
    ...streams,
  });
  if (themeValue === null) return null;
  const theme = themeValue === NONE_THEME ? undefined : themeValue;

  // Step 3: icons
  const icons = await interactiveSelect({
    title: 'lumira setup · step 3/3 — icons',
    options: ICON_OPTIONS,
    initial: current.icons ?? 'nerd',
    preview: (v) => buildPreview({ preset, theme, icons: v }),
    prelude: opts.prelude,
    ...streams,
  });
  if (icons === null) return null;

  // Build result — omit theme key entirely when none was chosen
  const result: WizardResult = { preset, icons };
  if (theme !== undefined) result.theme = theme;
  return result;
}
