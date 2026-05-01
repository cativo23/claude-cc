# Contributing to lumira

Thanks for the interest. lumira is a statusline plugin for [Claude Code](https://code.claude.com), narrow scope on purpose. Most contributions land best as themes or small renderer tweaks.

## Setup (3 commands)

```bash
git clone https://github.com/cativo23/lumira.git
cd lumira && npm install
npm test                # all tests should pass on a fresh clone
```

Other useful scripts:

```bash
npm run dev             # tsc --watch
npm run lint            # tsc --noEmit
npm run test:watch      # vitest in watch mode
npm run test:coverage   # vitest with coverage report
npm run build           # compile to dist/
```

## Branching (gitflow)

- **`main`** — released versions, tagged. Don't open PRs against main directly.
- **`develop`** — integration branch. **Open PRs here.**
- **Feature branches** — `feature/<name>`, `fix/<name>`, `docs/<name>`. Branch off `develop`.

Releases come from `release/vX.Y.Z` branches that get cut from `develop` by maintainers. After a release lands on `main`, it's back-merged to `develop` to keep the lines in sync.

## Commit style

Conventional Commits: `type(scope): subject`.

```
feat(render): add support for striped powerline separator
fix(parsers): use dirname for STATE.md walk
docs(readme): document NO_HYPERLINKS env var
test(transcript): cover the file-rotation edge case
chore(deps): bump @types/node to 25.7
```

Subject in present tense, no trailing period. Wrap the body at 72 cols if you write one.

## Adding a theme

This is the most common contribution path. Each theme lives in its own module under `src/themes/<slug>.ts` so adding one is a single new file plus a one-line registration.

### Steps

1. **Pick a name and a real palette.** Dracula, Nord, Catppuccin etc. all have official color specs. Don't invent a "lumira-special" theme without an upstream reference — reviewers will ask for the source.

2. **Copy an existing theme as a starting point.** `src/themes/dracula.ts` is the cleanest reference. Save it as `src/themes/<slug>.ts` and replace the values:
   - `metadata.name` — the slug used as the CLI argument (lowercase, kebab-case)
   - `metadata.mode` — `'dark'` or `'light'`
   - `metadata.source` — link to the upstream palette (license check)
   - `palette` — 8 truecolor fg escapes (cyan, magenta, yellow, green, orange, red, brightBlue, gray) — these are emitted via `\x1b[38;2;r;g;bm` on truecolor terminals and projected to xterm-256 on 256-color terminals
   - `palette.powerline` — 6 hand-curated bgs (modelBg, dirBg, branchCleanBg, branchDirtyBg, taskBg, versionBg) plus `fg` — bg colors must each be **visibly distinct hues** so segments don't blur together

3. **Register the new module in `src/themes/index.ts`.** Add the import and append to the `REGISTRY` array (alphabetical with the others).

4. **Run the contrast guard locally.** `npm run themes:validate` checks that every powerline bg has WCAG AA contrast ≥4.5:1 against `fg` (default white). CI runs the same check on every PR — if it fails locally, it'll fail in CI.

5. **Generate a screenshot.** `COLORTERM=truecolor node dist/index.js themes preview <slug> --powerline` — drag-drop the result into the PR description. Don't commit the image; GitHub `user-attachments` URLs work fine.

6. **Run the full suite.** `npm test` — the catalog test in `tests/themes.test.ts` verifies your theme exposes every required field. No need to add tests for the theme itself unless it has unusual behavior.

Open a PR against `develop` using the theme template (`?template=theme.md` in the URL, or pick it from the dropdown).

## TypeScript / code style

- Strict mode (`tsconfig.json` is the source of truth — don't relax it).
- ESM only (`type: "module"` in package.json).
- **Zero runtime dependencies** is a hard rule. devDependencies are fine; runtime deps are a non-starter. The whole point of lumira is that it runs anywhere with Node 18+.
- TDD: tests for new behavior land in the same PR as the code. Bug fixes land with a regression test that proves the bug.

## Getting code review

PRs run CI on push. When tests + typecheck go green, the PR is **ready for review** but **not auto-merged**. A maintainer (currently just [@cativo23](https://github.com/cativo23)) will pick it up.

**Substantial PRs** (anything beyond a theme or single-line fix) are reviewed by an Opus-class agent before a human review pass. Findings get applied as follow-up commits on the same branch before merge. This is just to keep the bar high while the project has one maintainer; expect ~24h turnaround.

## What's out of scope

- Shell prompt features (zsh/fish/etc.) — lumira is a Claude Code/Qwen Code statusline, not a shell prompt.
- Cross-Claude-version test matrix — we test against the current Claude Code release, not historical ones.
- Plugin / custom-segment marketplace — hold off until at least 3 users request it.
- Auto-update / self-update — npm handles this.
- Telemetry — never.

## Questions

[Open a discussion](https://github.com/cativo23/lumira/discussions). For security issues, see [SECURITY.md](SECURITY.md).
