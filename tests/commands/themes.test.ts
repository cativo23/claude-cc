import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseThemesArgs, runThemesCommand } from '../../src/commands/themes.js';
import { stripAnsi } from '../../src/render/colors.js';
import { THEMES } from '../../src/themes.js';

// Force truecolor for tests that assert bg escapes (\x1b[48;…) in powerline
// output. CI runners don't set COLORTERM, so detectColorMode() returns
// 'named' and the renderer falls back to classic — no bg escapes emitted.
const savedColorterm = process.env['COLORTERM'];
beforeAll(() => { process.env['COLORTERM'] = 'truecolor'; });
afterAll(() => {
  if (savedColorterm === undefined) delete process.env['COLORTERM'];
  else process.env['COLORTERM'] = savedColorterm;
});

const argv = (...rest: string[]) => ['node', 'lumira', 'themes', ...rest];

describe('parseThemesArgs', () => {
  it('defaults to list when no sub-subcommand given', () => {
    expect(parseThemesArgs(argv()).sub).toBe('list');
  });

  it('recognises preview subcommand', () => {
    expect(parseThemesArgs(argv('preview', 'dracula')).sub).toBe('preview');
    expect(parseThemesArgs(argv('preview', 'dracula')).themeName).toBe('dracula');
  });

  it('recognises help variants', () => {
    expect(parseThemesArgs(argv('help')).sub).toBe('help');
    expect(parseThemesArgs(argv('--help')).sub).toBe('help');
    expect(parseThemesArgs(argv('-h')).sub).toBe('help');
  });

  it('parses --powerline flag', () => {
    expect(parseThemesArgs(argv('preview', 'nord', '--powerline')).powerline).toBe(true);
  });

  it('parses --all flag', () => {
    expect(parseThemesArgs(argv('preview', '--all')).all).toBe(true);
  });

  it('parses --style=<name> and implies --powerline', () => {
    const args = parseThemesArgs(argv('preview', 'nord', '--style=flame'));
    expect(args.powerlineStyle).toBe('flame');
    expect(args.powerline).toBe(true);
  });

  it('--style=bogus drops both the style and the implicit powerline flag', () => {
    const args = parseThemesArgs(argv('preview', 'nord', '--style=bogus'));
    expect(args.powerlineStyle).toBeUndefined();
    // The implicit-powerline-from-style only fires for valid styles. With
    // a bogus value, neither side of the implicit toggle fires.
    expect(args.powerline).toBe(false);
  });

  it('only takes the first positional as theme name', () => {
    const args = parseThemesArgs(argv('preview', 'dracula', 'nord'));
    expect(args.themeName).toBe('dracula');
  });

  it('flag-before-name still finds the theme name', () => {
    const args = parseThemesArgs(argv('preview', '--powerline', 'dracula'));
    expect(args.themeName).toBe('dracula');
    expect(args.powerline).toBe(true);
  });

  it('unknown --flag is silently ignored (forward-compatible)', () => {
    const args = parseThemesArgs(argv('preview', '--unknown', 'dracula'));
    expect(args.themeName).toBe('dracula');
  });
});

describe('runThemesCommand — list', () => {
  it('lists all 7 built-in themes by default', () => {
    const r = runThemesCommand(argv());
    expect(r.exitCode).toBe(0);
    for (const name of Object.keys(THEMES)) {
      expect(r.stdout).toContain(name);
    }
    expect(r.stderr).toBe('');
  });

  it("includes a hint about 'preview <name>'", () => {
    expect(runThemesCommand(argv('list')).stdout).toContain('preview');
  });
});

describe('runThemesCommand — help', () => {
  it('lists subcommands and theme names', () => {
    const r = runThemesCommand(argv('help'));
    expect(r.stdout).toContain('USAGE');
    expect(r.stdout).toContain('preview');
    expect(r.stdout).toContain('--powerline');
    expect(r.exitCode).toBe(0);
  });
});

describe('runThemesCommand — preview', () => {
  it('returns rendered output for a known theme', () => {
    const r = runThemesCommand(argv('preview', 'dracula'));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('dracula');
    expect(stripAnsi(r.stdout)).toContain('lumira');
    expect(r.stderr).toBe('');
  });

  it('handles unknown theme with stderr + nonzero exit', () => {
    const r = runThemesCommand(argv('preview', 'bogus-theme-xyz'));
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('unknown theme');
    expect(r.stderr).toContain('Available:');
  });

  it('handles missing theme name with stderr + nonzero exit', () => {
    const r = runThemesCommand(argv('preview'));
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('missing theme name');
  });

  it('renders all themes when --all is given, in catalog order', () => {
    const r = runThemesCommand(argv('preview', '--all'));
    expect(r.exitCode).toBe(0);
    const names = Object.keys(THEMES);
    let lastIdx = -1;
    for (const name of names) {
      const idx = r.stdout.indexOf(`── ${name}`);
      expect(idx, `theme ${name} missing from --all output`).toBeGreaterThan(-1);
      expect(idx, `theme ${name} appeared out of catalog order`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('--powerline produces different output than classic', () => {
    const classic = runThemesCommand(argv('preview', 'dracula'));
    const powerline = runThemesCommand(argv('preview', 'dracula', '--powerline'));
    expect(classic.stdout).not.toBe(powerline.stdout);
    // Powerline output should contain a bg escape (\x1b[48;…)
    expect(powerline.stdout).toMatch(/\x1b\[48;/);
  });

  it('--style=flame implies powerline mode', () => {
    const r = runThemesCommand(argv('preview', 'dracula', '--style=flame'));
    expect(r.stdout).toMatch(/\x1b\[48;/);
    expect(r.stdout).toContain('flame');
  });

  it('rejects __proto__ as theme name (prototype-pollution guard)', () => {
    const r = runThemesCommand(argv('preview', '__proto__'));
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('unknown theme');
  });

  it('rejects constructor as theme name', () => {
    const r = runThemesCommand(argv('preview', 'constructor'));
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('unknown theme');
  });

  it('rejects toString as theme name (full prototype guard)', () => {
    // The hasOwn guard is exhaustive across the prototype chain — verify
    // one more inherited member to lock the behavior.
    const r = runThemesCommand(argv('preview', 'toString'));
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('unknown theme');
  });

  it('strips terminal control chars from invalid theme name in error banner', () => {
    const evil = '\x1b[2J\x1b[H';
    const r = runThemesCommand(argv('preview', evil));
    expect(r.exitCode).toBe(1);
    // Sanitized output should not contain raw escape bytes.
    expect(r.stderr).not.toContain('\x1b');
  });

  it('--all wins over a positional theme name', () => {
    const r = runThemesCommand(argv('preview', '--all', 'dracula'));
    expect(r.exitCode).toBe(0);
    // All themes rendered, not just dracula. Look for nord which would be
    // absent if --all were dropped in favour of the name.
    expect(r.stdout).toContain('── nord');
  });
});
