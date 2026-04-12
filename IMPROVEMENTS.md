# Lumira — Roadmap & Improvement Plan

> Internal document — NOT for commit

## Competitor Overview

| Feature | lumira | cc-pulse | claude-scope | claude-bar | claude-hud | claude-view |
|---|---|---|---|---|---|---|
| **Type** | Statusline | Statusline | Statusline | Statusline | Statusline | Web dashboard |
| **Language** | TypeScript | TypeScript/Bun | TypeScript | Shell (bash) | TypeScript | Rust + React |
| **Deps** | 0 | Zod | 2 (inquirer, systeminformation) | jq | 0 | Binary |
| **Themes** | No | No | 17 | 6 | No | N/A |
| **Installer** | `npx lumira install` | No | `npx claude-scope install` | `npx claude-bar` | `/claude-hud:setup` | `curl \| sh` |
| **Uninstaller** | Yes (backup/restore) | No | No | Yes (backup/restore) | Yes | N/A |
| **Widgets** | ~15 | 6 sections | 15 | 8 | ~12 | Full dashboard |
| **Config** | JSON + CLI flags | JSON | JSON + AI skill | .conf file | JSON | Env vars |

---

## Execution Plan — 4 Phases

### Phase 1: Quick Fixes (7 tasks in parallel)

All tasks touch independent files. Can be dispatched simultaneously.

```
┌─────────────────────────────────────────────────────┐
│  Phase 1 — All 7 tasks run in PARALLEL              │
│                                                      │
│  1A  terminal.ts    Shell injection fix (Critical)   │
│  1B  cache.ts       TOCTOU symlink fix (Critical)    │
│  1C  git.ts         Staged count bug + tests         │
│  1D  line3.ts       Display toggles bug + tests      │
│  1E  line2.ts       resets_at unit fix + tests        │
│  1F  installer.ts   Backup validation + tests        │
│  1G  transcript.ts  Module-level state fix            │
└─────────────────────────────────────────────────────┘
```

**1A: Shell injection in terminal.ts** (Critical)
- File: `src/utils/terminal.ts:15`
- `/proc` symlink target interpolated into shell command
- Fix: Validate with `/^\/dev\/(pts\/\d+|tty\w*)$/` before interpolation

**1B: TOCTOU symlink attack in cache.ts** (Critical)
- File: `src/utils/cache.ts:17-19`
- Race window between `unlinkSync` and `openSync('wx')` in tmpdir
- Fix: Write to per-user subdirectory with `0o700` perms

**1C: Git staged count is wrong** (Important)
- File: `src/parsers/git.ts:27-29`
- `M` in col 0 = staged, but code excludes it
- Fix: staged = `l[0] !== ' ' && l[0] !== '?'`; modified = `l[1] === 'M' || l[1] === 'D'`
- Add tests for `M `, `MM`, `A `, `D `, `??`

**1D: renderLine3 ignores display toggles** (Important)
- Files: `src/render/line3.ts` + `src/render/index.ts`
- `display.tools` and `display.todos` never checked
- Fix: Pass `display`, filter based on toggles. Add tests.

**1E: resets_at unit ambiguity** (Important)
- File: `src/render/line2.ts:22`
- Fix: if `resets_at < 1e12`, treat as seconds × 1000
- Add `formatCountdown` tests

**1F: Uninstall backup validation** (Important)
- File: `src/installer.ts:106-111`
- Fix: `JSON.parse` backup before restoring; if corrupt, warn and skip
- Add test for malformed backup

**1G: Transcript module-level mutable state**
- File: `src/parsers/transcript.ts:9-11`
- Fix: Replace globals with `Map<string, {result, mtime}>` keyed by path

---

### Phase 2: Architecture Refactor (4 parallel → 1 sequential)

First 4 tasks run in parallel. Task 2E runs after 2A+2B complete.

```
┌─────────────────────────────────────────────────────┐
│  Phase 2 — Step 1: 4 tasks in PARALLEL              │
│                                                      │
│  2A  render/shared.ts  Extract shared utilities      │
│  2B  types.ts+config   Add theme/icons/preset types  │
│  2C  colors.ts         Fix detectColorMode           │
│  2D  index.ts          Make loadConfig injectable    │
│                                                      │
│  Phase 2 — Step 2: 1 task SEQUENTIAL (needs 2A+2B)  │
│                                                      │
│  2E  render/line*.ts   Unify renderLineN signatures  │
└─────────────────────────────────────────────────────┘
```

**2A: Extract shared render utilities**
- Create `src/render/shared.ts` with:
  - `getModelName()` (dedupe from line1 + minimal)
  - `buildContextBar(pct, segments, c, opts)` (parameterize line2 + minimal)
  - `formatGitChanges(git, c)` (unify `!` vs `~` inconsistency)
  - `SEP` / `SEP_MINIMAL` constants (dedupe from 4 files)

**2B: Add theme/icons/preset fields to HudConfig**
- Files: `src/types.ts` + `src/config.ts`
- Add: `preset?: 'full' | 'balanced' | 'minimal'`, `theme?: string`, `icons?: 'nerd' | 'emoji' | 'none'`
- Add `contextTokens` to DisplayToggles
- Rename `layout` → `preset` (keep `layout` as deprecated alias)
- Update `mergeConfig` and `mergeCliFlags`

**2C: Implement detectColorMode properly**
- File: `src/render/colors.ts:58-62`
- Check `COLORTERM=truecolor` → truecolor, `TERM=*-256color` → 256, else named

**2D: Make loadConfig injectable in main()**
- File: `src/index.ts`
- Add config parameter to `main()` or add to `Dependencies`

**2E: Unify renderLineN signatures** (after 2A + 2B)
- All renderers take `(ctx: RenderContext, c: Colors)`
- Update `render/index.ts` call sites
- Update all render tests

---

### Phase 3: v0.2.0 Features (2 parallel tracks)

Track A is sequential (coupled features). Track B has 4 independent tasks in parallel.
Both tracks run simultaneously.

```
┌─────────────────────────────────────────────────────┐
│  Phase 3 — Two PARALLEL tracks                      │
│                                                      │
│  Track A (sequential):     Track B (4x parallel):   │
│  ┌──────────────────┐     ┌───────────────────────┐ │
│  │ 3A-1 Presets      │     │ 3B Context bar       │ │
│  │      ↓            │     │ 3C MCP server health  │ │
│  │ 3A-2 Icon modes   │     │ 3D AI config skill   │ │
│  │      ↓            │     │ 3E Cache metrics      │ │
│  │ 3A-3 Named themes │     └───────────────────────┘ │
│  └──────────────────┘                                │
└─────────────────────────────────────────────────────┘
```

**Track A — Config + Render features (sequential)**

**3A-1: Presets system**
- Define preset defaults map: `full`, `balanced`, `minimal`
- `balanced` = new 2-line renderer
- Preset provides toggle defaults; explicit user toggles override
- Update render/index.ts to resolve preset → effective toggles
- Update minimal renderer with more data

**3A-2: Icon modes**
- Create `src/render/icons.ts` icon sets: `NERD_ICONS`, `EMOJI_ICONS`, `NO_ICONS`
- Select set based on `config.icons` value
- Pass icon set through render pipeline (via RenderContext or Colors)

**3A-3: Named themes**
- Create `src/themes.ts` with 5-8 presets (Dracula, Nord, Tokyo Night, Catppuccin, Monokai)
- Each theme maps to color overrides for the 3-tier system
- `config.theme` selects palette; applied in `createColors()`

**Track B — Independent features (parallel)**

**3B: Context bar improvements**
- Remove brackets from bar
- New `contextTokens` toggle: show `90k/200k` used/total
- Update line2.ts and minimal.ts (using shared `buildContextBar`)

**3C: MCP server health**
- New `src/parsers/mcp.ts` — read `.mcp.json` from cwd and `~/.claude/`
- Show server count + status on line3 or line4
- Flag broken servers in red
- Add `display.mcp` toggle

**3D: AI config skill (`/lumira`)**
- Create `SKILL.md` for `~/.claude/skills/lumira/`
- Instructions for Claude to modify `~/.config/lumira/config.json`
- Update installer to optionally install the skill
- Effort: very low (markdown only)

**3E: Cache metrics**
- Read cache_read/cache_write tokens from stdin JSON
- Calculate hit rate
- Display on line2 alongside existing token counts
- Add `display.cacheMetrics` toggle

---

### Phase 4: Test Hardening (4 tasks in parallel)

All tasks are independent test additions.

```
┌─────────────────────────────────────────────────────┐
│  Phase 4 — All 4 tasks run in PARALLEL              │
│                                                      │
│  4A  Transcript tests (effort, sessionStart, cache)  │
│  4B  Render tests (countdown, toggles, truecolor)   │
│  4C  Parser edge cases (GSD sanitize, git cache)    │
│  4D  Integration tests (6 new scenarios)            │
└─────────────────────────────────────────────────────┘
```

**4A: Transcript parser tests**
- `thinkingEffort` extraction with fixture
- `sessionStart` parsing assertion
- `TodoWrite` path (replaces vs incremental)
- Cache hit/miss behavior

**4B: Render tests**
- `formatCountdown` with real timestamps
- Display toggles in minimal mode
- `createColors('truecolor')` verification
- New preset/theme/icon rendering

**4C: Parser edge case tests**
- GSD session ID sanitization (`../evil`)
- Git cache layer (TTL hit/miss)
- Token-speed with `vi.useFakeTimers()` (fix flaky test)
- Token count decrease (session reset)

**4D: Integration & installer tests**
- GSD enabled with mock returning data
- Minimal auto-switch at cols < 70
- cwd fallback chain (cwd → workspace → process.cwd())
- Stream error handling in stdin
- Chunked JSON delivery
- Malformed backup in uninstall

---

## Execution Summary

| Phase | Tasks | Parallel | Depends on | Estimated |
|-------|-------|----------|------------|-----------|
| **1: Quick Fixes** | 7 | All 7 parallel | — | Small |
| **2: Refactor** | 5 | 4 parallel + 1 seq | Phase 1 | Medium |
| **3: Features** | 7 | 2 tracks (3 seq + 4 parallel) | Phase 2 | Large |
| **4: Tests** | 4 | All 4 parallel | Phase 3 | Medium |
| **Total** | **23 tasks** | | | |

After Phase 4: bump to v0.2.0, `npm publish`, update GitHub release.

---

## v0.3.0 — Future Scope

- Hook monitoring with broken path detection
- Docker container widget (opt-in)
- Daily/monthly cost persistence
- Compact mode toggle skill (`/lumira-compact`)
- Dev server status widget (Vite/Next/Nuxt)

---

## What Lumira Already Does Better

- **Zero dependencies** — cc-pulse needs Zod, claude-scope needs inquirer+systeminformation, claude-bar needs jq
- **GSD integration** — unique, no competitor has this
- **Backup/restore installer** — only claude-bar matches
- **3-tier color system** — more flexible than most
- **Rate limit display** — with countdown, most lack this
- **Worktree awareness** — unique

---

## Wild Card Ideas (not from competitors)

- **Session comparison** — delta vs last session (cost, tokens, duration)
- **Plugin marketplace hook** — share custom themes via gist URLs
- **Notification sounds** — beep/bell on context >90% or rate limit hit
- **ASCII art logo** — branded welcome on first install
- **Sparkline graphs** — mini token/cost graphs using Unicode block chars
