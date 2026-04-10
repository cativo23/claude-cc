export interface IconSet {
  model: string;
  branch: string;
  folder: string;
  fire: string;
  skull: string;
  comment: string;
  clock: string;
  bolt: string;
  tree: string;
  cubes: string;
  hammer: string;
  warning: string;
  barFull: string;
  barEmpty: string;
  ellipsis: string;
  dash: string;
  checkmark: string;
}

export const NERD_ICONS: IconSet = {
  model:     '\uEE0D',  // fa-robot
  branch:    '\uE725',  // dev-git-branch
  folder:    '\uF07C',  // fa-folder-open
  fire:      '\uF06D',  // fa-fire
  skull:     '\uEE15',  // fa-skull
  comment:   '\uF075',  // fa-comment
  clock:     '\uF017',  // fa-clock
  bolt:      '\uF0E7',  // fa-bolt
  tree:      '\uF1BB',  // fa-tree
  cubes:     '\uF1B3',  // fa-cubes
  hammer:    '\uEEFF',  // fa-hammer
  warning:   '\uF071',  // fa-warning
  barFull:   '\u2588',  // block full
  barEmpty:  '\u2591',  // block light
  ellipsis:  '\u2026',  // ...
  dash:      '\u2014',  // em-dash
  checkmark: '\u2713',  // checkmark
};

export const EMOJI_ICONS: IconSet = {
  model:     '\u{1F916}', // 🤖
  branch:    '\u{1F33F}', // 🌿
  folder:    '\u{1F4C2}', // 📂
  fire:      '\u{1F525}', // 🔥
  skull:     '\u{1F480}', // 💀
  comment:   '\u{1F4AC}', // 💬
  clock:     '\u{23F1}\uFE0F',  // ⏱️
  bolt:      '\u26A1',    // ⚡
  tree:      '\u{1F332}', // 🌲
  cubes:     '\u{1F4E6}', // 📦
  hammer:    '\u{1F528}', // 🔨
  warning:   '\u26A0\uFE0F',   // ⚠️
  barFull:   '\u2588',
  barEmpty:  '\u2591',
  ellipsis:  '\u2026',
  dash:      '\u2014',
  checkmark: '\u2705',    // ✅
};

export const NO_ICONS: IconSet = {
  model:     '',
  branch:    '',
  folder:    '',
  fire:      '!',
  skull:     '!!',
  comment:   '',
  clock:     '',
  bolt:      '',
  tree:      '',
  cubes:     '',
  hammer:    '',
  warning:   '!',
  barFull:   '\u2588',
  barEmpty:  '\u2591',
  ellipsis:  '\u2026',
  dash:      '\u2014',
  checkmark: '\u2713',
};

/** Resolve icon set from config value */
export function resolveIcons(mode?: 'nerd' | 'emoji' | 'none'): IconSet {
  if (mode === 'emoji') return EMOJI_ICONS;
  if (mode === 'none') return NO_ICONS;
  return NERD_ICONS;
}

// Backward compat — default export is nerd icons
export const ICONS = NERD_ICONS;
