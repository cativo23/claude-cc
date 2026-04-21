# Install Wizard Design

Date: 2026-04-20
Status: Approved for implementation
Scope: `npx lumira install` becomes interactive — preset, theme, and icons selection with live preview. Writes `~/.config/lumira/config.json`. Skill installs for both Claude Code and Qwen Code when detected. Removes the `qwen` preset and auto-switches to singleline rendering when Qwen is the caller.

## Summary

Today, `lumira install` silently writes a `statusLine` entry to `~/.claude/settings.json` and copies a skill file. Users must discover presets, themes, and icon modes from the README and hand-edit `~/.config/lumira/config.json`. This spec introduces a zero-dependency interactive TUI that runs during install, guiding the user through three selections with a live rendered preview. A latent dual-platform rendering gap (Qwen Code truncates multi-line output) is fixed at the render layer as part of the same feature.

## Goals

- First-run `lumira install` guides the user through preset / theme / icons selection.
- Re-running `lumira install` re-opens the wizard with current values pre-selected.
- Live preview shows a realistic rendered statusline that updates as the user navigates.
- Qwen Code users get a correct compact statusline automatically, regardless of configured preset.
- Install writes the `/lumira` skill to both `~/.claude/skills/lumira/` and `~/.qwen/skills/lumira/` when Qwen Code is detected.
- Zero new runtime dependencies.

## Non-goals

- Per-CLI configuration sections inside `config.json` (both CLIs share one config).
- Configuring Qwen Code's statusline entry (`~/.qwen/settings.json`) from this installer.
- Internationalization — wizard strings are English-only.
- Windows native terminal polish beyond best-effort.

## Architecture

### New files

- `src/tui/select.ts` — generic `interactiveSelect<T>()` helper. Owns raw-mode setup, keypress handling, render loop, cleanup, and resize handling. ~200 LOC. Knows nothing about lumira.
- `src/tui/preview.ts` — builds a mock `RenderContext` with realistic sample data and calls `render()` to produce a string preview. Used by the wizard to paint the preview pane.
- `src/installer-wizard.ts` — orchestrates the three-step flow (preset → theme → icons). Calls `interactiveSelect` three times, passing a `preview(choice)` function per step. Returns `WizardResult | null`, where `WizardResult = { preset: string; theme?: string; icons: string }` — `theme` is omitted entirely when user picks `(none)`.
- `src/tui/banner.ts` — exports the ASCII banner string and a `printBanner()` helper that reads version from `package.json` and omits the banner on terminals under 50 columns.
- `tests/tui/select.test.ts` — TUI helper tests with a mock stdin that supports synthetic `keypress` events.
- `tests/tui/preview.test.ts` — preview generator tests.
- `tests/installer-wizard.test.ts` — end-to-end wizard orchestration tests.

### Modified files

- `src/installer.ts`
  - `install()` runs the wizard BEFORE writing anything. On abort, exits cleanly with no file writes.
  - `installSkill()` gains a second destination: if `~/.qwen/` exists, copy `SKILL.md` to `~/.qwen/skills/lumira/` as well.
  - `uninstall()` removes skill from both `~/.claude/skills/lumira/` and `~/.qwen/skills/lumira/` when present.
  - Prints the ASCII banner before the wizard and before uninstall output.
- `src/config.ts`
  - Remove `qwen` from `validPresets` and from `PRESET_DEFS`.
  - Remove `--qwen` and `qwen` from CLI-flag matchers.
  - Add a one-shot migration: if `raw.preset === "qwen"` is seen, log once to stderr (`[lumira] 'qwen' preset is removed — using 'minimal' instead`) and coerce to `minimal`.
  - Export new `saveConfig(config, path)` that merges with existing file and writes atomically (temp file + rename).
- `src/render/index.ts`
  - Change the layout branch condition so that Qwen input ALSO triggers `renderMinimal`, regardless of `ctx.config.layout`:
    ```ts
    const isQwen = ctx.input.platform === 'qwen-code';
    if (isQwen || ctx.config.layout === 'singleline' || (ctx.config.layout === 'auto' && ctx.cols < 70)) {
      return renderMinimal(ctx, c);
    }
    ```
- `src/types.ts`
  - Remove `'qwen'` from the `HudConfig['preset']` union.
- `skills/lumira/SKILL.md`
  - Add a "Platform Support" section noting that lumira auto-detects Qwen Code and renders compact single-line output in those sessions.
- `tests/render/index.test.ts`, `tests/config.test.ts`
  - Update tests referencing `qwen` preset. Add new tests per Test Strategy below.

### Module boundaries

- `src/tui/*` has no lumira-specific knowledge — it's a reusable TUI primitive.
- `installer-wizard.ts` orchestrates wizard logic only — does not touch disk.
- `installer.ts` owns all file writes. Calls wizard, receives a pure value, writes atomically.

## UX flow

### Entry

```
 \x1b[36m
 ██╗     ██╗   ██╗███╗   ███╗██╗██████╗  █████╗ 
 ██║     ██║   ██║████╗ ████║██║██╔══██╗██╔══██╗
 ██║     ██║   ██║██╔████╔██║██║██████╔╝███████║
 ██║     ██║   ██║██║╚██╔╝██║██║██╔══██╗██╔══██║
 ███████╗╚██████╔╝██║ ╚═╝ ██║██║██║  ██║██║  ██║
 ╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
 \x1b[0m
 real-time statusline for claude code & qwen code · v{version}
```

Version read dynamically from `package.json` using `fileURLToPath(import.meta.url)` path resolution. Fallback: omit ` · v{version}` if read fails.

### Step 1 of 3 — preset

```
 lumira setup · step 1/3 — preset

 Pick a preset. Arrow keys to move, Enter to select, Esc to abort.

 ❯ full      ▸ everything on, 4 lines
   balanced  ▸ essentials, auto-compact
   minimal   ▸ single line, just the basics

 Preview:
 ╭────────────────────────────────────────────────────╮
 │ <real rendered statusline with focused option>     │
 ╰────────────────────────────────────────────────────╯
```

- `❯` marks focused option. Preview reflects the focused option live (updates on every keypress).
- Initial focus: current `config.json` preset, or `balanced` if absent or invalid.

### Step 2 of 3 — theme

```
 lumira setup · step 2/3 — theme

   [ Back ]
 ❯ (none)
   dracula    <inline color preview>
   nord       <inline color preview>
   tokyo-night <inline color preview>
   catppuccin <inline color preview>
   monokai    <inline color preview>

 ⚠ your terminal doesn't support truecolor — themes will have no effect
   (shown only when detectColorMode() !== 'truecolor')

 Preview:
 ╭────────────────────────────────────────────────────╮
 │ <preset from step 1 + focused theme applied>       │
 ╰────────────────────────────────────────────────────╯
```

- `[ Back ]` at top returns to step 1 with prior selection pre-focused.
- Initial focus: current `config.json` theme, or `(none)` if absent.

### Step 3 of 3 — icons

```
 lumira setup · step 3/3 — icons

   [ Back ]
 ❯ nerd   ▸ Nerd Font icons (default)
   emoji  ▸ Unicode emoji icons
   none   ▸ no icons, ASCII fallbacks

 Preview:
 ╭────────────────────────────────────────────────────╮
 │ <preset + theme + focused icon set>                │
 ╰────────────────────────────────────────────────────╯
```

- Initial focus: current `config.json` icons, or `nerd`.

### Final summary

```
 ✓ Configured lumira as statusline
 ✓ Saved config → ~/.config/lumira/config.json
 ✓ Installed /lumira skill → ~/.claude/skills/lumira/
 ✓ Installed /lumira skill → ~/.qwen/skills/lumira/     (only if ~/.qwen/ exists)

 ℹ Qwen Code detected — in Qwen sessions, lumira renders single-line
   automatically. Your preset above applies to Claude Code.
   (shown only when `which qwen` succeeds)

 Restart Claude Code to see your statusline.
```

### Controls (all steps)

- `↑` / `↓` or `k` / `j` — navigate options (wrap on ends).
- `Enter` — confirm focused option and advance. On `[ Back ]`, return to previous step.
- `Esc` or `q` — abort wizard. No writes occur. Prints `⚠ Setup cancelled — no changes made.`, exit 1.
- `Ctrl+C` — same as Esc, exit 130.

### Pre-selection rules

- Preset: read from existing `config.json`. If missing or invalid, default to `balanced`.
- Theme: read from existing `config.json`. If missing, focus `(none)`.
- Icons: read from existing `config.json`. If missing, focus `nerd`.

## Data model

### File: `~/.config/lumira/config.json`

Schema written by the wizard:

```json
{
  "preset": "balanced",
  "theme": "dracula",
  "icons": "nerd"
}
```

Only these three keys are written. `display`, `colors`, `gsd`, `layout`, and any other keys the user has added by hand are preserved verbatim on merge.

### Merge strategy

1. Read existing `config.json`. On parse failure, warn and proceed with empty object.
2. Deep-merge is NOT used. Only the three top-level keys `preset`, `theme`, `icons` are overwritten. Other keys pass through untouched.
3. Write to temp file `config.json.tmp` with mode `0o600`, then `rename` to `config.json`. POSIX atomic.

### Write order

1. Wizard returns `{preset, theme, icons}` (or aborts and returns nothing).
2. Write `~/.claude/settings.json` with the `statusLine` entry (existing behavior).
3. Write `~/.config/lumira/config.json` with atomic merge.
4. Install skill to `~/.claude/skills/lumira/SKILL.md`.
5. If `~/.qwen/` exists, install skill to `~/.qwen/skills/lumira/SKILL.md`.
6. Print summary with optional Qwen info note.

If step 2 fails, abort. Steps 3-5 do not run. If step 3 fails after step 2 succeeded, user has a working lumira with default config — acceptable.

## Signal handling and cleanup

### State restored on any exit path

- `process.stdin.setRawMode(false)`
- `process.stdin.pause()`
- `process.stdin.removeListener('keypress', ...)`
- `process.removeListener('SIGINT', ...)` / `SIGTERM`
- `process.stdout.write('\x1b[?25h')` — show cursor
- `process.stdout.removeListener('resize', ...)` (if installed)

### Helper pattern

```ts
async function interactiveSelect<T>(opts: SelectOpts<T>): Promise<T | null> {
  if (!process.stdin.isTTY) return null;

  const cleanup = () => { /* restore all state */ };

  try {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write('\x1b[?25l'); // hide cursor
    // install listeners (keypress, SIGINT, SIGTERM, resize)
    return await new Promise<T | null>((resolve) => {
      // resolve on Enter (value), Esc / Ctrl+C / SIGINT / SIGTERM (null)
    });
  } finally {
    cleanup();
  }
}
```

### Defensive `process.on('exit')` handler

A once-only handler that unconditionally calls `setRawMode(false)` and writes the show-cursor ANSI. Guards against `uncaughtException` and `process.exit()` from elsewhere. Does NOT touch listeners (exit is terminal).

### Abort semantics

- Any `null` return from `interactiveSelect` bubbles up through the wizard as a user cancel.
- On cancel, installer writes nothing, prints the cancellation message, and exits with code 1 (Esc/q) or 130 (Ctrl+C).

## Breaking changes

### `qwen` preset removed

- `validPresets` no longer includes `qwen`.
- `--qwen` CLI flag is removed from argv parsing.
- Existing configs with `preset: "qwen"` trigger a one-shot stderr warning on the first render:
  `[lumira] 'qwen' preset is removed — using 'minimal' instead`
  and are coerced to `minimal` at runtime. The next `lumira install` writes `minimal` to the file.
- CHANGELOG entry under "Breaking changes" documents this with migration note: `--qwen` → `--minimal`.

### Render layer — Qwen forces singleline

- `render()` now returns `renderMinimal()` whenever `ctx.input.platform === 'qwen-code'`, overriding `config.layout`.
- This restores the intended behavior: Qwen users see the rich compact line, not a truncated multi-line line 1.
- No user-facing breaking change — only affects rendered output, and the new output is strictly more informative.

## Test strategy

### `tests/tui/select.test.ts`

- Navigate down from last option wraps to first; up from first wraps to last.
- `j`/`k` navigate identically to `↓`/`↑`.
- `Enter` resolves with the focused option.
- `Esc` resolves with `null`.
- `Ctrl+C` resolves with `null` and triggers SIGINT cleanup.
- Non-TTY stdin → immediate `null` without raw-mode setup.
- `initial` parameter pre-focuses the correct option.
- `preview(choice)` is invoked with the focused option on each keypress.
- Cleanup: after resolution, `setRawMode(false)` was called, cursor-show ANSI was written, all listeners removed.
- Resize event on stdout triggers re-render.

### `tests/tui/preview.test.ts`

- `buildPreview({ preset: 'balanced' })` returns non-empty string with model/branch/directory fields.
- Preview with theme `dracula` in truecolor mode contains Dracula RGB codes.
- Preview with `colors.mode === 'named'` contains no RGB escapes.
- Preview with `icons: 'none'` contains no Nerd Font codepoints.
- `buildPreview` wraps `render()` in try/catch; on render failure returns `(preview unavailable)`.

### `tests/installer-wizard.test.ts`

- Happy path: three Enters accept defaults, returns `{ preset: 'balanced', icons: 'nerd' }` (theme omitted since `(none)` is the initial focus).
- Down+Enter on step 1 selects `minimal`.
- `[ Back ]` from step 2 returns to step 1 with prior choice focused.
- Esc at any step resolves with `null`; no disk writes observed.

### `tests/installer.test.ts` (extend existing)

- TTY mocked + wizard happy path → `settings.json`, `config.json`, and `~/.claude/skills/lumira/SKILL.md` all written.
- `~/.qwen/` mocked as existing → skill also copied to `~/.qwen/skills/lumira/SKILL.md`.
- No TTY → wizard skipped, defaults written (`preset: "balanced"`, no theme, `icons: "nerd"`), non-interactive notice printed.
- Existing `config.json` with custom `display.tokens: false` → merge preserves `display.tokens: false` and adds the three new keys.
- Corrupt `config.json` → warn, overwrite cleanly with three keys.
- Wizard aborted → no file mutations (verified by mtime or snapshot).
- Uninstall with Qwen skill present → removes from both destinations.

### `tests/render/index.test.ts`

- `render(ctx)` with `ctx.input.platform === 'qwen-code'` and `ctx.config.layout === 'multiline'` → routes to `renderMinimal`.

### `tests/config.test.ts`

- Existing tests referencing `qwen` preset: migrate to `minimal`.
- New test: `mergeConfig({ preset: 'qwen' })` returns valid config with `preset: 'minimal'` (coerced) and no crash.

### Coverage target

- 100% line and branch coverage on new code (`src/tui/*`, `src/installer-wizard.ts`, render-Qwen branch in `src/render/index.ts`).
- Existing coverage levels maintained elsewhere.

## Edge cases

| Scenario | Behavior |
|---|---|
| No TTY (stdin piped) | Skip wizard, write defaults, print notice. Exit 0. |
| Terminal < 50 cols | Banner hidden, wizard still runs with compact layout. |
| Corrupt `config.json` | Warn, overwrite. |
| `~/.config/lumira/` missing | `mkdirSync` with recursive. |
| `~/.qwen/` missing | Skip Qwen skill; summary omits that line. |
| `~/.qwen/skills/` missing but `~/.qwen/` exists | Create `skills/lumira/` recursively. |
| EACCES on write | Clear error message, exit 1, no partial state. |
| Ctrl+C during raw mode | Cleanup, cancel message, exit 130. |
| Ctrl+C during write | Atomic `rename` guarantees `config.json` never half-written. |
| Theme picked without truecolor | Value stored; `resolveTheme()` no-ops at runtime. Warning shown in wizard. |
| `stdin` pipe closed (parent dies) | `'end'` event treated as abort. |

## Risks and mitigations

1. **Terminal left in raw mode on hard crash.** Mitigated by `try/finally` and defensive `exit` handler. Residual: Node SIGKILL (very low probability). User recovers with `reset` or new terminal.
2. **TUI tests fragile against Node internals.** Mock encapsulated in one helper (`createMockStdin()`) — single point of adaptation.
3. **Preview crashes if renderer fails on mock data.** `buildPreview` wraps `render()` in try/catch, returns fallback string.
4. **Breaking change surprises users of `--qwen`.** CHANGELOG + one-shot stderr migration message + runtime coercion to `minimal` mean zero functional regression.
5. **Qwen auto-detect surprises a user wanting multi-line in Qwen.** Hypothetical — Qwen only displays one line anyway. No real loss.
6. **`~/.qwen/skills/` may not be the Qwen convention.** Directory exists on this machine, suggesting yes, but unverified against Qwen Code docs. Before implementation, verify. If uncertain, ship Claude-only install and file a follow-up issue for Qwen skill install.

## Out-of-scope limitations

- Windows native terminal polish.
- `TERM=dumb` or non-ANSI terminals — recommendation: detect and fall back to text prompt (future).
- i18n.
- Per-CLI configuration sections.
