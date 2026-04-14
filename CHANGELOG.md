# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-04-14

### Changed

- Upgrade dependencies: TypeScript 6.0.2, vitest 4.1.4, @types/node 25.x
- Add `types: ['node']` to tsconfig for @types/node@25 compatibility

## [0.2.1] - 2026-04-11

### Changed

- Normalize repository name to `lumira` across docs and config
- Wire install/uninstall subcommands into CLI entry point

## [0.2.0] - 2026-04-10

### Added

- `/lumira` skill for natural language configuration
- MCP server health display with parser and display toggle
- Named color themes: dracula, nord, tokyo-night, catppuccin, monokai
- Icon modes (nerd/emoji/none)
- Presets system with display toggle defaults
- Install/uninstall commands with backup support
- `contextTokens` display toggle and cache metrics display
- Cache metrics in line 2

### Changed

- Remove context bar brackets for cleaner display
- Rename layout values: `custom` → `full`, `multiline/singleline/auto`
- Unify all renderer signatures to `(ctx: RenderContext, c: Colors)`
- Make `loadConfig` injectable via Dependencies interface
- Extract shared render utilities into `src/render/shared.ts`

### Fixed

- Resolve npx symlinks with `realpathSync` for direct-run detection
- Tighten TTY regex to exclude underscore
- Replace module-level globals with per-path Map cache in transcript parser
- Validate backup JSON before restoring on uninstall
- Handle `resets_at` in seconds by converting to milliseconds
- Respect `display.tools` and `display.todos` in renderLine3
- Count M in col 0 as staged, not excluded
- Write cache to per-user subdirectory to prevent TOCTOU attacks
- Validate `/proc` symlink target before shell interpolation
- Installer now copies `/lumira` skill to `~/.claude/skills/`

## [0.1.0] - 2026-04-09

### Added

- Unidirectional statusline pipeline: stdin → parsers → RenderContext → render → stdout
- 3-line custom mode with progressive truncation for narrow terminals
- 1-line minimal mode (auto-switches at <70 columns, or `--minimal` flag)
- **Line 1 (Identity):** model, git branch with staged/modified/untracked counts, directory, lines changed, active task, worktree, agent, session name, output style, version
- **Line 2 (Metrics):** 20-segment context bar with color thresholds (green/yellow/orange/blinking red), token counts (input/output), cost with burn rate ($/h), session duration, token speed (tok/s), rate limit usage (5h/7d) with countdown, vim mode, thinking effort level
- **Line 3 (Activity):** active and completed tools with count badges, todo progress bar with status counts (conditional)
- **Line 4 (GSD):** current GSD task and update notification (conditional, `--gsd` flag)
- Git status parser with 5-second TTL file cache
- Transcript parser (JSONL) with mtime+size caching — extracts tools, agents, todos, thinking effort
- Token speed calculation with 2-second sliding window
- Memory usage detection (Linux `os.freemem`, macOS `vm_stat`)
- GSD integration — current task from todos, update availability check
- 3-tier color system: named ANSI (default), 256-color, truecolor — named by default to respect terminal themes
- Nerd Font icons: fa-robot, dev-git-branch, fa-folder-open, fa-fire, fa-skull, fa-comment, fa-clock, fa-bolt, fa-tree, fa-cubes, fa-hammer, fa-warning
- Config file support (`~/.config/lumira/config.json`) with 22 display toggles
- CLI flags: `--minimal` (force minimal mode), `--gsd` (enable GSD features)
- Dependency injection for full testability
- Unicode-aware display width calculation (CJK, emoji, combining marks, zero-width joiners)
- Progressive field truncation adapting to terminal width
- Stdin parser with progressive timeout (250ms first-byte, 30ms idle)
- Terminal width detection: TTY columns → COLUMNS env → /proc tree walk → tput fallback → 120 default
- Secure file cache with exclusive write flag (`wx`) and 0o600 permissions
- Path validation on transcript parser (only `~/.claude` or `/tmp`)
- Session ID sanitization in GSD parser (whitelist `\w` and `-`)
- Safe `execFile` wrapper (no shell injection) with configurable timeouts
- npm publishable with `"files": ["dist"]` and `prepublishOnly` script
- 138 tests across 21 test files with Vitest
- TypeScript strict mode, ES2022 target, NodeNext ESM
- Zero runtime dependencies

### Security

- Cache writes use `wx` flag (O_EXCL) to prevent symlink attacks
- Transcript path validation restricts reads to `~/.claude` and `/tmp`
- GSD session IDs sanitized against path traversal
- `execFile` used instead of `exec` to prevent shell injection (except terminal width detection where shell redirect is required with procfs-sourced paths)

[Unreleased]: https://github.com/cativo23/lumira/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/cativo23/lumira/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/cativo23/lumira/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/cativo23/lumira/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/cativo23/lumira/releases/tag/v0.1.0
