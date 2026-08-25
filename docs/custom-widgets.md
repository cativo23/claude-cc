# Custom Widgets

User-defined shell commands rendered as statusline segments on any of the 4 lines. Disabled by default.

> **Naming note:** this feature was called "Custom Commands" (config key `customCommands`, CLI `lumira custom`) before value→icon/color tiers and a `description` field landed. `customWidgets`/`lumira widget` are the names used from here on, but the old key and CLI name are permanent aliases — nothing written before this doc is out of date. See [Migrating from `customCommands`](#migrating-from-customcommands) below.

## Enable

```bash
lumira widget enable
```

## Configure

Add a `customWidgets` block to `~/.config/lumira/config.json`:

```json
{
  "customWidgets": {
    "enabled": true,
    "commands": [
      {
        "id": "git-status",
        "command": ["git", "status", "--short"],
        "description": "Git working-tree status, short form",
        "label": "",
        "line": 1,
        "refreshMs": 5000,
        "onError": "hide"
      }
    ]
  }
}
```

**Key fields:**

| Field | Description |
|---|---|
| `id` | Unique identifier for the widget |
| `command` | Argv array — no shell expansion, pipes, or redirects |
| `description` | Free-text, never rendered — shows up in `lumira widget list` so a widget you pasted from someone else explains itself |
| `line` | Statusline line to render on (`1`–`4`) |
| `refreshMs` | Refresh interval in milliseconds (default: `5000`) |
| `label` | Optional prefix shown before the widget's output |
| `color` | Optional static color for the segment (overridden per-value by `valueMap`, see below) |
| `valueMap` | Optional value→icon/color tiers — see [Value tiers](#value-tiers-valuemap) |
| `onError` | What to show on non-zero exit: `hide` (default), `placeholder`, `output`, or `stale` |
| `onTimeout` | What to show on timeout: same options as `onError`, defaults to `hide` |
| `timeoutMs` | Max execution time in ms (clamped to 2000) |
| `maxBytes` | Max stdout bytes captured (clamped to 4096) |
| `ansi` | Set `true` to pass through ANSI escape sequences from the command (disables `color` and `valueMap` — see below) |

`command` must be an argv array (`["git", "status", "--short"]`). Shell strings with pipes or redirects are not supported — wrap them in a script if needed.

Output is cached with a TTL and refreshed in the background, so the hot render path never blocks on subprocess execution. Whatever the command prints is sanitized to a single line (embedded newlines become spaces) before it's cached or rendered — a widget can't accidentally break the statusline into two lines.

## Value tiers (`valueMap`)

A widget whose command prints a bare number (optionally with a trailing `%`) can map that value to an icon and/or color per range — the same idea as the built-in rate-limit battery glyph, applied to your own data:

```json
{
  "id": "cpu-temp",
  "command": ["sh", "-c", "sensors -A | awk '/Package/{print $4}' | tr -d '+°C'"],
  "description": "CPU package temperature in °C",
  "line": 1,
  "refreshMs": 10000,
  "valueMap": [
    { "lt": 60, "icon": "🟢" },
    { "lt": 80, "icon": "🟡", "color": "yellow" },
    { "icon": "🔴", "color": "red" }
  ]
}
```

- **`lt`** is an *exclusive* upper bound: a tier matches when `value < lt`. Omit `lt` on one tier to make it the catch-all (matches anything not caught by an earlier tier) — you'll usually want exactly one, listed last for readability (order in the file doesn't matter; lumira always sorts tiers ascending by `lt` and puts the catch-all last).
- Each tier needs at least an `icon` or a `color` — one with neither is dropped as a no-op.
- A tier's `color` overrides the widget's static `color` when it matches; a tier's `icon` sits between `label` and the value (`label icon value`).
- **The command's output must parse as a pure number** (optionally trailing `%`) — `"87"`, `"87%"`, `"-3.5"` all work; `"cpu: 87%"` or `"87ms"` do not. If your raw output is noisier than that, extract the number yourself (`awk`, `grep -oP`, a one-line script) — lumira deliberately doesn't parse numbers out of arbitrary text, since a partial match (`"1,024"` — 1 or 1024?) is more likely to surprise you than help.
- If the output doesn't parse as numeric, or no tier matches (a value above every `lt` with no catch-all), the widget falls back to plain text + its static `label`/`color` — exactly like a widget with no `valueMap` at all.
- `valueMap` is ignored entirely when `ansi: true` — an ANSI-passthrough widget already owns its own colors.
- **Limits**: up to 12 tiers per widget (a catch-all always keeps its slot even past that cap — the 11 smallest bounded tiers survive instead, not the catch-all being dropped); each `icon` is capped at 16 characters.
- **Debugging a tier that isn't matching**: `lumira widget test <id>` runs the command once and prints the parsed value and which tier it matched (or why it didn't) — this is the intended diagnostic; `valueMap` parsing never warns to stderr on a malformed value.

## CLI subcommands

```bash
lumira widget list          # list configured widgets, their status, and tier count
lumira widget enable        # enable the custom widgets feature
lumira widget disable       # disable the custom widgets feature
lumira widget test <id>     # run a widget immediately, print output + matched tier
lumira widget logs          # show recent execution logs
```

## Sharing a widget

A widget is a single, self-contained JSON object — copy the object out of your `commands` array and hand it to someone else (a gist, a chat message, a PR to this repo's docs) and they can paste it straight into theirs. There's no import command or registry (yet) — see the examples below for ready-to-paste starting points.

## Examples

Drop any of these into your `customWidgets.commands` array as-is, or use them as a starting point.

**System uptime** (line 1, no valueMap — plain text):

```json
{
  "id": "uptime",
  "command": ["uptime", "-p"],
  "description": "System uptime",
  "label": "⏻",
  "line": 1,
  "refreshMs": 60000
}
```

**Disk free on `/`** (green/yellow/red by percent used):

```json
{
  "id": "disk-free",
  "command": ["sh", "-c", "df -h / | awk 'NR==2{print $5}' | tr -d '%'"],
  "description": "Root filesystem usage %",
  "label": "💾",
  "line": 1,
  "refreshMs": 30000,
  "valueMap": [
    { "lt": 70, "icon": "🟢" },
    { "lt": 90, "icon": "🟡", "color": "yellow" },
    { "icon": "🔴", "color": "red" }
  ]
}
```

**Battery level** (Linux, via `/sys`):

```json
{
  "id": "battery",
  "command": ["sh", "-c", "cat /sys/class/power_supply/BAT0/capacity 2>/dev/null || echo ''"],
  "description": "Battery charge %",
  "line": 1,
  "refreshMs": 30000,
  "onError": "hide",
  "valueMap": [
    { "lt": 20, "icon": "🔴", "color": "red" },
    { "lt": 50, "icon": "🟡", "color": "yellow" },
    { "icon": "🟢" }
  ]
}
```

**1-minute load average** (relative to a 4-core machine — adjust the thresholds to your core count):

```json
{
  "id": "load-avg",
  "command": ["sh", "-c", "cut -d' ' -f1 /proc/loadavg"],
  "description": "1-minute load average (tuned for 4 cores)",
  "label": "⚙",
  "line": 2,
  "refreshMs": 15000,
  "valueMap": [
    { "lt": 2, "icon": "🟢" },
    { "lt": 4, "icon": "🟡", "color": "yellow" },
    { "icon": "🔴", "color": "red" }
  ]
}
```

## Migrating from `customCommands`

Nothing to do. `customCommands`/`lumira custom` keep working exactly as before, permanently — `customWidgets`/`lumira widget` are simply the names used going forward. If you'd like to rename your own config for consistency: rename the top-level `customCommands` key to `customWidgets` (the contents don't change), or just run `lumira widget enable`/`disable`, which write back to whichever key your config already uses.

> **Careful with a half-finished manual rename.** The two keys never merge: if `customWidgets` ends up present at all — even as an empty `{}` — it wins *entirely* and `customCommands` is ignored, widgets and all. Copy the whole block over in one edit (or delete the old key in the same edit you add the new one) rather than adding `customWidgets` first and cleaning up `customCommands` "later" — "later" is the state where your widgets silently vanish with no error.

[← Back to README](../README.md)
