# lumira

Real-time statusline plugin for [Claude Code](https://code.claude.com) and Qwen Code.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-2d3748?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4IiB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCI+PHBhdGggZD0iTTY0IDEyOEMzNS44IDEyOCAxMyAxMDUuMiAxMyA3N0MxMyA0OC44IDM1LjggMjYgNjQgMjZjMjguMiAwIDUxIDIyLjggNTEgNTFzLTIyLjggNTEtNTEgNTF6IiBmaWxsPSIjMjQyNTJGIi8+PC9zdmc+)
![Qwen Code](https://img.shields.io/badge/Qwen_Code-compatible-6156FF)
![Tests](https://github.com/cativo23/lumira/actions/workflows/ci.yml/badge.svg)
![Dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen)

## Features

- **3-line custom mode** + **1-line minimal mode** (auto-switches at <70 columns)
- **Powerline mode** — opt-in colored segments with 7 separator presets (`arrow`, `flame`, `slant`, `round`, `diamond`, `compatible`, `plain`) across all 3 lines
- **OSC 8 hyperlinks** — clickable directory (file://) and version (npm) on supported terminals (iTerm2, WezTerm, Kitty, VS Code, Alacritty)
- **7 built-in themes** — `dracula`, `nord`, `tokyo-night`, `catppuccin`, `monokai`, `gruvbox`, `solarized` with hand-curated powerline palettes
- **Context bar** with color thresholds (green → yellow → orange → blinking red) and actionable `/compact?` hint at high fill
- **Git status** with branch, staged/modified/untracked counts (5s TTL cache); branch turns red on dirty repos in powerline mode
- **Token metrics** — input/output counts, speed (tok/s), cost + burn rate ($/h)
- **Rate limits** — 5h/7d usage with color warnings and reset countdown
- **Transcript parsing** — active tools, agents, and todo progress
- **GSD integration** — current task and update notifications
- **Config health widget** (opt-in) — surfaces silent fallbacks (theme/powerline in named-ANSI, missing GSD STATE.md)
- **Memory usage** display
- **Nerd Font icons** throughout
- **3-tier color system** — named ANSI, 256-color, truecolor (auto-detected)
- **Config-driven** — toggle any feature via JSON config + CLI flags
- **Zero runtime dependencies**
- **Dual-platform support** — works with both Claude Code and Qwen Code statusline payloads

## Install

Quick setup with interactive wizard (arrow-key navigation + live preview):

```bash
npx lumira install
```

The installer walks you through three choices — **preset** (`full` / `balanced` / `minimal`), **theme**, and **icons** — showing a live preview of how your statusline will render at each step. Press `Esc` at any time to abort without writing anything. In non-interactive shells (piped stdin, CI), the installer skips the wizard and writes sensible defaults (`preset: balanced`, `icons: nerd`). If Qwen Code is detected (`~/.qwen/` exists), the `/lumira` skill is installed for both CLIs.

Or install globally:

```bash
npm install -g lumira
lumira install
```

To uninstall:

```bash
npx lumira uninstall
```

Your preferences are saved to `~/.config/lumira/config.json` — hand-edited keys (e.g. custom `display` toggles) are preserved on re-install.

### Manual setup

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx lumira@latest",
    "padding": 0
  }
}
```

If installed from source:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/claude-cc/dist/index.js",
    "padding": 0
  }
}
```

## Display

### Custom Mode (default, >=70 columns)

```
 Opus 4.6 (1M context) │  main ⇡1 !2 │  my-project     +150 -30 │ default │ v2.1.92
[████████░░░░░░░░░░░░] 21% │  131k↑ 25k↓ │ $1.31 $2.24/h │  35m06s │ 142 tok/s │  72%(5h)
✓ Read ×3 | ✓ Edit ×2 | ✓ Bash ×5 │ ████████░░ 8/10 | ◐ 1 | ○ 1
```

### Minimal Mode (<70 columns or `--minimal`)

```
my-project |  main | Opus 4.6 | ████░░░░░░░░░░░░░░░░ 21% | 131k↑ 25k↓ | $1.31
```

### Powerline Mode (opt-in via `style: "powerline"`)

```
  Opus 4.6   main    my-project   Fix the bug   v2.1.92
 ████░░░░░░░░░░░░░░░░ 21%   131k↑ 25k↓   $1.31    35m06s
 ✓ Read ×3   ✓ Edit ×2    ████████░░ 8/10
```

Each segment renders with a distinct background colour drawn from the active theme; segments are separated by a Nerd Font glyph (default ``). On dirty git repos the branch segment turns red. Falls back to classic mode silently in named-ANSI terminals (powerline needs RGB backgrounds). See [Powerline](#powerline) below for the 7 separator styles.

## Configuration

Create `~/.config/lumira/config.json`:

```json
{
  "preset": "balanced",
  "theme": "tokyo-night",
  "icons": "nerd",
  "style": "classic",
  "powerline": { "style": "auto" },
  "gsd": false,
  "colors": { "mode": "auto" },
  "display": {
    "model": true,
    "branch": true,
    "gitChanges": true,
    "directory": true,
    "contextBar": true,
    "contextTokens": true,
    "tokens": true,
    "cacheMetrics": true,
    "cost": true,
    "burnRate": true,
    "duration": true,
    "tokenSpeed": true,
    "rateLimits": true,
    "tools": true,
    "todos": true,
    "mcp": true,
    "vim": true,
    "effort": true,
    "worktree": true,
    "agent": true,
    "sessionName": true,
    "style": true,
    "version": true,
    "linesChanged": true,
    "memory": true,
    "health": false
  }
}
```

All fields are optional — defaults are shown above. `display.health` defaults to `false` (opt-in widget).

### CLI Flags

```bash
lumira --minimal                    # Force single-line mode
lumira --balanced                   # Force balanced preset
lumira --full                       # Force full multi-line preset
lumira --gsd                        # Enable GSD integration
lumira --powerline                  # Enable powerline visual style
lumira --classic                    # Force classic (pipe-separated) line 1
lumira --powerline-style=arrow      # Pick separator: arrow|flame|slant|round|diamond|compatible|plain|auto
lumira --icons=nerd|emoji|none      # Override icon set
lumira --preset=full|balanced|minimal
```

## Powerline

`style: "powerline"` (or `--powerline`) renders the statusline with colored segment backgrounds and glyph separators inspired by powerline-go / oh-my-posh. Available separator presets via `powerline.style` (or `--powerline-style=<name>`):

| Style | Look |
|---|---|
| `arrow` | classic right-pointing triangle separator (default) |
| `flame` | wavy flame-shaped separator |
| `slant` | forward-slanting separator |
| `round` | rounded caps at line ends + thin internal separators |
| `diamond` | each segment isolated as its own pill with rounded caps |
| `compatible` | unicode `▶` separator (no Nerd Font required) |
| `plain` | no separator glyphs — just colored blocks |
| `auto` | picks `arrow` if Nerd Font icons are configured, else `compatible` |

### Themes

Pick one of the 7 built-in themes via `theme: "<name>"` in config or during `lumira install`:

`dracula` · `nord` · `tokyo-night` · `catppuccin` · `monokai` · `gruvbox` · `solarized`

Each theme ships with a hand-curated **powerline palette** (per-segment background colors) that meets WCAG AA contrast for white foreground. Themes apply in truecolor and 256-color terminals; named-ANSI terminals fall back to default colors (8 base hues can't represent arbitrary palettes).

### Hyperlinks (OSC 8)

The directory on line 1 becomes a clickable `file://` link, and the version tag links to its npm release page on terminals that support [OSC 8](https://gist.github.com/egmontkob/eb114294efbcd5adb1944c9f3cb5feda) (iTerm2, WezTerm, Kitty, Alacritty, VS Code terminal, tmux ≥3.4 with passthrough). Other terminals show plain text. Auto-disabled in `Apple_Terminal` (which leaks markers) and `TERM=dumb`.

```bash
NO_HYPERLINKS=1 claude    # disable
FORCE_HYPERLINK=1 claude  # force-enable (overrides denylist)
```

### Qwen Code

Lumira auto-detects the platform. In Qwen Code sessions, the renderer automatically switches to single-line output regardless of your configured layout — Qwen only displays the first statusline row, so lumira fits everything (model, branch, context bar, cost, cached tokens, thoughts) into one line. **No configuration needed:** the same `config.json` serves both Claude Code and Qwen Code.

## Architecture

```text
stdin (JSON from Claude Code or Qwen Code)
  → normalize() — unifies both platform payloads
  → parsers (git, transcript, token-speed, memory, gsd)
  → RenderContext
  → render (line1-4 or minimal)
  → stdout
```

- **Dependency injection** for testability
- **File caching** — TTL-based (git, speed) and mtime-based (transcript)
- **Progressive truncation** — adapts to terminal width

## Development

```bash
npm run dev          # Watch mode (tsc --watch)
npm test             # Run tests
npm run test:watch   # Watch mode
npm run test:coverage # With coverage
npm run lint         # Type check
npm run build        # Compile to dist/
```

### Debugging

Set `LUMIRA_DEBUG=1` to trace parser decisions on stderr — cache hits, GSD state-file resolution, MCP server loads. Useful when investigating "why doesn't X show up?" reports. Stdout stays clean so it doesn't corrupt the statusline.

```bash
LUMIRA_DEBUG=1 claude    # or export LUMIRA_DEBUG=1
```

## Credits

Inspired by [claude-hud](https://github.com/jarrodwatts/claude-hud). Migrated from [claude-setup](https://github.com/cativo23/claude-setup) statusline.

## License

MIT
