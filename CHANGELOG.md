# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **7d quota projection warning** — the 7d rate-limit segment now extrapolates the current burn rate and appends a warning when the quota would be hit before the window resets: `⚠ ~24h`, `⚠ ~2d`, `⚠ Tue`, or `🔥 ~8h` (critical icon under 12h). Renders in both classic and powerline modes; coexists with the existing reset countdown (e.g. `75%(7d) 144h00m 🔥 ~8h`). Default-on; off in the `minimal` preset. Gated by `display.quotaProjection`. Different from pace delta: pace looks at the 5h window's actual vs proportional burn; projection looks at the 7d window's exhaustion ETA. New module `src/render/quota-projection.ts` exposes `computeQuotaProjection` and `formatProjectionWarning` as a window-agnostic helper with an injectable `minElapsedSec` floor — the 7d caller pins it to 3600 (1h) so early-session bursts don't trigger projections the steady-state rate won't sustain. Weekday names use `'en-US'` locale to keep snapshots reproducible. Closes #118.

## [1.2.3] - 2026-05-13

### Fixed
- **Powerline cache hit rate now escalates color with severity** — the cache segment rendered with `palette.versionBg` regardless of urgency, so a degraded 39% reading looked identical to a still-healthy 85% one. Classic mode already escalated via `getCacheHitColor` on the foreground; powerline now does the same on the background: `mild` keeps `versionBg` (the segment already sits inside the <90% alarm-mode gate), `moderate` (40–69%) escalates to `taskBg`, `critical` (<40%) to `branchDirtyBg`. Mirrors the rate-limit escalation pattern at `powerline-line2.ts:73-77`. (#124, closes #120)

### Changed
- **Cache hit threshold logic lifted into a shared SSOT** — extracted `getCacheHitTier()` in `colors.ts` returning `'mild' | 'moderate' | 'critical'`. Both `getCacheHitColor` (classic fg) and the new powerline bg mapper consume it, eliminating the duplicated 70/40 boundaries that produced #120 in the first place. TypeScript exhaustiveness on both switches catches future tier extensions at compile time.

## [1.2.2] - 2026-05-08

### Fixed
- **Powerline-line1 widget parity gap** — `display.linesChanged`, `.worktree`, `.agent`, `.sessionName`, and `.style` were all honored by classic line1 but silently dropped by the powerline render. Users with these toggles enabled in `~/.config/lumira/config.json` got no rendering in powerline mode. Added the 5 segments with priorities 18–24 (drop after `tokenSpeed` when narrow; `style` drops first), palette assignments matching their semantic category (`linesChanged` and `sessionName` on `branchCleanBg`, `worktree` on `dirBg`, `agent` on `taskBg`). `linesChanged` renders as a single `+N -M` segment in powerline (vs classic's two-color spans, which the segment model can't express).

## [1.2.1] - 2026-05-07

### Fixed
- **Zombie subagents from oversized last lines** — long Opus reviewer subagents emitted closing assistant messages around 17 KB, which exceeded the 16 KB tail-chunk window the boundary reader used on large files. The last line failed to parse, `stop_reason` was unreachable, and the agent stuck on `running` indefinitely. Bumped `BOUNDARY_CHUNK_SIZE` to 64 KB and `LARGE_FILE_THRESHOLD` to 256 KB; peak buffer for a 10-agent miss is now ~1.3 MB.
- **Zombie subagents from `stop_reason: null` finalisations** — Claude Code occasionally writes the closing assistant message with `stop_reason: null` (text-only content, no `tool_use`) for short subagents that completed normally. Added a tell-apart heuristic: if the last assistant content carries no `tool_use` block, the agent is treated as completed regardless of `stop_reason`. Running agents waiting on a tool always have a `tool_use` block in their last assistant message, so the inverse direction is preserved.

## [1.2.0] - 2026-05-07

### Added
- **Subagents-dir live state** — reads per-subagent transcripts from `<session>/subagents/agent-<id>.jsonl` (Claude Code ≥ 2.1.x layout) as the primary source of agent status, surfacing background subagents whose parent `tool_use` stays buffered in the main JSONL. Status is derived from explicit on-disk markers only: `stop_reason: "end_turn"` for normal completion, the `[Request interrupted by user…]` marker for user kills; everything else is treated as running (no mtime grace window — its false negatives on long-tool agents outweighed the zombies it would otherwise prevent). Falls back to main-JSONL parsing when the dir is absent.
- **Cubes-icon widget on line 1 surfaces named subagents** — when exactly one *named* subagent (i.e. not `general-purpose` / `unknown`) is running, line 1 shows `⬚ <type>` next to the version, mirroring how Claude Code's `agent.name` widget already renders for `--agent`-launched sessions. Multiple-named-running stays collapsed under the line 3 `⚡N agents` count to avoid arbitrary picks. Closes the workaround documented in anthropics/claude-code#14306.
- New shared `realpathSafe` and `LUMIRA_ALLOWED_ROOTS` exports in `utils/path.ts` so the path canonicalisation + allow-list check is consistent across the transcript and subagents parsers.

### Fixed
- **`Task` → `Agent` tool name accepted** — Claude Code 2.1.x renamed the subagent dispatch tool. The transcript parser now matches both names so the live agent count widget works on every installed version (#121).
- **Zombie agents no longer resurrect** — when Claude Code re-emits a `tool_use` after its matching `tool_result` (observed when a subagent dispatch fails with "Agent type not found" and is retried), the parser now treats the first completion as authoritative. Previously left the `⚡N agents` widget stuck on indefinitely.

### Changed
- Bundle-size ceiling raised from 384 KB → 440 KB to fit the new subagents parser (~+36 KB). `ci.yml` and `release.yml` bumped in lockstep.

## [1.1.2] - 2026-05-07

### Fixed
- **Release workflow bundle-size ceiling synced** — v1.1.1 tag failed to publish because the bundle-size ceiling was duplicated between `ci.yml` and `release.yml`, and the v1.1.0 → v1.1.1 PR only bumped the former. v1.1.2 reissues the same content as v1.1.1 with the release-workflow ceiling now matched. Skip v1.1.1.

### Changed
- **Cache hit rate widget switched to alarm mode** — only renders when `cacheHitRate < 90%`. Anthropic's prompt cache pins this near 99% in healthy steady-state sessions, so an always-on 99% reading was wallpaper, not signal. Now mirrors the hide-when-healthy pattern used by rate-limits (≥50%) and agent-count (≥1). Color tiers updated to reflect "degrees of degradation": yellow 70–89%, orange 40–69%, blinkRed <40%.

## [1.1.0] - 2026-05-07

### Added
- **`display.paceDelta` toggle** — pace delta now has its own visibility flag, independent of `display.rateLimits`. Default true; off in the `minimal` preset. Lets users show the pace signal without the raw 5h/7d percentages, or vice versa.
  - **Migration note for users who set `display.rateLimits: false`**: in v1.0.x, that toggle also implicitly hid the pace segment. With independent gating, pace will now reappear unless you also set `"paceDelta": false` in your config.

### Fixed
- **Powerline countdown intentionally absent — now documented** — added a code comment explaining that the pace delta segment communicates time-to-exhaustion in powerline mode, replacing the classic-mode countdown signal.
- **`memory.ts` accepts an injectable `MemoryReader`** — the previous `getMemoryInfo()` test passed vacuously on CI runners without `/proc/meminfo` or `vm_stat`. Refactored to accept a `MemoryReader` (default uses `node:os` + `execFileSync` as before). 11 new deterministic tests cover both the linux freemem path and the darwin vm_stat parser. Production callers unchanged. **Behavior change:** the darwin path now returns `null` when `totalmem()` reports `0` (previously surfaced a phantom 100% reading).

## [1.0.1] - 2026-05-07

### Fixed
- **`normalize.ts` allows `cacheHitRate = 0` as a legitimate value** — the gate `cached > 0` collapsed "no cache hits this turn" into the same `undefined` as "no data at all". Now returns `0` when the per-turn denominator is positive, treating zero as data rather than absence-of-data.
- **Uninstall cleans up empty `skills/` parent dir** — after removing `skills/lumira/`, lumira now also attempts to remove the parent `skills/` directory. `rmdirSync` fails with `ENOTEMPTY` when other skills exist, so co-installed skills are preserved.

## [1.0.0] - 2026-05-07

First stable release. API is now considered stable under SemVer.

### Added — Session Intelligence
- **Pace delta widget** — shows `usedPct − elapsedPct` of the 5h rate-limit window. Turtle (🐢) when behind pace (healthy), car (🏎️) with time-to-exhaustion when ahead. Color escalates green → yellow → orange → blinkRed at 0/15/30/30+ deltas. Renders in both classic and powerline modes; gated by `display.rateLimits`.
- **Live agent count** — `⚡N agent(s)` segment showing the count of running subagents from the transcript. New `display.agents` toggle (default on; off in `minimal` preset). Renders in both classic and powerline modes.
- **Cache hit rate display** — appended to the token segment as `87%⚡` with green/yellow/orange tiers at 70/40 thresholds. Already gated by `display.cacheMetrics`.

### Fixed — Pre-v1.0 review pass
- **`installer.ts` atomic `settings.json` write** — `writeFileSync(tmp)` + `renameSync(tmp, dest)` mirrors the pattern in `saveConfig`, eliminating the corrupt-on-interruption window for `~/.claude/settings.json`.
- **`normalize.ts` defensive `context_window` guard** — null/undefined `context_window` no longer crashes `normalize()`; degrades gracefully via `(input.context_window ?? {})`.
- **`stdin.ts` 1 MiB limit + shape validation** — rejects runaway producers and non-object JSON (`null`, scalars, arrays). New `StdinParseError` subclass lets `index.ts` distinguish parse failures from real errors.
- **`shared.ts` `buildContextBar` clamping** — `pct > 100` or `pct < 0` no longer crashes via negative `repeat()` count; `Math.max(0, Math.min(segments, …))` bounds the fill.
- **`installer.ts` JSON shape validation** — only accepts plain objects (matches `config.ts:209`).
- **`installer.ts` ANSI sanitization** — foreign `statusLine.command` is now sanitized via `sanitizeTermString` before rendering in the warning banner.
- **`tui/select.ts` SIGINT/SIGTERM/SIGHUP handlers** — terminal raw mode and cursor are now restored on signal-induced exit.
- **`format.ts` NaN/Infinity guards** — `formatTokens`, `formatDuration`, `formatCost`, `formatBurnRate` now return empty/null for non-finite or negative inputs.
- **`transcript.ts` TodoWrite content rebuild** — content edits without status changes are now preserved instead of silently dropped.
- **Boundary tests pinned** — `getQuotaColor`, `getPaceColor`, `getCacheHitColor` boundary transitions are now explicitly tested.
- **Vacuous tests fixed** — `token-speed.test.ts` no longer conditional-asserts; `render/index.test.ts` and `integration.test.ts` now assert content rather than `length > 0`.

### Changed
- **`stdin.ts` returns `Promise<RawInput>`** — Qwen runtime branch is now reachable (was effectively dead code under `Promise<ClaudeCodeInput>`).
- **`index.ts` non-zero exit code on render failures** — Cron/CI invocations can now detect crashes (was silently exit 0 except for `SyntaxError`).

## [0.9.5] - 2026-05-06

### Fixed
- **`installer.ts` tmp file includes PID + timestamp** — `.<pid>.<ts>.lumira.tmp` eliminates collision risk between concurrent installs and makes stale tmp files from crashed processes unambiguous to clean up.
- **`uninstall()` error message split** — parse failures now emit "Could not parse settings.json" and return early; write failures propagate as thrown errors. Previously both failure modes showed the parse message regardless of the actual cause.
- **`powerline-line2` mirrors `display.health` hints** — config-health hints (`getConfigHealth`) were present in classic line2 but missing from the powerline render path. Added as priority-10 segments (lowest, evicted first on narrow terminals).

## [0.9.4] - 2026-05-06

### Fixed
- **`installer.ts` temp file in same directory** — temp file is now written to `<settingsDir>/.lumira.tmp` instead of a system temp path, eliminating the `EXDEV` cross-filesystem rename error on Linux when `~/.claude/` is on a different mount than `/tmp`.
- **`cache.ts` full MD5 digest** — cache key now uses the full 32-character hex digest instead of an 8-character slice, eliminating the 32-bit birthday collision risk for users with many concurrent worktrees.
- **`parsers/gsd.ts` balanced-quote stripping** — frontmatter values are now stripped with `/^(["'])(.*)\1$/` instead of independent leading/trailing replacements, preventing false-strip of values like `"it's"` or `'say "hi"'`.
- **`parsers/mcp.ts` `mcpServers` shape guard** — non-object or array `mcpServers` values no longer crash the parser; they now return `null`.
- **`stdin.ts` tagged `StdinParseError`** — parse errors are now a `StdinParseError` subclass of `SyntaxError`, letting `index.ts` narrow the catch and suppress the stderr dump only for expected parse failures.
- **`utils/terminal.ts` PPID parsing** — `comm` field is now sliced from after the last `)` in `/proc/<pid>/stat`, correctly handling process names that contain spaces or parentheses.
- **`utils/cache.ts` `getUid()` helper** — Windows fallback now uses `userInfo().username` in a try/catch to handle containers where the UID has no `/etc/passwd` entry, instead of crashing.
- **`render/powerline-line2.ts` parity with classic line2** — added 6 missing segment families: tokens (`↑`/`↓`), cache hit rate, burn rate (appended to cost), MCP server count/errors, Qwen metrics, and vim mode / effort level. All are gated by the same `display.*` flags as their classic counterparts.
- **`render/powerline-line3.ts` pending task count** — added `○ N` pending segment (priority 80 when running is present); completed tasks segment now always renders when present regardless of running state.
- **`render/text.ts` stray ANSI reset removed** — last-resort truncation in `fitSegments` no longer appends a bare `\x1b[0m]` that bled color into adjacent terminal output.
- **`tui/select.ts` `activeFinish` resolver** — module-level resolver is now set/cleared on each `selectItem` call and invoked on SIGINT/SIGTERM, ensuring the Promise always settles on signal-induced exit and raw mode is reliably restored.

### Tests
- Added 623-test suite covering all fixes above with TDD-first approach.

## [0.9.3] - 2026-05-07

### Fixed
- **Context tokens (`94k/200k`) now always appear before rate-limit segments on line 2** — critical rate limits (≥85%) were spliced right after the context bar, pushing the token count after the usage indicator. Context info (bar + tokens) is now always grouped before usage signals.

### Refactored
- **Dropped legacy top-level `cache_read_input_tokens` fallback** — pre-2.1.x Claude Code payloads that exposed `cache_read_input_tokens` at the top level of `context_window` (not nested under `current_usage`) now produce `undefined` for `tokens.cached`. `cacheHitRate` was already `undefined` for these payloads (no per-turn denominator), so both fields are now consistently `undefined` for legacy payloads. Closes #79, #80.

## [0.9.2] - 2026-05-06

### Fixed
- **`getQuotaColor` now guards non-finite inputs** — `NaN`, `Infinity`, and `-Infinity` all return `'blinkRed'` via an explicit `Number.isFinite` check. Previously `-Infinity < 50` evaluated to `true`, silently returning `'green'` for an invalid input.
- **`gsd` body Status checked independently of Phase line** — the `else if` that skipped the body `Status:` fallback when a `Phase: N of M` line was present is now a standalone `if`. Transcripts with a Phase line but no frontmatter `status` now correctly pick up the body value.
- **`powerline.ts` diamond width** — removed dead `+ 0` arithmetic in the diamond segment width calculation.
- **`text.ts` last-resort truncation adds ANSI reset** — `fitSegments` now appends `\x1b[0m]` after a hard-truncated segment to prevent color bleed into adjacent output.
- **`normalize.ts` cast removal** — `(input as { cwd?: string }).cwd` replaced with `input.cwd`; `RawInput` already declares `cwd?: string` on both union members.
- **`ThinkingEffort` type synced with `VALID_EFFORT_LEVELS`** — `'xhigh'` added to the union in `types.ts` to match the set in `normalize.ts`.
- **`transcript.ts` effort regex** — added `xhigh` to the alternation and scoped the match to `JSON.stringify(entry)` instead of the raw JSONL line.
- **`config.ts` argv regex** — `[= ]?` changed to `=?` for `--preset` and `--icons` flags; `[= ]` changed to `=` for `--powerline-style`. Since argv is already shell-tokenized, the space form could never match.
- **`cache.ts` Windows uid fallback** — `process.getuid?.() ?? 'default'` replaced with a `getUid()` helper that uses `getuid()` on POSIX and falls back to `userInfo().username` (with try/catch for containers where the UID has no `/etc/passwd` entry) on Windows.
- **`monokai.ts` intentional duplicate colors documented** — `red === magenta` and `brightBlue === cyan` are expected in Monokai's palette; comments make this explicit.

### Tests
- **False-confidence assertions tightened** — theme test asserts Dracula-specific cyan escape `\x1b[38;2;139;233;253m`; integration workspace fallback asserts specific basename; powerline-line3 both-segments test asserts `'Edit'` and `'1/1'` independently.
- **`displayWidth()` replaces `.length`** in terminal width assertions across `line1`–`line2` tests — byte length is wrong for ANSI-wrapped strings.
- **`ClaudeCodeInput` explicit type** replaces `as any` cast in `line3` and `line4` test helpers — AGENTS.md forbids `as any`.
- **`getQuotaColor` boundary coverage** — exact 49/50 (green→yellow), 69/70 (yellow→orange), 84/85 (orange→blinkRed) transitions tested; `Infinity` and `-Infinity` cases added (the latter actually validates the guard, as old code returned `'green'` for `-Infinity`).
- **MCP parser uses injection seam** — `vi.mock('node:fs')` replaced with a `McpReader` interface + optional `reader` parameter; `makeReader` throws on unregistered paths, eliminating silent false-passes.

## [0.9.1] - 2026-05-06

### Fixed
- **Installer writes `settings.json` atomically** via tmp+rename — interrupted installs no longer leave the user's Claude settings file truncated or corrupt.
- **Installer validates `settings.json` shape** — payloads that are valid JSON but not an object (`null`, arrays, scalars) are now treated as a parse failure and reset to a fresh settings file instead of crashing with a TypeError.
- **Foreign `statusLine.command` sanitized before display** — ANSI escape sequences in a third-party tool's command string are stripped before being printed in the installer's replacement warning banner.
- **`stdin` rejects non-object JSON payloads** — `null`, arrays, and scalars are now rejected with a descriptive error rather than propagating silently as `ClaudeCodeInput`.
- **`stdin` caps input at 1 MiB** — unbounded accumulation from a misbehaving producer is now rejected early.
- **`normalize` guards absent `context_window`** — payloads missing the `context_window` field no longer crash with `Cannot read properties of undefined`; token counts and `usedPercentage` degrade to zero.
- **`buildContextBar` clamps fill count** — `pct > 100` or `pct < 0` no longer throws `RangeError: Invalid count value` from `String.prototype.repeat`; `NaN` pct is treated as 0.
- **Format helpers guard `NaN` and `Infinity`** — `formatTokens`, `formatDuration`, and `formatCost` now return `''` instead of rendering `"NaNs"`, `"InfinityM"`, or `"$NaN"` into the statusline. `formatCost` also rejects negative values; `formatBurnRate` guards both negative cost and non-finite values.
- **`tui/select` restores terminal on SIGINT/SIGTERM/SIGHUP** — raw mode and hidden cursor are now cleaned up on signal-induced exit, not just natural exit.
- **`TodoWrite` merge preserves content updates** — renaming a todo without changing its status no longer silently discards the new text.
- **`config-health` walk aligns with `gsd` parser** — both now stop at `homedir()` with a limit of 10 directories, preventing the health hint and the actual GSD parser from disagreeing.
- **`lumira themes preview` accepts mixed-case theme names** — `Dracula`, `Nord`, etc. now match the same as their lowercase equivalents.
- **npm provenance attestation enabled** — `npm publish --provenance` is now passed so the `id-token: write` OIDC permission is actually used for supply-chain integrity.
- **`prepublishOnly` runs `lint` and `themes:validate`** — a local `npm publish` (e.g. emergency hotfix) can no longer bypass the WCAG contrast guard or type-check that CI enforces.

### Changed
- **`cacheHitRate` requires modern `current_usage` fields (#79)** — the legacy fallback that computed the per-turn cache-hit denominator from cumulative `total_input_tokens` has been removed. Only payloads that provide `context_window.current_usage` with per-turn token fields produce a `cacheHitRate`; older payloads return `undefined` (no misleading percentage from session-accumulated totals).
- **`getCacheFields` helper deduplicates `current_usage` access (#80)** — `normalize` now reads `current_usage` through a single helper instead of two separate blocks, removing the duplication noted in the v0.9.0 review.

## [0.8.0] - 2026-05-06

### Added
- **Rate limits as battery glyph (#91, #92).** The bolt prefix on the 5h/7d rate-limit segment is replaced with a Nerd Font Material Design battery icon that visually fills as your quota usage climbs. Colour (yellow/orange/red via `getQuotaColor`) keeps signalling tier; the glyph now signals **level** independently (battery_50 through battery_90), with the `battery_alert` glyph reserved for the 100% ceiling. Per icon mode:
  - `nerd` — 11 Material Design glyphs across deciles, alert at 100%
  - `emoji` — 🔋 below 85%, 🪫 at/above
  - `none` — empty (icon-less mode contract preserved)
- **Critical-tier rate-limit promotion.** When `usedPercentage >= 85%` (alert tier), the rate-limit segment now anchors right after the context bar instead of at the end of line 2. This guarantees critical quota information survives `fitSegments` eviction at narrow terminal widths — exactly when you most need to see it.
- **Defensive guards on rate-limit gating.** Malformed payloads with `NaN`/`Infinity`/string `usedPercentage` now skip the segment instead of rendering `"NaN%(5h)"`.

### Fixed
- **`displayWidth` undercount for Nerd Font Supplementary PUA-A glyphs.** Material Design Nerd Font icons (U+F0000–U+FFFFF) were counted as 2 cells by the catch-all `>= 0x1F000` rule, but render as 1 cell on patched fonts — matching how the existing BMP-PUA Nerd glyphs are already counted. Fixes `fitSegments` over-reserving width and dropping right-side segments earlier than necessary on tight terminals.

### Changed
- **Battery glyph dispatch matches displayed `%` rounding.** `nerdBattery(99.7)` now returns `battery_alert` (matching the `"100%"` displayed by `.toFixed(0)`) instead of `battery_90`. Prevents the glyph and the number from disagreeing at fractional ceiling values.
- **Layout-cols safety factor relaxed from 0.7 to 0.9 when stdout is non-TTY.** The historical 30% conservative reduction was overly defensive for the primary Claude Code statusline use case, where the host renders at full terminal width. New 10% headroom still hedges against host chrome (separators, gutters) without aggressively starving segments. Result: more segments fit at typical terminal widths.

## [0.7.2] - 2026-05-05

### Added
- **Configurable context bar thresholds** — `display.contextWarningThreshold` (default `70`) and `display.contextCriticalThreshold` (default `85`) let users tune when the context bar transitions through yellow/orange/red. Set both lower if you prefer earlier warnings, or higher if your workflow tolerates fuller buffers.

### Changed
- **Default color transitions shifted from 50/65/80 to 50/70/85.** The bar now stays yellow up to 70% (was 65%) and orange up to 85% (was 80%) before flashing red. If you preferred the old behavior, set `display.contextWarningThreshold: 65` and `display.contextCriticalThreshold: 80` in your config.

### Fixed
- **`getContextColor` now respects custom warning thresholds below the 50% green floor.** Previously a hardcoded `pct < 50 → green` short-circuit ignored `contextWarningThreshold` when set below 50, so a user with `contextWarningThreshold: 30` would still see green at 40%. The function now only returns green when both `pct < warning` and `pct < 50`.

## [0.7.1] - 2026-05-04

### Fixed
- Model name display now uses the sanitized `input.model` value from the normalization layer instead of reading `input.raw.model` directly. Previously all three renderers (`line1`, `minimal`, `powerline-line1`) bypassed `sanitizeTermString()`, which could allow terminal control sequences from a malformed stdin payload to reach the statusline output.
- Removed the now-dead `getModelName()` helper from `src/render/shared.ts`; its logic was already duplicated and superseded by `normalize.ts`.

## [0.7.0] - 2026-05-01

### Added
- **Modular theme system** — `src/themes/<slug>.ts` per theme, registry assembly in `src/themes/index.ts` with `assertValidRegistry` enforcing kebab-case slugs and uniqueness at module load. Adding a new theme is now one new file plus a one-line registration.
- **WCAG AA contrast guard** — `scripts/validate-themes.mjs` runs in CI and fails the build if any powerline cell drops below 4.5:1 against `fg`. Catches contributor PRs that submit unreadable palettes.
- **Theme contribution flow** — `.github/PULL_REQUEST_TEMPLATE/theme.md` (opt-in via `?template=theme.md`), expanded "Adding a theme" walkthrough in `CONTRIBUTING.md`.
- **README hero shot** — tokyo-night classic mode rendered at 2x DPR (`assets/showcase/hero-5-2.png`), placed above the fold.
- **Asciinema embed** — interactive demo (https://asciinema.org/a/apvjkloigO9hrdVA) showing the context bar filling 5%→96% with active tools and GSD widget.
- **Display section screenshots** — Custom / Minimal / Powerline mode mockups replace the previous ASCII text blocks.
- **Themes gallery** — all 7 themes rendered side by side in both classic and powerline modes (`assets/showcase/themes-gallery-classic.png`, `themes-gallery-powerline.png`).
- **README polish** — quick-start fast-path above the badges, Why lumira section, Requirements section, Themes promoted to top-level `##` heading, inline roadmap in Contributing, Discussions CTA above the TOC, trimmed Features list (18 → 8 hero bullets + collapsible disclosure for the rest).
- **`LICENSE` file** (MIT 2025-2026) — `package.json` declared MIT but the file was missing.
- **`homepage` and `bugs` fields** in `package.json`.
- **Reproducible demo pipeline** — `scripts/capture-payloads.mjs` (statusline wrapper that snapshots stdin payload + the live transcript file), `scripts/build-asciinema.mjs` (`.cast` builder with `--sort-by-context`, `--dedupe-by-context`, `--max-frames`), `scripts/build-display-screenshots.mjs` + `scripts/capture-display.sh` + `scripts/build-themes-gallery.mjs` + `scripts/capture-themes-gallery.sh` (chrome headless render → imagemagick auto-trim).
- **Theme palette attribution** in Credits — links to upstream specs for Dracula, Nord, Tokyo Night, Catppuccin, Monokai, Gruvbox, Solarized.

### Changed
- **Nord's powerline `modelBg`** darkened from `rgb(94,127,150)` to `rgb(84,113,137)` to satisfy WCAG AA contrast (was 4.24:1, now 5.21:1).
- **CI workflow** now declares `permissions: { contents: read }` at the top level (defense-in-depth read-only token; `release.yml` is the only workflow that needs write).

### Fixed
- Wrapper script `capture-payloads.mjs` no longer drops empty stdin pings on the floor — it forwards to lumira unconditionally so the statusline never goes blank during Claude Code restarts.

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

[Unreleased]: https://github.com/cativo23/lumira/compare/v1.2.3...HEAD
[1.2.3]: https://github.com/cativo23/lumira/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/cativo23/lumira/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/cativo23/lumira/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/cativo23/lumira/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/cativo23/lumira/compare/v1.1.0...v1.1.2
[1.1.0]: https://github.com/cativo23/lumira/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/cativo23/lumira/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/cativo23/lumira/compare/v0.9.5...v1.0.0
[0.9.5]: https://github.com/cativo23/lumira/compare/v0.9.4...v0.9.5
[0.9.4]: https://github.com/cativo23/lumira/compare/v0.9.3...v0.9.4
[0.9.3]: https://github.com/cativo23/lumira/compare/v0.9.2...v0.9.3
[0.9.2]: https://github.com/cativo23/lumira/compare/v0.9.1...v0.9.2
[0.9.1]: https://github.com/cativo23/lumira/compare/v0.9.0...v0.9.1
[0.9.0]: https://github.com/cativo23/lumira/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/cativo23/lumira/compare/v0.7.2...v0.8.0
[0.7.2]: https://github.com/cativo23/lumira/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/cativo23/lumira/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/cativo23/lumira/compare/v0.6.2...v0.7.0
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
