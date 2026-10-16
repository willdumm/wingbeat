# Frontend Patterns & Gotchas

## iOS Scroll in Full-Screen Overlays

**Problem:** Any `position: fixed; overflow-y: auto` overlay will be completely unscrollable on iOS, regardless of CSS (`-webkit-overflow-scrolling`, `overscroll-behavior`, `overflow-y: scroll`, etc.).

**Root cause:** `src/dashboard/scripts/init.ts` (and its analytics equivalent in `src/analytics/scripts/map.ts`) registers a global `touchmove` handler with `{ passive: false }` and calls `e.preventDefault()` on touches outside known scrollable areas. This cancels the scroll gesture at the JS level before the browser ever tries to scroll anything — no CSS property can override a `preventDefault()`.

**Fix:** Add the overlay's CSS class to the `closest()` allowlist in the handler:

```js
// src/dashboard/scripts/init.ts
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('#flight-list, .settings-view, .form-modal, #alerts-strip, header, #mobile-topnav, .map-controls-bar, .overlay-legend-panel')) {
    e.preventDefault();
  }
}, { passive: false });
```

**Rule:** Any time a new scrollable overlay is introduced, add its class to this selector in both `init.ts` and `map.ts` (analytics). The handler exists to prevent iOS rubber-banding of the fixed-layout dashboard behind the overlay — the allowlist is the only safe escape hatch.

## Checking form layout at phone width (and simulating iOS)

`site/scripts/preview-form.mjs` renders a markup snippet with the dashboard's real
stylesheet (`themeVars()` + `dashboardPageStyles()`) in headless Chromium at phone width,
prints each form control's box (filled or empty, x range, height), reports any two that
overlap and saves a screenshot. No dev server, login or data needed:

```bash
nix develop path:./nix --command node site/scripts/preview-form.mjs --ios --width 375 \
  --out <scratch>/shot.png <scratch>/snippet.html
```

The snippet is body markup: a `.form-modal > .form-modal-panel > .form-modal-body` holding
the `.form-field` / `.form-field-row` markup copied from the JS that builds the dialog
(e.g. `_dutyOpenDayForm()` in `src/shared/pilot-duty.ts`). Give the controls ids, and a
`value` on some, to compare filled and empty fields.

**iOS.** None of the browsers we can run here reproduce iOS Safari's date/time inputs:
Playwright's WebKit doesn't launch on this machine, and wouldn't draw iOS's native
controls anyway. The quirk that matters is WebKit bug 301648: iOS sizes date/time inputs
as `content-box` whatever `box-sizing` or `appearance` say, so `width: 100%` plus padding and
border overflows. `--ios` simulates that by forcing `content-box` on those inputs and turning
on the iOS-only rules (`@supports (-webkit-touch-callout: none)` in
`formControlStyles()`). Limits: Chromium has no `::-webkit-date-and-time-value`, so rules on
it (the value's inset and height on iOS) don't show, and Chromium's own date/time controls
are a little taller than text inputs. Confirm iOS fixes on a phone (deploy to staging).

**Browsers on NixOS.** Playwright's downloaded browsers don't run here, and the flake's
`chrome-headless-shell` crashes on these pages. Launch the flake's full Chromium with
`executablePath` (as `preview-form.mjs` and `gen-doc-shots.mjs` do), from inside
`nix develop path:./nix` so `PLAYWRIGHT_BROWSERS_PATH` is set.
