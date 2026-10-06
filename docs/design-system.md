# Wingbeat Design System (reference)

`docs/Wingbeat Design System.zip` is the design handoff the rebrand in the
`branding` bookmark (tokens, type, color, component specs, guideline pages) was
implemented against. It's a reference export, not something the app builds or
imports — nothing in `src/` reads it.

Unzip it to browse:
- `readme.md` / `guidelines/cards/*.html` — the written spec (color, type, spacing,
  elevation, radius, states) each change in `src/shared/theme.ts` etc. should match.
- `components/**/*.jsx` + `*.prompt.md` — reference component implementations
  (buttons, badges, forms, flight cards) that this app's `src/shared/*.ts` string
  templates were adapted from for a server-rendered/vanilla-JS stack rather than JSX.
- `assets/logo-mark*.svg` — logo source variants; the app's own copy lives at
  `logo_plain.svg` (repo root) and is what `src/shared/brand.ts` actually imports.

If a future rebrand or token change touches this system again, re-export a fresh
zip here rather than leaving stale guidance for whoever reads this next.

The 2026-10 accessibility pass edited this export by hand rather than re-exporting it:
`--action-primary` moved to sky-600 (hover sky-700, press sky-800), `--ring-focus` became a
solid 2px sky-500 ring with a 2px page-colour gap, and the readme now limits `--text-subtle`
to disabled/decorative text. (These are `--accent-solid`, `--ring-focus` and
`--text-muted`/`--text-faint` in `src/shared/theme.ts`.) The claude.ai design-system project
it came from doesn't have these changes yet; sync it with `/design-sync`.
