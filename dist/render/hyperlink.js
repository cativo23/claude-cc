// OSC 8 hyperlink support.
// Sequence: ESC ] 8 ; ; URL ST TEXT ESC ] 8 ; ; ST  (ST = ESC \)
// Terminals that don't support it render only TEXT; the wrappers are ignored.
let cached = null;
export function resetHyperlinkSupport() {
    cached = null;
}
// Exposed for tests; prod code should call supportsHyperlinks().
export function _setHyperlinkSupport(v) {
    cached = v;
}
export function supportsHyperlinks() {
    if (cached !== null)
        return cached;
    // Explicit opt-out (widely-recognised convention).
    if (process.env['NO_HYPERLINKS'] || process.env['FORCE_HYPERLINK'] === '0') {
        return (cached = false);
    }
    // Explicit opt-in bypasses all heuristics.
    if (process.env['FORCE_HYPERLINK'] && process.env['FORCE_HYPERLINK'] !== '0') {
        return (cached = true);
    }
    const term = process.env['TERM'] ?? '';
    if (term === 'dumb')
        return (cached = false);
    // Apple Terminal ignores OSC 8 but doesn't strip it — link markers leak as text.
    const termProgram = process.env['TERM_PROGRAM'] ?? '';
    if (termProgram === 'Apple_Terminal')
        return (cached = false);
    // Statusline output is piped by Claude Code, so process.stdout.isTTY is false
    // even in a real terminal. Rather than infer from our own stdout, we trust
    // the TERM/TERM_PROGRAM hints above and emit by default — modern terminals
    // (iTerm2, WezTerm, Kitty, Alacritty, VS Code, tmux ≥3.4 with passthrough)
    // all support OSC 8, and unsupported ones merely render plain text.
    return (cached = true);
}
export function hyperlink(url, text) {
    if (!supportsHyperlinks())
        return text;
    return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}
//# sourceMappingURL=hyperlink.js.map