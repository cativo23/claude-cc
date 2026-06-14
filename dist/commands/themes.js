import { THEMES } from '../themes.js';
import { buildPreview } from '../tui/preview.js';
import { detectColorMode } from '../render/colors.js';
import { sanitizeTermString } from '../normalize.js';
import { POWERLINE_STYLE_NAMES } from '../types.js';
/**
 * One-line descriptions for `lumira themes list`. Lives next to the only
 * consumer rather than in `themes.ts` so the renderer's module graph
 * doesn't pull these strings.
 */
const THEME_DESCRIPTIONS = {
    dracula: 'vampire dark — purple/pink accents',
    nord: 'arctic muted polar palette',
    'tokyo-night': 'Tokyo at night — purple/blue, high contrast',
    catppuccin: 'pastel mocha — warm soft colors',
    monokai: 'classic high-saturation dark',
    gruvbox: 'retro warm earth tones',
    solarized: 'accessibility-focused, high readability',
};
export function parseThemesArgs(argv) {
    // argv is the full process.argv; the 'themes' command starts at argv[2],
    // its sub-subcommand at argv[3], remaining flags from argv[4].
    const subRaw = argv[3];
    const sub = subRaw === 'preview' ? 'preview' :
        subRaw === 'help' || subRaw === '--help' || subRaw === '-h' ? 'help' :
            'list';
    let themeName;
    let powerline = false;
    let powerlineStyle;
    let all = false;
    for (let i = 4; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--powerline') {
            powerline = true;
            continue;
        }
        if (arg === '--all') {
            all = true;
            continue;
        }
        const styleMatch = arg.match(/^--style=(.+)$/);
        if (styleMatch && POWERLINE_STYLE_NAMES.includes(styleMatch[1])) {
            powerline = true;
            powerlineStyle = styleMatch[1];
            continue;
        }
        // Unknown --flag is silently ignored to stay forward-compatible if a
        // future minor adds a new flag and an old binary sees it. Positional
        // tokens become themeName (first non-flag wins).
        if (!arg.startsWith('--') && !themeName) {
            themeName = arg;
        }
    }
    return { sub, themeName, powerline, powerlineStyle, all };
}
function listText() {
    const names = Object.keys(THEMES);
    const longest = Math.max(...names.map(n => n.length));
    let out = `Available themes (${names.length}):\n\n`;
    for (const name of names) {
        const desc = THEME_DESCRIPTIONS[name] ?? '';
        out += `  ${name.padEnd(longest + 2)}${desc}\n`;
    }
    out += "\nUse 'lumira themes preview <name>' to render a sample.\n";
    out += 'Add --powerline (optionally --style=<name>) for the powerline style,\n';
    out += "or --all to preview every theme in one shot (great for screenshots).\n";
    return out;
}
function helpText() {
    return [
        'lumira themes — list, describe, and preview built-in themes',
        '',
        'USAGE',
        '  lumira themes [list]                          List all themes (default)',
        '  lumira themes preview <name>                  Render a sample with <name>',
        '  lumira themes preview <name> --powerline      Render with powerline style',
        '  lumira themes preview <name> --style=<x>      Powerline + specific separator',
        '  lumira themes preview --all [--powerline]     Render every theme in sequence',
        '',
        'THEMES',
        `  ${Object.keys(THEMES).join(', ')}`,
        '',
        'POWERLINE STYLES',
        `  ${POWERLINE_STYLE_NAMES.join(', ')}`,
        '',
    ].join('\n');
}
function previewBlock(name, args, cols) {
    const opts = {
        preset: 'full',
        theme: name,
        icons: 'nerd',
        colorMode: detectColorMode(),
        cols,
    };
    if (args.powerline) {
        opts.style = 'powerline';
        opts.powerlineStyle = args.powerlineStyle ?? 'auto';
    }
    const banner = `── ${name}${args.powerline ? ` · powerline${args.powerlineStyle ? ` (${args.powerlineStyle})` : ''}` : ''}`;
    return `${banner}\n${buildPreview(opts)}\n`;
}
/** Reject themes lookups that would otherwise bypass the unknown-theme guard
 * via prototype chain (`__proto__`, `constructor`, etc). */
function isKnownTheme(name) {
    return Object.prototype.hasOwnProperty.call(THEMES, name);
}
function ok(stdout) {
    return { stdout, stderr: '', exitCode: 0 };
}
function err(stderr) {
    return { stdout: '', stderr, exitCode: 1 };
}
/**
 * Returns the rendered output for `lumira themes [...]` along with a
 * separate stderr buffer and an exit code. The caller wires these to the
 * right streams and exits the process accordingly.
 *
 * The optional `cols` argument is the terminal width to render previews at;
 * defaults to 120 when stdout has no detectable column count (e.g. piped).
 */
export function runThemesCommand(argv, cols) {
    const args = parseThemesArgs(argv);
    // Floor the preview width at 40 cols so a pathological `tput cols` of 1
    // (or a piped output that erroneously passes 0) doesn't produce empty
    // line truncations. 40 is the narrowest width any built-in renderer
    // claims to support cleanly.
    const previewCols = Math.max(40, cols ?? 120);
    if (args.sub === 'help')
        return ok(helpText());
    if (args.sub === 'list')
        return ok(listText());
    // sub === 'preview'
    if (args.all) {
        return ok(Object.keys(THEMES).map(n => previewBlock(n, args, previewCols)).join('\n'));
    }
    if (!args.themeName) {
        return err('lumira themes preview: missing theme name.\n\n'
            + "Use 'lumira themes list' to see available themes,\n"
            + "or 'lumira themes preview --all' to render all of them.\n");
    }
    // Sanitize for the error banner: a malicious shell alias could pass an
    // argv containing terminal control sequences which would render directly
    // into the user's terminal otherwise.
    const safeName = sanitizeTermString(args.themeName);
    const normalizedName = args.themeName.toLowerCase();
    if (!isKnownTheme(normalizedName)) {
        return err(`lumira themes preview: unknown theme "${safeName}".\n\n`
            + `Available: ${Object.keys(THEMES).join(', ')}\n`);
    }
    return ok(previewBlock(normalizedName, args, previewCols));
}
//# sourceMappingURL=themes.js.map