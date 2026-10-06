# Design: Programmatically Generated UI Screenshots for Docs

## Problem

The Hugo docs site (`site/content/docs/**`) describes buttons, dialogs, and panels in
prose but has no way to show them. The one precedent for embedding images
(the MapShare setup images in `site/static/img/mapshare-*.png`) is hand-taken PNGs of an external website,
manually screenshotted and never regenerated — that doesn't scale to the dashboard's own
UI, which changes as features land, and hand-maintained screenshots silently go stale.

Goal: generate screenshots of real dashboard UI (buttons, dialogs, panels) driven by
Playwright, referenced from markdown docs, in a way that survives UI refactors without
someone having to notice and re-shoot everything by hand.

## Current state

- Docs: Hugo (`hugo-book` theme) under `site/`, content in `site/content/docs/**/*.md`,
  images served as static files from `site/static/img/`. No CI build step exists yet —
  it's built/served locally (`site/README.md`).
- App UI: server-rendered string templates in `src/shared/*.ts` (`buttons.ts`,
  `settings.ts`, `sidebar.ts`, `map-controls.ts`, `aircraft-info.ts`, etc.) — no
  component tree to introspect, just DOM once rendered into the page.
- `playwright` is already a devDependency, unused so far. `dom-to-svg` is not installed.
- No demo/fixture data mode exists — the dashboard only knows how to read real D1 data.

## Approach

### 1. DOM tagging convention — `data-doc-shot="<slug>"`

Add this attribute directly in the `*Markup()` template strings in `src/shared/*.ts`,
only on elements a doc image actually targets — not blanket instrumentation. Slugs are
dot-namespaced to match the docs tree, e.g. `settings.add-tracker-dialog`,
`map-controls.overlay-legend-button`.

This is the resilience anchor: refactors can rename classes/ids/markup freely, and as
long as the tag moves with the element (or the doc reference is updated in the same
change), screenshots keep working. The attribute is inert — harmless to ship to prod,
same idea as `data-testid`.

Convention to record in `CLAUDE.md`: moving or removing a `data-doc-shot` element
requires updating the manifest (below) or the tag in the same change.

### 2. Screenshot manifest — single source of truth

`site/scripts/doc-shots.manifest.ts`: one entry per screenshot, each with:

- `slug` — matches the `data-doc-shot` value of the target element
- `route` — page to load
- `setup` — ordered list of clicks on *other* `data-doc-shot` tags needed to reach the
  target state (open a settings section, open a dialog, etc.) — never raw CSS selectors
  or text content, for the same resilience reason as (1)
- `theme` — `light` | `dark` (optional, defaults to light)
- `output` — path under `site/static/img/generated/`

This is the cross-reference layer between DOM tags and docs. Setup steps are
click-throughs against tags rather than an in-page JS hook API — simpler, no new
app-facing surface, and each step is independently checkable against the DOM.

### 3. Fixture/demo data mode

No runtime gate or flag in `src/index.ts` — turns out one isn't needed. The generator
applies migrations plus a checked-in fixture SQL file
(`site/scripts/doc-shots-seed.sql`: fake tail numbers, fake pilots, no real data) to an
**ephemeral, local-only** `wrangler dev --local` D1 instance, then authenticates through
the app's real invite/join flow (`POST /join/:token`) using a token seeded by that same
SQL file. This runs against the real Worker/app code path, not a separate mock server or
a bypass branch, so screenshots exercise real rendering logic — and "never reachable in
the deployed prod Worker" is true by construction (the fixture data and the token only
ever exist in a temp directory that's deleted after each run), not by a flag that could
regress.

### 4. Generator script — Playwright, PNG capture

`site/scripts/gen-doc-shots.mjs`: applies migrations + a fixture seed to an ephemeral
local D1, boots `wrangler dev --local` against it, joins through a seeded invite token
to get a real session, then for each manifest entry navigates, runs setup clicks via
`data-doc-shot` selectors, waits for the target element, captures it via Playwright's
native `elementHandle.screenshot()`, and writes to
`site/static/img/generated/<slug-path>.png`.

**Capture method — PNG only.** `dom-to-svg` was tried first (see "Open items — resolved"
above) and dropped: it has no prebuilt browser bundle and, more fundamentally, doesn't
render native form control internals (`<select>` text came back blank), which disqualifies
it for an app whose settings UI is mostly `<select>`s. The capture step still lives behind
a single function in the generator, so swapping methods later stays a one-function change.

The script fails loudly (nonzero exit) if any manifest tag isn't found within a timeout
— that's the drift detector: a UI change that silently orphans a doc image breaks the
generator run instead of shipping a stale picture.

### 5. Markdown stays plain markdown

No custom shortcode. Docs authors write ordinary
`![Add tracker dialog](/img/generated/settings/add-tracker-dialog.svg)` (or `.png`,
depending on which capture path won), identical to how the MapShare setup page
already embeds images. The manifest — not the markdown — encodes selectors and setup
steps, so prose stays clean.

### 6. Rebuild workflow

`npm run docs:shots` regenerates everything into `site/static/img/generated/`; output is
committed like the existing hand-taken PNGs. Hugo's own build stays untouched (still
just serving static files, no Playwright dependency at doc-build time). A `--check` mode
cross-references manifest ↔ generated files ↔ markdown references, so a stale or
typo'd image path is a fast lint failure rather than a broken doc page.

A CI job that runs `docs:shots` against a preview deploy and fails on
`git diff --exit-code site/static/img/generated` is a natural phase 2 (catches "UI
changed, screenshot wasn't regenerated" automatically) — not required for v1.

## Open items — resolved

- **`dom-to-svg` spike: dropped.** Tried it against the real "Add tracker" dialog
  (`settings.add-tracker-dialog`). It has no prebuilt browser bundle (imports `postcss`
  as a bare specifier), so it needed bundling via esbuild first — already a wrinkle. Once
  bundled and run, its output was structurally reasonable (correct colors, text, borders,
  button styling from the CSS custom properties) but **native form control internals
  don't render**: every `<select>` (tracker type, aircraft, pilot) came back as an empty
  box with no visible option text, because `dom-to-svg` walks the DOM tree and has no way
  to render a native widget's internal painting. Since nearly every settings dialog in
  this app is built from `<select>`s, this isn't a one-off gap — standardized on
  Playwright's native `elementHandle.screenshot()` (PNG) as the only capture path per the
  design's own fallback instruction. `dom-to-svg` was not added as a dependency.
- **Fixture dataset shape: landed as** 2 aircraft, 2 pilots, 2 trackers, one settings
  `app_name` override ("Wingbeat Demo"), checked in as `site/scripts/doc-shots-seed.sql`.
  Enough for list/dialog UI to show realistic multi-row state without padding. No
  flights/points yet — add them if a manifest entry needs the map or flight list.
- **Fixture/auth ended up not needing a runtime gate at all.** Rather than a
  `?docShots=1`-style flag reachable in `src/index.ts`, the generator seeds a known
  invite token into an ephemeral `wrangler dev --local` D1 (never the real database) and
  calls the real `POST /join/:token` handler to mint a session — zero new auth-bypass
  code shipped to production.
