# Custom Commands

User-defined shell commands rendered as statusline segments on any of the 4 lines. Disabled by default.

## Enable

```bash
lumira custom enable
```

## Configure

Add a `customCommands` block to `~/.config/lumira/config.json`:

```json
{
  "customCommands": {
    "enabled": true,
    "commands": [
      {
        "id": "git-status",
        "command": ["git", "status", "--short"],
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
| `id` | Unique identifier for the command |
| `command` | Argv array — no shell expansion, pipes, or redirects |
| `line` | Statusline line to render on (`1`–`4`) |
| `refreshMs` | Refresh interval in milliseconds (default: `5000`) |
| `label` | Optional prefix shown before the command output |
| `color` | Optional color override for the segment |
| `onError` | What to show on non-zero exit: `hide` (default), `placeholder`, `output`, or `stale` |
| `onTimeout` | What to show on timeout: same options as `onError`, defaults to `hide` |
| `timeoutMs` | Max execution time in ms (clamped to 2000) |
| `maxBytes` | Max stdout bytes captured (clamped to 4096) |
| `ansi` | Set `true` to pass through ANSI escape sequences from the command |

`command` must be an argv array (`["git", "status", "--short"]`). Shell strings with pipes or redirects are not supported — wrap them in a script if needed.

Output is cached with a TTL and refreshed in the background, so the hot render path never blocks on subprocess execution.

## CLI subcommands

```bash
lumira custom list          # list configured commands and their status
lumira custom enable        # enable the custom commands feature
lumira custom disable       # disable the custom commands feature
lumira custom test <id>     # run a command immediately and print its output
lumira custom logs          # show recent execution logs
```

[← Back to README](../README.md)
