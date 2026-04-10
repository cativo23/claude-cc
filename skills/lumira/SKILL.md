---
name: lumira
description: Configure the lumira statusline HUD via natural language
---

# /lumira — Statusline Configuration Skill

You are configuring **lumira**, a terminal statusline/HUD for Claude Code.

## Config File

Location: `~/.config/lumira/config.json`

Read the current config before making changes. If the file doesn't exist, create it with just the fields the user wants to change.

## Available Settings

### Presets (`preset`)
- `"full"` — all widgets, multi-line layout
- `"balanced"` — essential widgets, auto layout (hides burn rate, duration, token speed, lines changed, session name, style, version, memory)
- `"minimal"` — compact single-line (model, branch, directory, context bar, cost)

### Layout (`layout`)
Internal render mode. Prefer setting `preset` instead.
- `"multiline"` — full multi-line renderer
- `"singleline"` — compact single-line renderer
- `"auto"` — switches based on terminal width

### Icons (`icons`)
- `"nerd"` — Nerd Font icons (default, requires a Nerd Font)
- `"emoji"` — Unicode emoji icons
- `"none"` — no icons, ASCII fallbacks

### Theme (`theme`)
Named color themes (requires truecolor terminal):
- `"dracula"`, `"nord"`, `"tokyo-night"`, `"catppuccin"`, `"monokai"`

### Display Toggles (`display`)
Each is a boolean (`true`/`false`):
`model`, `branch`, `gitChanges`, `directory`, `contextBar`, `contextTokens`, `tokens`, `cost`, `burnRate`, `duration`, `tokenSpeed`, `rateLimits`, `tools`, `todos`, `vim`, `effort`, `worktree`, `agent`, `sessionName`, `style`, `version`, `linesChanged`, `memory`

### Colors (`colors.mode`)
- `"auto"` — detect from terminal
- `"named"` — basic ANSI
- `"256"` — 256-color
- `"truecolor"` — 24-bit RGB

### GSD Integration (`gsd`)
- `true` — show GSD task info
- `false` — hide GSD section

## Example Configs

Minimal with emoji icons:
```json
{
  "preset": "minimal",
  "icons": "emoji"
}
```

Full with Dracula theme:
```json
{
  "preset": "full",
  "theme": "dracula",
  "colors": { "mode": "truecolor" }
}
```

Custom — hide cost and tokens, keep everything else:
```json
{
  "display": {
    "cost": false,
    "tokens": false
  }
}
```

## Rules

1. Always read the existing config first
2. Merge changes — don't overwrite the entire file
3. Preset sets defaults; explicit display toggles override preset
4. Theme requires `colors.mode: "truecolor"` to take effect
5. After writing, tell the user to restart their Claude Code session
