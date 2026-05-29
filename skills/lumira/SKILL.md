---
name: lumira
description: Use when the user wants to configure the lumira statusline — change preset, theme, icons, powerline style, layout, or toggle widgets like cost, tokens, cache metrics, MCP, agents, or context-bar thresholds.
allowed-tools: Read, Write
license: MIT
---

# /lumira — Statusline Configuration Skill

You configure **lumira**, a terminal statusline/HUD for Claude Code and Qwen Code.

Your job: read the user's current config, translate their natural-language request into a **minimal JSON patch**, merge into the existing config, and write the result.

## Workflow

1. **Read** `~/.config/lumira/config.json`. If missing or invalid JSON, treat the current config as `{}`.
2. **Interpret** the user's request against the catalog below. Reject unknown keys/values explicitly — do not silently drop them.
3. **Merge** changes into the existing object. Never overwrite unrelated fields.
4. **Write** the merged JSON back to the file.
5. **Tell the user** to restart their Claude Code (or Qwen Code) session for changes to take effect.

## Configuration catalog

### Top-level fields

| Field | Type | Allowed values | Notes |
|---|---|---|---|
| `preset` | string | `"full"` \| `"balanced"` \| `"minimal"` | Sets `layout` + a bundle of `display.*` defaults |
| `layout` | string | `"multiline"` \| `"singleline"` \| `"auto"` | Internal render mode. Prefer `preset` |
| `icons` | string | `"nerd"` \| `"emoji"` \| `"none"` | Default `"nerd"` (requires Nerd Font) |
| `theme` | string | `"dracula"` \| `"nord"` \| `"tokyo-night"` \| `"catppuccin"` \| `"monokai"` \| `"gruvbox"` \| `"solarized"` | Requires `colors.mode: "truecolor"` to take effect |
| `style` | string | `"classic"` \| `"powerline"` | Visual style for line 1 |
| `powerline.style` | string | `"arrow"` \| `"flame"` \| `"slant"` \| `"round"` \| `"diamond"` \| `"compatible"` \| `"plain"` \| `"auto"` | Separator preset; only meaningful when `style: "powerline"` |
| `colors.mode` | string | `"auto"` \| `"named"` \| `"256"` \| `"truecolor"` | Color depth |
| `gsd` | boolean | `true` \| `false` | Show GSD task info section |

### Presets — what they do

- **`full`** → `layout: "multiline"`, every widget on.
- **`balanced`** → `layout: "auto"`, hides `burnRate`, `duration`, `tokenSpeed`, `linesChanged`, `sessionName`, `style`, `version`, `memory`, `contextTokens`, `cacheMetrics`.
- **`minimal`** → `layout: "singleline"`, hides nearly everything except `model`, `branch`, `directory`, `contextBar`, `cost`.

### Display toggles (`display.*`, booleans)

Valid keys (anything else must be rejected):

`model`, `branch`, `gitChanges`, `directory`, `contextBar`, `contextTokens`, `tokens`, `cost`, `burnRate`, `duration`, `tokenSpeed`, `rateLimits`, `paceDelta`, `quotaProjection`, `tools`, `todos`, `vim`, `effort`, `worktree`, `agent`, `agents`, `sessionName`, `style`, `version`, `linesChanged`, `memory`, `cacheMetrics`, `mcp`, `health`, `apiLatency`, `addedDirs`, `worktreeBreadcrumb`

### Display thresholds (`display.*`, numeric)

| Field | Default | Range | Notes |
|---|---|---|---|
| `contextWarningThreshold` | 70 | 0–100 | Context bar turns orange + 🔥 at this % |
| `contextCriticalThreshold` | 85 | 0–100 | Context bar turns red/blink + 💀. **Must be strictly greater than warning** |

If the pair is invalid, the runtime silently falls back to defaults. You should reject invalid pairs upfront and tell the user why.

## Platform detection

Lumira auto-detects the caller (Claude Code vs Qwen Code) at runtime. Qwen Code always renders single-line regardless of `layout` because it only displays the first line. **One `config.json` serves both** — never tell the user to maintain a separate config for Qwen.

## Few-shot examples

User intent → minimal JSON patch (assume existing config is preserved unless explicitly changed).

**"hacelo minimal con emoji"**
```json
{
  "preset": "minimal",
  "icons": "emoji"
}
```

**"powerline con flame y theme dracula"**
```json
{
  "style": "powerline",
  "powerline": { "style": "flame" },
  "theme": "dracula",
  "colors": { "mode": "truecolor" }
}
```

**"hide cost and tokens, keep everything else"** (patch only the toggles requested)
```json
{
  "display": {
    "cost": false,
    "tokens": false
  }
}
```

**"avisame antes con el contexto: alarma al 60% y crítico al 80%"**
```json
{
  "display": {
    "contextWarningThreshold": 60,
    "contextCriticalThreshold": 80
  }
}
```

**"show me cache hit rate and MCP servers"**
```json
{
  "display": {
    "cacheMetrics": true,
    "mcp": true
  }
}
```

**"full preset pero sin burn rate"** (preset + override)
```json
{
  "preset": "full",
  "display": {
    "burnRate": false
  }
}
```

## Rules

1. **Read first, write minimal.** Always load existing config before patching. Only emit fields the user actually asked to change.
2. **Validate before writing.** Reject unknown preset / icon / theme / style / powerline-style / display-toggle names with a clear message. Clamp threshold numbers to [0, 100] and enforce `warning < critical`.
3. **Preset then overlay.** When the user provides both a preset and explicit `display.*` toggles, write both — at runtime the explicit toggles win over preset defaults.
4. **Themes need truecolor.** When applying a theme, also set `colors.mode: "truecolor"` if it isn't already.
5. **Restart instruction is mandatory.** End every successful change with a one-line reminder to restart the session.
6. **Language match.** Respond in the user's language (Spanish → Spanish, English → English).

## Anti-patterns (do NOT do)

- ❌ Overwriting the whole config file with just the new fields — destroys unrelated settings.
- ❌ Inventing display toggle names that aren't in the list above.
- ❌ Using the removed `"qwen"` preset — it was deprecated and silently rewrites to `"minimal"`. Direct the user to `"minimal"` instead.
- ❌ Setting a `theme` without ensuring `colors.mode: "truecolor"` (the theme will appear broken).
- ❌ Forgetting the restart reminder.
- ❌ Setting `contextWarningThreshold >= contextCriticalThreshold` — runtime falls back to defaults and your "change" is invisible.
