# Configuration

Create `~/.config/lumira/config.json`:

```json
{
  "preset": "balanced",
  "theme": "tokyo-night",
  "icons": "nerd",
  "style": "classic",
  "line1Align": "justified",
  "powerline": { "style": "auto" },
  "refreshInterval": 5,
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
    "apiLatency": true,
    "rateLimits": true,
    "paceDelta": true,
    "quotaProjection": true,
    "tools": true,
    "todos": true,
    "mcp": true,
    "vim": true,
    "effort": true,
    "worktree": true,
    "addedDirs": true,
    "worktreeBreadcrumb": true,
    "agent": true,
    "sessionName": true,
    "style": true,
    "version": true,
    "linesChanged": true,
    "memory": true,
    "agents": true,
    "compactionCount": true,
    "health": false,
    "contextWarningThreshold": 70,
    "contextCriticalThreshold": 85
  }
}
```

All fields are optional — defaults are shown above (except `refreshInterval`, which is unset/off by default and shown here only as an example). `display.health` defaults to `false` (opt-in widget). `line1Align` controls line 1's classic layout: `"justified"` (default) pins the left cluster to the start and the right cluster to the end; `"packed"` packs every segment tightly to the left with no forced middle gap, except the app version string, which stays pinned to the true right edge (the same idiom line 2 uses for its small right-anchored indicators). On a terminal too narrow to fit the version alongside the packed content, the version disappears entirely rather than truncating — an intentional all-or-nothing tradeoff. Powerline mode always packs.

**Context bar thresholds** — `contextWarningThreshold` (default 70) and `contextCriticalThreshold` (default 85) control when the bar transitions through yellow/orange/red. Both are clamped to `[0, 100]` and `warning < critical` is required (invalid pairs fall back to defaults with a one-shot stderr warning). Lower them for earlier warnings, raise them if your workflow tolerates fuller buffers.

> **Migration note (post-0.7.1):** default color transitions shifted from `50/65/80` to `50/70/85`. The bar now stays yellow up to 70% (was 65%) and orange up to 85% (was 80%) before flashing red. To restore the previous behavior, set `"contextWarningThreshold": 65, "contextCriticalThreshold": 80` in your config.

## CLI Flags

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

[← Back to README](../README.md)
