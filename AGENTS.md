# AGENTS.md

> Instructions for AI coding agents working on this repository.

## Project Overview

**lumira** — Cross-platform terminal statusline for Claude Code & Qwen Code.

- **Type:** TypeScript CLI tool (statusline renderer)
- **License:** MIT
- **Node:** >= 18 (matches `engines.node` in `package.json`)

## Setup & Dev Environment

```bash
# Install dependencies
npm install

# Verify build
npm run build

# Run all tests
npm test

# Check coverage
npm run test:coverage
```

## Build, Lint, and Test

```bash
# Compile TypeScript
npm run build

# Run tests (Vitest)
npm test

# Tests with coverage report
npm run test:coverage

# Lint
npm run lint
```

**Important:** Agents will automatically attempt to run these commands and fix failures before marking a task complete. Always run `npm test` after making changes.

## Code Style

- **TypeScript:** Strict mode, no `any` except for platform detection in renderers
- **Naming:** `camelCase` functions, `PascalCase` types
- **Formatting:** Handled by ESLint automatically
- **Imports:** `.js` extension on relative imports
- **No unnecessary additions:** Don't add features or error handling beyond what's asked
- **No comments in code** unless logic isn't self-evident

## Testing Instructions

- **Framework:** Vitest (`npm test`)
- **Coverage target:** 90%+ line coverage (`npm run test:coverage`)
- **Fixtures:** `tests/fixtures/` contains real JSON payloads from Claude & Qwen
- **Rule:** Add or update tests for the code you change, even if nobody asked
- **Fix procedure:** If a test fails, fix the code or the test until the whole suite is green before committing

## Security Considerations

- **Never commit secrets, API keys, or tokens** — tests use mock data only
- **No hardcoded credentials** in source code or config files
- **Statusline commands run locally** — no network calls, no external services
- **Input from stdin is untrusted** — always handle parse errors gracefully

## PR & Commit Guidelines

- **Branches:** single trunk `main`. Topic branches: `feature/*`, `fix/*`, `docs/*`, `refactor/*`.
- **Commits:** One concern per commit, imperative mood ("feat: add Qwen support")
- **PRs:** target `main`. Merge method is up to the maintainer (squash for trivial fixes, merge commit for multi-step features).
- **Pre-commit:** Always run `npm test` and `npm run build` before committing
- **PR title format:** `type(scope): description` (conventional commits)

## Deployment

Releases are fully automated by `.github/workflows/release.yml`. The workflow
triggers on `push: tags: [v*]` — once a `vX.Y.Z` tag lands on the remote it
parses the version from `github.ref_name` → publishes the GitHub Release with
notes from CHANGELOG.md → runs `npm publish`. Tags with a SemVer suffix
(`v1.0.0-beta.1`) are marked pre-release; the rest are Latest.

**Release process (maintainers only):**
1. From `main`, after the work is merged: `npm version X.Y.Z --no-git-tag-version`.
2. Move the `[Unreleased]` changelog entries into a new `[X.Y.Z] - YYYY-MM-DD`
   section. Update the compare links.
3. `git commit -am "chore(release): vX.Y.Z"`
4. `git tag vX.Y.Z && git push origin main --tags`
5. CI takes over: GitHub Release + npm publish happen automatically.

There is no `develop` branch and no release PR ceremony. The tag is the
release artifact.

## Guardrails

- **No platform-specific branching in renderers** — use feature detection, not platform identity
- **`normalize()` is the single source of truth** for platform differences
- **No `as any` anywhere**. Use union types (`RawInput`), type guards (`isQwenInput()`), or normalization to handle platform differences.
- **Keep AGENTS.md updated** — stale instructions cause agents to execute outdated steps

## References

- [README.md](README.md) — User-facing documentation
- [CONTRIBUTING.md](CONTRIBUTING.md) — Human contributor guide
- [CHANGELOG.md](CHANGELOG.md) — Version history
