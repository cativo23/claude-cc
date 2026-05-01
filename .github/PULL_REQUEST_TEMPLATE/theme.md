<!--
Theme contribution PR. See CONTRIBUTING.md → "Adding a theme" for the full
walkthrough. This template is opt-in: add `?template=theme.md` to the PR
URL when opening it, or pick it from the template dropdown.
-->

## Theme name

`<slug>` — e.g. `gruvbox-light`, `everforest`, `catppuccin-latte`. Lowercase, kebab-case.

## Source

Link to the upstream brand palette (so reviewers can verify the colors are accurate, not invented):

- <!-- e.g. https://github.com/sainnhe/everforest -->

License of the upstream:

- <!-- MIT / CC-BY-SA / "official palette, no license required" / etc. -->

## Mode

- [ ] Dark theme
- [ ] Light theme

## Checklist

- [ ] New file at `src/themes/<slug>.ts` exporting `metadata` + `palette`
- [ ] Registered in `src/themes/index.ts` REGISTRY array (alphabetical with the others)
- [ ] Powerline palette is **hand-curated** (not auto-derived). Auto-derivation produces muddy results — see `derivePowerlinePalette` for the fallback algorithm if you want a starting point, but fine-tune by hand.
- [ ] `npm run themes:validate` passes locally (every powerline bg has ≥4.5:1 contrast against `fg`)
- [ ] `npm test` passes (full suite stays green)
- [ ] Screenshot of the new theme in the PR description (`COLORTERM=truecolor node dist/index.js themes preview <slug> --powerline`)
- [ ] No changes to other themes' palettes (one PR = one new theme)
- [ ] No new runtime dependencies (lumira ships zero)

## Why this theme

<!-- 1-2 sentences. Who's likely to use it? Existing community demand (issue link), match for a popular editor theme, etc. -->

## Screenshot

<!-- Drag-drop a screenshot of `lumira themes preview <slug> --powerline` here.
     The image will be hosted on user-attachments.githubusercontent.com,
     keeping the repo lean. -->
