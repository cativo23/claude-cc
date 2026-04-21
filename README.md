# lumira

Real-time statusline plugin for [Claude Code](https://code.claude.com) and Qwen Code.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-2d3748?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjggMTI4IiB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCI+PHBhdGggZD0iTTY0IDEyOEMzNS44IDEyOCAxMyAxMDUuMiAxMyA3N0MxMyA0OC44IDM1LjggMjYgNjQgMjZjMjguMiAwIDUxIDIyLjggNTEgNTFzLTIyLjggNTEtNTEgNTF6IiBmaWxsPSIjMjQyNTJGIi8+PC9zdmc+)
![Qwen Code](https://img.shields.io/badge/Qwen_Code-compatible-6156FF)
![Tests](https://github.com/cativo23/lumira/actions/workflows/ci.yml/badge.svg)
![Dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen)

## Features

- **3-line custom mode** + **1-line minimal mode** (auto-switches at <70 columns)
- **Context bar** with color thresholds (green → yellow → orange → blinking red)
- **Git status** with branch, staged/modified/untracked counts (5s TTL cache)
- **Token metrics** — input/output counts, speed (tok/s), cost + burn rate ($/h)
- **Rate limits** — 5h/7d usage with color warnings and reset countdown
- **Transcript parsing** — active tools, agents, and todo progress
- **GSD integration** — current task and update notifications
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

## Configuration

Create `~/.config/lumira/config.json`:

```json
{
  "layout": "auto",
  "gsd": false,
  "display": {
    "model": true,
    "branch": true,
    "gitChanges": true,
    "directory": true,
    "contextBar": true,
    "tokens": true,
    "cost": true,
    "burnRate": true,
    "duration": true,
    "tokenSpeed": true,
    "rateLimits": true,
    "tools": true,
    "todos": true,
    "vim": true,
    "effort": true,
    "worktree": true,
    "agent": true,
    "sessionName": true,
    "style": true,
    "version": true,
    "linesChanged": true,
    "memory": true
  },
  "colors": {
    "mode": "auto"
  }
}
```

All fields are optional — defaults are shown above.

### CLI Flags

```bash
lumira --minimal    # Force single-line mode
lumira --balanced   # Force balanced preset
lumira --full       # Force full multi-line preset
lumira --gsd        # Enable GSD integration
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

## Credits

Inspired by [claude-hud](https://github.com/jarrodwatts/claude-hud). Migrated from [claude-setup](https://github.com/cativo23/claude-setup) statusline.

## License

MIT
