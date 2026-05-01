# Security

## Reporting a vulnerability

**Don't open a public issue for security problems.**

Use GitHub's [private security advisory form](https://github.com/cativo23/lumira/security/advisories/new) instead. The maintainer ([@cativo23](https://github.com/cativo23)) will respond within ~48 hours.

If you can't use the GitHub form, you can email the maintainer directly via the address listed on [their GitHub profile](https://github.com/cativo23).

## What's in scope

lumira reads JSON from stdin (provided by Claude Code or Qwen Code) and writes ANSI text to stdout. The threat surface is small but real:

- **Terminal control-character injection** — fields from stdin like `cwd`, `agent.name`, `worktree.name`, `output_style.name`, `version`, etc. are written into the rendered statusline. lumira sanitizes these via `sanitizeTermString()` (strips C0/C1/DEL control chars) before rendering. A bug that bypasses this guard is in scope.
- **Path traversal in OSC 8 hyperlinks** — `cwd` is wrapped in a `file://` URL via `pathToFileURL()`, which percent-encodes path components. A way to inject arbitrary URL schemes via crafted stdin is in scope.
- **Symlink / TOCTOU in transcript or GSD parsing** — lumira reads `transcript_path` and walks up the directory tree looking for `.planning/STATE.md`. A way to make it read files outside the user's home + tmp directories, or trigger writes, is in scope.
- **Resource exhaustion** — a way to make lumira consume unbounded memory or CPU on a single tick is in scope (statusline blocks the user's prompt while running).
- **Dependency confusion** — lumira ships with **zero runtime dependencies** by design. A PR or release that introduces a runtime dependency without explicit maintainer review is in scope (and shouldn't happen in practice).

## What's NOT in scope

- **Confidentiality of stdin contents** — lumira processes whatever Claude Code / Qwen Code sends. If your CLI sends secrets in stdin (it shouldn't), that's a host-CLI bug, not a lumira bug.
- **Theft of npm credentials** — out of scope of the project; reports about npm itself go to npm Inc.
- **Vulnerabilities in `node` / `npm` / Claude Code itself** — out of scope. Report to those projects directly.
- **Social engineering, phishing of the maintainer** — out of scope.

## Disclosure timeline

For confirmed vulnerabilities:

1. We acknowledge within 48 hours.
2. We assess severity and target a fix within 7 days for Critical, 30 days for everything else.
3. We coordinate disclosure: a private patch lands on `main` with a coordinated tag, then a public advisory + CVE if applicable, then a follow-up release note in `CHANGELOG.md` under a `### Security` heading.

You'll be credited in the advisory and changelog unless you ask not to be.
