---
name: setup
description: Use after installing the lumira plugin to activate the statusline. Writes statusLine.command to ~/.claude/settings.json pointing to the plugin-cached binary. Run this once after /plugin marketplace add cativo23/lumira.
allowed-tools: Bash, Read, Write
license: MIT
---

# /lumira:setup — Activate lumira statusline

You activate the **lumira** statusline for Claude Code after plugin installation.

## Workflow

1. **Find install path** — Read `~/.claude/plugins/installed_plugins.json`. Look for any key matching `lumira@*` (the exact marketplace key depends on how the user installed it). Extract `installPath` from the first match.
2. **Verify binary** — Check that `<installPath>/dist/index.js` exists.
3. **Read settings** — Read `~/.claude/settings.json`. If the file is **missing**, start from `{}`. If it is **present but invalid JSON**, stop and report the parse error — do not overwrite.
4. **Check existing** — If `statusLine.command` is already set and contains "lumira", tell the user what's currently set and ask if they want to update it.
5. **Write command** — Set `statusLine.command` to `node "<installPath>/dist/index.js"`.
6. **Init config** — If `~/.config/lumira/config.json` does not exist, create it with `{"preset": "balanced"}`. Never overwrite an existing config.
7. **Confirm and instruct** — Tell the user what was written and that they must restart Claude Code.

## Finding the install path

```bash
cat ~/.claude/plugins/installed_plugins.json
```

Parse the JSON and find the entry whose key starts with `lumira@`. The `installPath` field is the absolute path to the cached plugin directory.

If multiple entries match (unlikely), use the one with the most recent `lastUpdated`.

## settings.json merge rules

- Always read the full file first, then patch only `statusLine.command`.
- Write back the complete merged object — never truncate other fields.
- If the file is missing, create it with just `{"statusLine": {"command": "<node command>"}}`.
- If the file is not valid JSON, report the parse error and stop. Do not overwrite.

## Success output

After writing, tell the user:
- The exact command written
- That they need to **restart Claude Code** for the statusline to appear
- "Run /lumira:lumira to customize preset, theme, or display widgets"

## Error cases

- No `lumira@*` key in installed_plugins.json → "Lumira doesn't appear to be installed as a plugin. Run: `/plugin marketplace add cativo23/lumira` then try again."
- `dist/index.js` missing at install path → "Plugin installed but dist/ is missing. Reinstall: uninstall lumira then `/plugin marketplace add cativo23/lumira`."
- settings.json parse error → show the exact error, stop, do not write.

## Language

Respond in the user's language. Spanish input → Rioplatense Spanish (voseo: "vos tenés", "reiniciá", "fijate").
