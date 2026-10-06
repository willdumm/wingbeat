# Wingbeat

## Design system — use it for every UI change

This app follows the **Wingbeat** design system. The reference export lives at
`docs/Wingbeat Design System.zip` (unzip to browse; see `docs/design-system.md`
for what's in it) — tokens, type scale, color, spacing, elevation, and component
specs all come from there. Before writing new UI:

1. **Reach for a token before a literal.** All colors, radii, shadows, fonts,
   weights, tracking, and motion values are CSS custom properties defined in
   `src/shared/theme.ts` (`themeVars()`), e.g. `var(--accent)`, `var(--radius-md)`,
   `var(--font-ui)`, `var(--duration-fast)`. Never hand-write a hex color, `px`
   radius, or `system-ui` font stack that already has a token — grep `theme.ts`
   first.
   - A Leaflet layer can't consume `var(--x)` directly (canvas-rendered markers,
     some style objects) — use `getAccentColor()` / `getSuccessColor()` /
     `getDangerColor()` / `getCssVar(name, fallback)` from `themeRuntimeScript()`
     (`shared/theme.ts`) instead of a hardcoded fallback hex.
2. **Reach for an existing shared component before building a new one.** Check
   `src/shared/` for something that already does this before writing new markup
   or CSS:
   - `brand.ts` — logo lockup + favicon (`logoLockupMarkup()`, `logoFaviconHref()`)
   - `icons.ts` — Lucide icon rendering (`icon()`, plus the runtime script that
     auto-renders `data-lucide` placeholders anywhere in the DOM)
   - `status.ts` — status dot/chip primitive (`statusDot()`, `statusChip()`) for
     any in-flight/on-ground/GPS-freshness/active-state indicator
   - `buttons.ts` — `.btn-primary` / `.btn-secondary` and the shared `.chevron`
     disclosure-triangle pattern (rotates via `[data-open]`, filled by
     `icon('chevron-right')` — don't reintroduce a `▼`/`▶` text glyph)
   - `segmented-control.ts` — the tab/toggle-row primitive (page nav tabs,
     theme switcher); reuse its classes for any new 2–3-way inline toggle
   - `toggle.ts` — collapsible-section open/close behavior (pairs with
     `.chevron[data-open]`)
   - `map-controls.ts`, `sidebar.ts`, `settings.ts`, `filters.ts`,
     `aircraft-info.ts`, `elevation.ts` — map chrome, sidebar/panel toggle,
     settings modal, the shared filter section, and other larger composite
     patterns already used by both the dashboard and analytics pages
   If two pages or two components need visually the same thing, it belongs in
   `src/shared/`, not copy-pasted — see the segmented-control extraction for the
   pattern to follow (one shared class set, imported by both consumers, wired
   into the page-level `<style>` composition in `dashboard.ts`/`analytics.ts`
   exactly once).
3. **New scrollable overlay?** Also see `docs/frontend-patterns.md` (iOS
   touchmove allowlist) — unrelated to the design system but a common miss when
   adding new modals/panels.

When a change can't reuse an existing token or component and genuinely needs
something new, add it to `src/shared/` (following the existing `*Styles()` /
`*Markup()` / `*Script()` export pattern) rather than inlining it in a
page-specific file, so the next UI change has it to reuse too.

## Doc screenshots — `data-doc-shot` tags

Some elements in `src/shared/*.ts` / `src/dashboard/markup.ts` / `src/analytics/markup.ts`
carry a `data-doc-shot="<slug>"` attribute (inert at runtime — same idea as
`data-testid`). These are the anchors `site/scripts/gen-doc-shots.mjs` uses to screenshot
real UI for the docs site (see `docs/doc-screenshots-plan.md`). If you move, rename, or
remove a `data-doc-shot` element, update `site/scripts/doc-shots.manifest.mjs` (or the tag
itself) in the same change — otherwise the next `npm run docs:shots` run fails loudly
instead of a doc page silently going stale.

## Docs-site home page — `npm run docs:showcase`

The docs site's home page (prose in `site/content/_index.md` + shortcodes in
`site/layouts/_shortcodes/`; styles, scripts and demos from `src/showcase/`, generated into
`site/data/showcase.json` and `site/static/showcase/`) renders the real status cards, flight list/tracks, maintenance
view, duty log, accounting, heatmaps and stream graph from sample data by calling the
render chunks directly (`aircraft-cards.ts`, `track-render.ts`,
`dashboardScriptsFlightListRender`, `aircraftInfoRenderScript`, `pilotDutyRenderScript`,
analytics `time`/`accounting`/`layers`/streamgraph render). Keep those chunks free of
dashboard/analytics page state (take data and elements as arguments). After changing any
of them, or their styles, re-run `nix develop path:./nix --command npm run docs:showcase`
and commit the regenerated output. `--check` fails if it's stale. See `site/README.md`.

## Migrations

`migrations/0001_initial.sql` is the full schema. Number new migrations sequentially from
`0002_` up, never edit one that has shipped, and keep tenant data (trackers, named points,
regions) out of them (see README.md, "Database migrations").
