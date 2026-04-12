# lumira — Context

## What is this?
**lumira** is a real-time terminal statusline/HUD plugin for Claude Code.
Etymology: Latin *lumen* (light) + Spanish *mirar* (to watch) = "the light that watches."

## Current State
- **Version:** 0.2.0 (pending publish)
- **npm:** `lumira` (name confirmed available)
- **GitHub:** github.com/cativo23/lumira
- **Tests:** 240 passing, zero type errors
- **Dependencies:** 0 runtime

## Architecture
```
stdin (JSON from Claude Code)
  -> parsers (git, transcript, token-speed, memory, gsd, mcp)
  -> RenderContext
  -> render (line1-4, balanced, or minimal)
  -> stdout
```

## Key Features (v0.2.0)
- 3 presets: full (4-line), balanced (2-line), minimal (1-line auto at <70 cols)
- Context window bar with color thresholds + contextTokens (used/capacity)
- Token I/O counts, speed (tok/s), cost + burn rate ($/h), cache hit rate
- Git branch + staged/modified/untracked counts (5s TTL cache)
- Active tools with count badges, todo progress bar
- GSD integration (unique differentiator)
- MCP server health display
- Named themes (dracula, nord, tokyo-night, catppuccin, monokai)
- Icon modes (nerd/emoji/none)
- Transcript JSONL parsing with mtime+size cache
- Rate limits (5h/7d) with countdown, vim mode, worktree awareness
- AI config skill (`/lumira`) for natural language configuration
- Config file (~/.config/lumira/config.json) + CLI flags
- Interactive installer (`npx lumira install`) with backup/restore
- Zero runtime dependencies, TypeScript strict, 240 tests

## Competitors
- **cc-pulse** (alin.dev) — MCP health, hooks monitoring, skills display
- **claude-scope** (YuriNachos) — 15 widgets, themes, Docker/dev-server monitoring
- **claude-bar** — themeable statusline
- **claude-hud** — basic statusline
- **claude-view** — session dashboard with web UI
