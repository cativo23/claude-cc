import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const LOGO = [
    '██╗     ██╗   ██╗███╗   ███╗██╗██████╗  █████╗ ',
    '██║     ██║   ██║████╗ ████║██║██╔══██╗██╔══██╗',
    '██║     ██║   ██║██╔████╔██║██║██████╔╝███████║',
    '██║     ██║   ██║██║╚██╔╝██║██║██╔══██╗██╔══██║',
    '███████╗╚██████╔╝██║ ╚═╝ ██║██║██║  ██║██║  ██║',
    '╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝',
].join('\n');
const CYAN = '\x1b[36m';
const RST = '\x1b[0m';
export function getBanner(opts = {}) {
    const width = opts.width ?? (process.stdout.columns ?? 80);
    if (width < 50)
        return '';
    return `${CYAN}\n${LOGO}\n${RST}`;
}
function defaultReadPackageJson() {
    const here = dirname(fileURLToPath(import.meta.url));
    // Built file lives at dist/tui/banner.js; package.json is at dist/../package.json.
    // Source file lives at src/tui/banner.ts; package.json is at src/../package.json.
    // Either way: two levels up.
    const p = resolve(here, '..', '..', 'package.json');
    return readFileSync(p, 'utf8');
}
const BASE_SUBTITLE = 'real-time statusline for claude code & qwen code';
export function getSubtitle(opts = {}) {
    const read = opts.readPackageJson ?? defaultReadPackageJson;
    try {
        const pkg = JSON.parse(read());
        if (typeof pkg.version === 'string' && pkg.version.length > 0) {
            return `${BASE_SUBTITLE} · v${pkg.version}`;
        }
        return BASE_SUBTITLE;
    }
    catch {
        return BASE_SUBTITLE;
    }
}
//# sourceMappingURL=banner.js.map