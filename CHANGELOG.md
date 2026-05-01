# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- README hero shot (tokyo-night classic, 2x DPR) and asciinema embed below the hero showing the context bar filling 5%→96% with active tools and the GSD widget.
- Display section in README: ASCII-text examples replaced with rendered PNG mockups for Custom / Minimal / Powerline modes.
- `LICENSE` file (MIT 2025-2026) — package.json declared MIT but the file was missing.
- README polish: table of contents, Contributing section linking to CONTRIBUTING.md / SECURITY.md / issue #36, expanded Credits with attribution to upstream theme spec sources, expanded License section.
- `homepage` and `bugs` fields in package.json.
- Reproducible demo pipeline: `scripts/capture-payloads.mjs` (statusline wrapper that snapshots payload + transcript), `scripts/build-asciinema.mjs` (`.cast` builder with `--sort-by-context`, `--dedupe-by-context`, `--max-frames`), `scripts/build-display-screenshots.mjs` + `scripts/capture-display.sh` (chrome headless renders for the Display section).

### Changed
- README image refs use absolute `raw.githubusercontent.com` URLs so screenshots render reliably across npmjs.com, social-preview scrapers, and third-party aggregators.
- CI workflow now declares `permissions: { contents: read }` (defense-in-depth read-only token).

## [0.6.2] - 2026-05-01

### Added
- **`lumira themes` subcommand** — browse and preview the 7 built-in themes from the CLI without touching config. `lumira themes` (or `themes list`) prints names + one-liner descriptions; `lumira themes preview <name>` renders a 3-line sample; `--powerline` and `--style=<arrow|flame|slant|round|diamond|compatible|plain|auto>` toggle the powerline visual; `--all` renders every theme in catalog order (great for screenshots and the upcoming Show & Tell post). `lumira themes help` documents the surface.

### Changed
- **`POWERLINE_STYLE_NAMES` is now the single source of truth** for the valid powerline style set. `src/config.ts` (JSON validation + `--powerline-style` CLI parser) and `src/render/powerline.ts` (`PowerlineStyleName` type) both derive from it. A new test (`tests/render/powerline.test.ts`) asserts `POWERLINE_STYLES` map keys stay in sync — adding a name to one but not the other now fails CI.

### Fixed
- **Themes subcommand prototype-pollution guard** — `THEMES['__proto__']` and similar inherited members no longer bypass the unknown-theme check. `Object.prototype.hasOwnProperty.call` is used consistently in `runThemesCommand` and `resolveTheme`.
- **Themes subcommand error path now writes to stderr** with a non-zero exit code, so `2>/dev/null` and `echo $?` work as users expect.
- **Control-character sanitization on error banners** — invalid theme names no longer emit raw escape sequences into the user's terminal.

## [0.6.1] - 2026-04-30

### Fixed
- **Install wizard now shows distinct previews per preset.** `full` and `balanced` rendered identically because `buildMockContext` only mirrored the preset's layout while leaving every display toggle at its default. The wizard now goes through the same `applyPreset` code path as `loadConfig` / `mergeCliFlags`, so each preset shows the actual segment set users will see after install. CLI flags (`--full` / `--balanced` / `--minimal`) were never affected.

## [0.6.0] - 2026-04-30

### Added
- **Powerline renderer (line 1, 2, 3)** — opt-in via `style: "powerline"` (or `--powerline`). Seven separator presets: `arrow`, `flame`, `slant`, `round` (with caps + thin internal sep), `diamond` (per-segment pills), `compatible` (unicode `▶`, no Nerd Font needed), and `plain` (color blocks only). Pick with `powerline.style` in config or `--powerline-style=<name>` on CLI. `auto` picks `arrow` when Nerd Font is available, otherwise `compatible`. Hand-curated powerline palettes for all 7 built-in themes (dracula, nord, tokyo-night, catppuccin, monokai, gruvbox, solarized) — distinct hues per segment, all clear WCAG AA contrast for white fg. Themes without an explicit palette fall back to an auto-derived one. Includes **git-dirty bg swap** (branch segment turns red when staged/modified/untracked > 0) and **priority-based eviction** (drops lowest-priority segments first when the terminal is narrow). Named-ANSI terminals fall back to the classic renderer — powerline needs RGB backgrounds and named-ANSI has only 8 base hues.
- **OSC 8 hyperlinks** — the directory (line 1) is now a clickable `file://` link that opens the folder in the OS file manager, and the version tag links to the matching Claude Code npm release page. Modern terminals (iTerm2, WezTerm, Kitty, Alacritty, VS Code, tmux ≥3.4 with passthrough) render them as hyperlinks; terminals without support show plain text. Auto-disabled in Apple_Terminal (which leaks escape markers as text) and `TERM=dumb`. Opt out with `NO_HYPERLINKS=1`; force on with `FORCE_HYPERLINK=1`.
- **Config health widget** (opt-in, `display.health: true`) — line 2 surfaces silent fallbacks at a glance: `theme` set in named-ANSI mode (no effect), `style: "powerline"` in named-ANSI (falls back to classic), `gsd: true` with no `.planning/STATE.md` reachable from cwd. Hints sit on the right side next to vim/effort and are dropped silently if they would push line 2 past terminal width.
- **Context bar `plain` rendering mode** — when the bar is embedded in a powerline segment, cells inherit the segment background (proportion still reads from cell length) while the percentage value, warning icon (☠/🔥), and `/compact?` hint keep their alarm colors. Avoids the visible "holes" that inline `\x1b[0m` resets would leave inside a colored segment.

### Fixed
- **`stripAnsi` now handles the ST (`ESC \`) OSC terminator**, not just BEL. Required so OSC 8 sequences don't leak into `displayWidth()` and throw off terminal-width fitting.
- **Config health GSD walk uses `dirname`**, not `join(dir, '..')` — the prior form never resolved and silently bailed at the iteration cap on deeply-nested projects.

## [0.5.0] - 2026-04-23

### Added
- **`LUMIRA_DEBUG=1` env flag** for diagnostic logging. Writes to stderr so statusline stdout stays clean. Instruments transcript, GSD, and MCP parsers with decision traces (cache hits/misses, `.planning/STATE.md` resolution, which `.mcp.json` loaded which servers, malformed JSON). Useful when investigating "why doesn't X show up?" reports. Denylist accepts `0`/`false`/`no`/`off` (case-insensitive) for explicit disable.

### Security
- **`line1` renderer now reads from the normalized input layer** instead of raw stdin JSON. `input.worktreeName`, `input.agentName`, `input.sessionName`, and `input.outputStyle` have already passed through `sanitizeTermString()` (strips C0/C1/DEL control chars). Previously line1 was reading `input.raw.*` directly, bypassing that guard — same class of vulnerability as #14/#15, now closed.

## [0.4.0] - 2026-04-23

### Added
- **Two new themes: `gruvbox` and `solarized`** — both among the most-requested palettes. Catalog is now at 7 themes.
- **Actionable context hints** — `/compact?` (dim) at ≥80% context fill, `/compact!` (red) at ≥90%, nudging the user to reclaim context before the session stalls. Opt out via the new `showHint: false` option on `buildContextBar`. The `minimal` preset opts out automatically to preserve its tight single-line budget.

### Changed
- **Themes now work in 256-color terminals.** Previously `resolveTheme` returned null for any mode other than truecolor, silently disabling themes for users on VS Code terminal, tmux without `-2`, or SSH without `COLORTERM=truecolor`. Palettes now project each RGB value to the nearest xterm 256-color cube index (standard Chalk/ansi-styles algorithm). Named-ANSI mode still returns null by design — 8 base hues are not enough fidelity to honour a theme accurately.
- **GSD integration rewritten** to match the current `get-shit-done` state layout:
  - Update cache read from shared `~/.cache/gsd/gsd-update-check.json` (GSD #1421's tool-agnostic location), with legacy `~/.claude/cache/` fallback.
  - Current task is now derived from walking up from `cwd` looking for `.planning/STATE.md`, parsing the YAML frontmatter + `Phase: N of M (name)` line. Formatted as `milestone · status · phase (N/M)`.
  - `getGsdInfo` signature changed from `(session, claudeDir?)` to `(cwd, opts?)` with `claudeDir` and `sharedCacheFile` as test overrides.

## [0.3.2] - 2026-04-23

### Security
- Sanitize `ToolEntry.name`, tool targets (file paths / patterns / Bash commands), `TodoEntry.content`, and `AgentEntry` metadata at the transcript parser boundary so a malformed JSONL file cannot inject terminal control sequences via `line1`/`line3`.
- Sanitize `gsd.currentTask` from local todo JSON before it reaches `line4` and `minimal` renderers.

### Changed
- Collapse installer dual-path into a single linear flow; `configPath` defaults to `~/.config/lumira/config.json`. New `emitFooter()` helper emits skill install + Qwen notice + restart message from both success branches, eliminating drift risk.
- Replacement confirmation prompt now fires before the wizard, so a user declining to replace an existing statusline no longer wastes time configuring preset/theme/icons.
- Vitest pool explicitly pinned to `forks` with a comment explaining that `src/config.ts` and `src/tui/select.ts` carry process-scoped module flags.

### Fixed
- Remove unreachable `return leftStr` after the inner loop in `fitSegments`.

### Docs
- JSDoc and comments for test-only exports (`_resetMigrationFlags`, `buildMockContext`).
- Document `left[0]` assumption in the `fitSegments` last-resort branch.

### Tests
- Strengthen `fitSegments` drop-segment test with positive assertions that the model and branch segments survive.

## [0.3.1] - 2026-04-21

### Added
- Interactive install wizard (`npx lumira install`): choose preset, theme, and icons with arrow-key navigation and a live preview. Pre-selects current config values when re-running.
- ASCII banner printed on install with dynamic version from `package.json`.
- `/lumira` skill is now installed for Qwen Code as well (when `~/.qwen/` is detected).
- Render layer auto-switches to single-line output when the caller is Qwen Code, so Qwen users see the rich compact line regardless of their configured layout.

### Changed
- `saveConfig` writes `~/.config/lumira/config.json` atomically (tmp file + rename) with `0o600` permissions, preserving any keys the user set by hand.
- Branch name display caps raised across all terminal widths — long CA-ticket style branch names now show significantly more characters before truncating.
- `fitSegments` now drops tail left-side segments on overflow (symmetric with right-side behavior), preventing terminal line wrap when left segments collectively exceed the available width.

### Removed
- **BREAKING:** `qwen` preset removed. It was functionally identical to `minimal`; with the render-layer auto-switch, the alias no longer serves a purpose. Existing configs with `preset: "qwen"` are silently coerced to `minimal` and a one-shot stderr warning is printed. CLI flag `--qwen` is removed; use `--minimal` instead.

## [0.3.0] - 2026-04-15

### Added

- Full Qwen Code statusline compatibility — lumira now renders statuslines for both Claude Code and Qwen Code
- `normalize()` layer: single source of truth that unifies platform payloads into `NormalizedInput`
- `sanitizeTermString()`: strips C0, C1, and DEL control characters from all untrusted string fields before terminal output
- `--qwen` preset for compact single-line Qwen output
- `QwenInput` interface and `isQwenInput()` type guard with `api` sub-object discriminant
- `formatQwenMetrics()` shared helper for DRY rendering of Qwen API metrics
- `rateLimits` and `cacheHitRate` fields in `NormalizedInput`
- Qwen-native git branch, API metrics (requests/errors/latency), cached tokens, and reasoning thoughts display
- 26 sanitization and edge case tests — normalize.ts at 100% coverage
- AGENTS.md following official agents.md spec

### Changed

- Renderers consume `NormalizedInput` exclusively — zero `isQwenInput()` calls in the render layer
- `isQwenInput()` strengthened to check `api` sub-object, preventing false positives
- External git branch sanitized in `parseGitStatus()` with C0+C1+DEL regex
- `buildContextBar` simplified — removed dead `pctInsideBar` branch
- Model fallback changed from `'unknown'` to `''` (renderers skip empty model)

### Security

- All string fields from stdin JSON sanitized via `sanitizeTermString()` in normalize: model, sessionId, version, cwd, gitBranch, vimMode, sessionName, outputStyle, agentName, worktreeName
- Sanitization regex covers full C0 (`\x00-\x1f`), C1 (`\x80-\x9f`), and DEL (`\x7f`) ranges
- External git parser output sanitized before reaching terminal

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

[Unreleased]: https://github.com/cativo23/lumira/compare/v0.6.2...HEAD
[0.6.2]: https://github.com/cativo23/lumira/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/cativo23/lumira/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/cativo23/lumira/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/cativo23/lumira/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/cativo23/lumira/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/cativo23/lumira/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/cativo23/lumira/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/cativo23/lumira/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/cativo23/lumira/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/cativo23/lumira/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/cativo23/lumira/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/cativo23/lumira/releases/tag/v0.1.0
