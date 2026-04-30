# Contributing to lumira

Thanks for the interest. lumira is a statusline plugin for [Claude Code](https://code.claude.com), narrow scope on purpose. Most contributions land best as themes or small renderer tweaks.

## Setup (3 commands)

```bash
git clone https://github.com/cativo23/lumira.git
cd lumira && npm install
npm test                # 440+ tests, should all pass on a fresh clone
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

This is the most common contribution path. Five steps:

1. Pick a name and a palette. Real themes only — Dracula, Nord, Catppuccin etc. all have official color specs. Don't invent a "lumira-special" theme without a reference.

2. Open `src/themes.ts`. Each theme exports 8 fg colors (cyan, magenta, yellow, green, orange, red, brightBlue, gray) plus an optional `powerline` palette with 6 backgrounds (modelBg, dirBg, branchCleanBg, branchDirtyBg, taskBg, versionBg).

3. Pick the bg colors so:
   - White text is legible on every background — **WCAG AA contrast ≥4.5:1**. Use [contrast-ratio.com](https://contrast-ratio.com/) or any contrast checker.
   - Each segment background is visibly distinct from its neighbours — `modelBg` and `dirBg` shouldn't both be "muted blue", they should be in different hue families.

4. Add the theme name to `tests/themes.test.ts` (the catalog test that asserts every theme has the required fields).

5. Run `npm test` — all 440+ tests should pass.

Then open a PR against `develop` with the diff. PRs that don't add tests for new behavior won't be merged.

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
