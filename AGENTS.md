# AGENTS.md

> Instructions for AI coding agents working on this repository.

## Project Overview

**lumira** — Cross-platform terminal statusline for Claude Code & Qwen Code.

- **Type:** TypeScript CLI tool (statusline renderer)
- **License:** MIT
- **Node:** >= 22.14.0

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

- **Branches:** `main` (stable), `develop` (integration), `feat/*`, `fix/*`
- **Commits:** One concern per commit, imperative mood ("feat: add Qwen support")
- **PRs:** Merge to `develop` via squash merge
- **Pre-commit:** Always run `npm test` and `npm run build` before committing
- **PR title format:** `type(scope): description` (conventional commits)

## Deployment

```bash
# Publish to npm (requires maintainer access)
npm publish --access public

# Update version before publishing
npm version patch   # or minor / major
```

**Release process:**
1. Branch from `develop` → `release/X.Y.Z`
2. Bump version, update CHANGELOG.md
3. PR to `main`, squash merge
4. `npm publish --access public`
5. Merge `main` back to `develop`
6. Tag release: `git tag vX.Y.Z && git push origin --tags`

## Guardrails

- **No platform-specific branching in renderers** — use feature detection, not platform identity
- **`normalize()` is the single source of truth** for platform differences
- **No `as any` anywhere**. Use union types (`RawInput`), type guards (`isQwenInput()`), or normalization to handle platform differences.
- **Keep AGENTS.md updated** — stale instructions cause agents to execute outdated steps

## References

- [README.md](README.md) — User-facing documentation
- [CONTRIBUTING.md](CONTRIBUTING.md) — Human contributor guide
- [CHANGELOG.md](CHANGELOG.md) — Version history
