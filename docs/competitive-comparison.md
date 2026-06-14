# Claude Code Statusline / Session-Monitoring Tools — Competitive Comparison

*Last updated: 2026-06-14.*

A comparison of **features, architecture, and design** across Claude Code statusline tools. Feature claims verified against each tool's current GitHub README/manifest **as of 2026-06-14**. Release dates verified via `gh api`. Cells that could not be confirmed are marked `?`.

## Table of contents
- [Category split (read this first)](#category-split-read-this-first)
- [1. README-ready condensed table (statuslines)](#1-readme-ready-condensed-table--statuslines-bucket-a)
- [2. Deep appendix](#2-deep-appendix)
  - [2A. Distribution, runtime, platforms](#2a-distribution-runtime-platforms)
  - [2B. Config UX & rendering](#2b-config-ux--rendering)
  - [2C. Widget matrix](#2c-widget-matrix)
  - [2D. Maturity & security](#2d-maturity--security-verified-2026-06-14)
- [3. Per-tool positioning vs lumira](#3-per-tool-positioning-vs-lumira)
- [4. lumira's defensible niche](#4-lumiras-defensible-niche)
- [5. Where lumira must improve (honest)](#5-where-lumira-must-improve-honest)
- [6. Sources](#6-sources)
- [Glossary](#glossary)

---

## Category split (read this first)

The space is not one category. Comparing lumira against ccusage on "themes" is unfair to both. Three buckets:

- **A. True statuslines** — render a live line inside Claude Code's status bar: **lumira, ccstatusline, claude-hud, CCometixLine, claude-pace, starship-claude, cship**
- **B. Analytics-first** (CLI/dashboard; some emit a statusline as a side feature): **ccusage, agentsview, better-ccusage**
- **C. Proxy/inspector** (not a statusline at all): **ccxray**

lumira competes head-to-head only with bucket A. Buckets B/C are included for completeness and because lumira's `lumira stats` CLI overlaps bucket B's territory.

---

## 1. README-ready condensed table — statuslines (bucket A)

| Tool | Runtime / deps | Distribution | Platforms | Config UX | Powerline + themes | Session-intel widgets¹ |
|---|---|---|---|---|---|---|
| **lumira** | TS / **0 runtime deps** | npm + npx + plugin (+ Qwen skill) | **Claude Code + Qwen Code** | Install wizard + JSON + CLI flags | Yes (7 sep styles) + 7 themes, **WCAG-AA guard** | **Quota projection, pace delta, API-latency, auto-compact glyph + counter, cache, agents, MCP, todos, tools** + `stats` CLI |
| **ccstatusline** | TS / bundled (0 declared) | npm + npx | Claude Code only | **Ink TUI** (live preview) | Yes + themes | Context, cost, usage %, block timer, compaction count, git; **no quota projection / pace / latency** |
| **claude-hud** | JS / Node 18+ | **Plugin marketplace** | Claude Code only (v1.0.80+) | Guided `/configure` + JSON | No / no themes (256-color, custom bar chars) | Context, 5h/7d usage, cost, git, tools, agents, todos, cache TTL; no quota ETA / pace / latency |
| **CCometixLine** | **Rust binary** | npm (`@cometix/ccline`) + binary + build-from-source | Claude Code only | TUI (`--config`, TOML) | Yes + themes (gruvbox/nord/…) | Model, dir, git, context %, usage, cost, time, output-style |
| **claude-pace** | **Bash + jq** / single file | curl + plugin + npx | Claude Code 2.1.80+ | JSON settings block | No / no | **5h+7d %, pace delta, reset countdown**, git diff; ~10ms / ~2MB (fastest, lightest) |
| **cship** | Rust binary | binary / install script / cargo | Claude Code | **TOML** (Starship-style) | Yes (Starship passthrough) + themes | Cost, context bar, usage limits, model, effort, agent name, session, peak-time |
| **starship-claude** | Shell / **needs Starship** | Plugin + manual | Claude Code (no tmux) | Setup wizard + TOML | Via Starship + palettes | Context bar, model, session; relies on Starship modules |

¹ "Session-intel widgets" = forward-looking/diagnostic signals beyond static model+dir+context. **Bold** = the dimension where the tool leads.

**Honest headline:** lumira leads on *breadth of session-intelligence widgets* (sole owner of an API-latency widget, a 7-day quota *projection ETA*, an MCP-server count, and a bundled `stats` analytics CLI), *zero runtime deps*, *dual-platform (Qwen)*, and *accessibility (WCAG-AA contrast CI)*. Its one notable feature gap: **no Ink-style interactive widget TUI** — config is a wizard + JSON, not a live drag-and-drop builder.

---

## 2. Deep appendix

### 2A. Distribution, runtime, platforms

| Tool | Language | Runtime deps | Install methods | Distribution channel | Platforms | License |
|---|---|---|---|---|---|---|
| lumira | TypeScript | **0** (verified: `dependencies: null`) | npx, npm -g, plugin marketplace | npm + npx + plugin + Qwen skill | **Claude Code + Qwen Code** | MIT |
| ccstatusline | TypeScript | 0 declared (bundled Ink/React) | npx, bunx, npm/bun -g | npm + npx + plugin | Claude Code | MIT |
| claude-hud | JavaScript | Node 18+ / Bun | plugin marketplace | **Plugin only** | Claude Code v1.0.80+ | MIT |
| CCometixLine | Rust | none (binary) | npm, prebuilt binary, build-from-source | npm + binary + build-from-source | Claude Code (Nerd Font req) | MIT² |
| claude-pace | Bash + jq | jq | curl, plugin, npx | curl + plugin + npx | Claude Code 2.1.80+ | MIT |
| cship | Rust | none (binary) | install script / binary | binary | Claude Code | Apache-2.0 |
| starship-claude | Shell | **Starship** (external) | plugin, manual | plugin + manual | Claude Code (no tmux) | MIT |
| ccusage | TS/Rust | bundled | npx, npm -g | npm + npx | Claude Code, Codex, multi | NOASSERTION (custom) |
| agentsview | Go + Svelte | bundled binary | install script, brew, docker, binary | binary + brew + docker | **25+ agents** (CC, Codex, Cursor, Gemini…) | MIT |
| better-ccusage | TypeScript | bundled | npx, npm | npm | CC + multi-provider | MIT² |
| ccxray | JS / Node 18+ | Node 18+ | npx, docker | npm + docker | Claude Code (proxy) | MIT |

² CCometixLine GitHub `license` field returned `null` though README states MIT — treat as **unverified license metadata**. better-ccusage license per repo search = MIT.

### 2B. Config UX & rendering

| Tool | Config UX | Powerline | Themes | Multi-line | Accessibility guarantee | Hyperlinks (OSC 8) |
|---|---|---|---|---|---|---|
| lumira | Wizard + JSON + CLI flags | Yes (7 styles + auto) | 7 + **WCAG-AA CI guard** | up to 4 lines, auto-collapse <70 cols | **Yes (contrast-tested in CI)** | Yes (dir + version) |
| ccstatusline | **Ink TUI, live preview** | Yes (arrows/caps/fonts) | multiple, copyable | **unlimited lines** | none stated | ? |
| claude-hud | Guided flow + JSON | No | No (256-color, custom chars) | expanded/compact | none | ? |
| CCometixLine | TUI + TOML | Yes | cometix/minimal/gruvbox/nord/powerline-dark | ? | none | ? |
| claude-pace | JSON block | No | No | single line | none | ? |
| cship | TOML (Starship-style) | Yes (passthrough) | themeable | ? | none | ? |
| starship-claude | Wizard + TOML | via Starship | palettes | via Starship | none | ? |

### 2C. Widget matrix

✓ = confirmed, ✗ = confirmed absent, ? = unverified

| Widget | lumira | ccstatusline | claude-hud | CComet. | claude-pace | starship-c | cship |
|---|---|---|---|---|---|---|---|
| Context bar / % | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| Auto-compact warning | ✓ (glyph ⚠) | ✗ | ✓ (85%+ breakdown) | ✗ | ✗ | ✗ | ? |
| **Compaction counter** | ✓ (⊙N) | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Cost | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ |
| Tokens / speed | ✓ | ✓ | ✓ | ✓ | ✗ | ? | ✓ |
| Cache metrics | ✓ (hide-when-healthy) | ✗ | ✓ (TTL countdown) | ✗ | ✗ | ✗ | ✗ |
| Git status | ✓ | ✓ (PR/MR, worktree) | ✓ (ahead/behind) | ✓ | ✓ (diff) | ✓ | ? |
| **Quota/rate-limit projection (ETA)** | ✓ (7d ⚠~Tue/🔥~8h) | ✗ (usage % only) | ✗ (usage % only) | ✗ | ✗ (% + countdown) | ✗ | ✓ (limits, not ETA) |
| **Burn-rate / pace** | ✓ ($/h + 🐢/🏎️ pace) | ✗ | ✗ | ✗ | ✓ (pace delta) | ✗ | ✗ |
| **API-latency widget** | ✓ (`API N%`) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Todos | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Active tools | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Running agents | ✓ (⚡N) | ✗ | ✓ (names+elapsed) | ✗ | ✗ | ✗ | ✗ |
| MCP count | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Memory / RSS | ✓ | ✓ | ✓ (optional) | ✗ | ✗ | ✗ | ✗ |
| **Analytics CLI** | ✓ (`lumira stats`) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Custom user commands** | ✓ (hardened, argv-only) | ✓ (custom cmd widget) | ✗ | ✗ | ✗ | ✗ | ? |
| Worktree / added-dirs | ✓ (both + breadcrumb) | ✓ (worktree) | ✗ | ✗ | ✗ | ✗ | ✗ |

**lumira holds four exclusives across the entire field: API-latency widget, 7-day quota *projection ETA*, MCP count, and a bundled analytics CLI.** The only widgets a competitor has that lumira lacks: ccstatusline's voice-input state and per-model weekly usage; claude-hud's agent-task elapsed-time labels.

### 2D. Maturity & security (verified 2026-06-14)

*Release dates re-verified 2026-06-14 for bucket-A statuslines; analytics/proxy rows are as of 2026-06-02.*

| Tool | Latest release | First commit | Telemetry | Maturity |
|---|---|---|---|---|
| lumira | v1.9.1 (2026-06-14) | 2026-04-08 | None | New, fast-moving (v1.9.x in ~9 wks) |
| ccstatusline | v2.2.20 (2026-06-14) | 2025-08-08 | None stated | Mature, market leader |
| claude-hud | v0.1.1 (2026-06-09) | 2026-01-02 | None | Pre-1.0, plugin-distributed |
| CCometixLine | v1.1.2 (2026-03-14) | 2025-08-11 | None | Stable; no release since Mar |
| claude-pace | v0.9.1 (2026-05-25) | 2026-03-18 | None | Young, active |
| cship | v1.7.1 (2026-05-12) | 2026-03-09 | None | Young, active (14 releases since Mar) |
| starship-claude | **no GitHub releases** | 2026-01-04 | None | Niche; **in official CC docs** |
| ccusage *(analytics)* | v20.0.6 (2026-05-29) | 2025-05-29 | None | Very mature category leader |
| agentsview *(analytics)* | v0.31.1 (2026-05-28) | 2026-02-19 | **None (local-first)** | Active, broad |
| better-ccusage *(analytics)* | ? | ? | ? | Young fork |
| ccxray *(proxy)* | v1.9.2 (2026-05-09) | 2026-04-03 | local JSON capture | Young |

**Security note (favors lumira):** lumira's custom-commands feature is opt-in and argv-only (no shell expansion/pipes/redirects), with output caching off the hot path — a deliberately hardened design. ccstatusline also has a custom-command widget but its sandboxing was not verified. No tool in the set ships telemetry.

---

## 3. Per-tool positioning vs lumira

- **ccstatusline** — The aesthetics/customization leader. Its Ink TUI live-preview config is genuinely better UX than lumira's wizard+JSON, and it supports unlimited statuslines. **Beats lumira on**: interactive config. **Loses to lumira on**: zero forward-looking intelligence (no quota ETA, no pace, no latency, no agents/todos/MCP), Claude-only.

- **claude-hud** — Closest functional overlap with lumira: context, usage, cost, git, tools, agents, todos. **Beats lumira on**: agent task-elapsed labels, plugin-native install. **Loses on**: no powerline/themes, no quota projection ETA, no pace, no latency, no analytics CLI, Claude-only, pre-1.0 churn.

- **CCometixLine** — The performance/minimalist Rust option (~5ms). **Beats lumira on**: raw speed and a compiled single binary. **Loses on**: narrower widget set (model/dir/git/context/usage/cost/time/output-style — no quota ETA/pace/latency/agents/todos), no dual-platform, no release since March.

- **claude-pace** — lumira's most direct *concept* rival on pace/quota. Pure Bash+jq, ~10ms/~2MB — far lighter. It *originated the pace-delta comparison table* this report extends. **Beats lumira on**: footprint, speed, simplicity, no Node needed. **Loses on**: no context bar, no themes/powerline, no cost/tokens, no agents/todos, no forward ETA projection (only % + countdown).

- **starship-claude / cship** — Starship-ecosystem bridges for users already invested in Starship/TOML. starship-claude is notable for being **cited in official Claude Code docs**. **Beat lumira on**: TOML familiarity, Starship module reuse. **Lose on**: external Starship dependency (starship-claude), narrower session-intelligence set.

- **ccusage / agentsview / better-ccusage** *(analytics, adjacent)* — Tools for *post-hoc* cost/token analysis (agentsview spans 25+ agents). agentsview and ccusage can *emit* a statusline but it's secondary. **Beat lumira on**: analytics depth, multi-agent coverage, search/dashboards. lumira's `lumira stats` is a lightweight overlap, not a competitor here.

- **ccxray** *(proxy, adjacent)* — Different category entirely: a transparent HTTP proxy + dashboard that records every API call. Not a statusline; complementary, not competitive.

---

## 4. lumira's defensible niche

- **Session-intelligence depth no statusline matches** — sole owner of API-latency widget, 7-day quota *projection ETA*, MCP count, and a bundled `stats` analytics CLI, on top of the full pace/agents/todos/cache set.
- **Zero runtime dependencies + dual-platform** — only tool serving **both Claude Code and Qwen Code** from one config, with `dependencies: null` verified in the published manifest.
- **Accessibility as a hard gate** — the only tool enforcing WCAG-AA contrast in CI on every theme/powerline PR; a credible differentiator no competitor advertises.
- **Hardened opt-in extensibility** — argv-only custom commands with TTL caching off the render path; a security posture that out-engineers the one comparable feature (ccstatusline's custom widget).

## 5. Where lumira must improve (honest)

- **No interactive widget TUI** — ccstatusline's Ink live-preview builder is a materially better config experience; lumira's wizard+JSON feels dated by comparison for non-technical tweakers.
- **Newest to the plugin marketplace** — lumira shipped plugin-marketplace install in v1.9.0 (`/plugin marketplace add cativo23/lumira` → `/lumira:setup`), matching the install path claude-hud, claude-pace, and starship-claude already had. It's the most recent arrival to that channel, so the install flow has had less real-world soak time than the incumbents'.

---

## 6. Sources

GitHub repos: [cativo23/lumira](https://github.com/cativo23/lumira) · [sirmalloc/ccstatusline](https://github.com/sirmalloc/ccstatusline) · [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud) · [Haleclipse/CCometixLine](https://github.com/Haleclipse/CCometixLine) · [Astro-Han/claude-pace](https://github.com/Astro-Han/claude-pace) · [martinemde/starship-claude](https://github.com/martinemde/starship-claude) · [stephenleo/cship](https://github.com/stephenleo/cship) · [ryoppippi/ccusage](https://github.com/ryoppippi/ccusage) · [kenn-io/agentsview](https://github.com/kenn-io/agentsview) · [cobra91/better-ccusage](https://github.com/cobra91/better-ccusage) · [lis186/ccxray](https://github.com/lis186/ccxray)

npm: [lumira](https://www.npmjs.com/package/lumira) · [ccstatusline](https://www.npmjs.com/package/ccstatusline) · [@cometix/ccline](https://www.npmjs.com/package/@cometix/ccline) · [ccusage](https://www.npmjs.com/package/ccusage)

Docs/other: [Claude Code statusline docs](https://code.claude.com/docs/en/statusline) (cites ccstatusline + starship-claude) · release dates via `gh api`.

### Cells that could not be verified (marked `?` in tables)
- OSC 8 hyperlink support for every tool except lumira (not stated in READMEs).
- better-ccusage latest-release date (no `releases/latest`; repo metadata only).
- CCometixLine **license metadata** — GitHub API returned `null`; README claims MIT (unverified mismatch).
- ccstatusline custom-command **sandboxing** posture (feature exists; hardening not verified).

---

## Glossary

- **Session-intelligence widget** — a signal that interprets session state forward or diagnostically (quota ETA, burn-rate pace, API-latency overhead), as opposed to a static readout (model name, cwd, plain context %).
- **Quota projection (ETA)** — estimates *when* you will hit a rate-limit window based on current burn, not just the current percentage used.
- **Pace delta** — whether your current burn rate is sustainable for the window (headroom vs overspend), e.g. lumira's 🐢/🏎️ or claude-pace's ⇣/⇡.
- **Powerline** — segmented statusline rendering with arrow/cap separators (requires a Nerd Font for glyphs).
- **WCAG-AA contrast guard** — a CI check that fails a theme/powerline PR if any cell's text-on-background contrast drops below the WCAG AA threshold.
- **Plugin marketplace** — Claude Code's native install channel (`/plugin marketplace add owner/repo` → `/plugin install`); discovery routes through the plugin's GitHub repo.
