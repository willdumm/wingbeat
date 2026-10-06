# Frontend Patterns & Gotchas

## iOS Scroll in Full-Screen Overlays

**Problem:** Any `position: fixed; overflow-y: auto` overlay will be completely unscrollable on iOS, regardless of CSS (`-webkit-overflow-scrolling`, `overscroll-behavior`, `overflow-y: scroll`, etc.).

**Root cause:** `src/dashboard/scripts/init.ts` (and its analytics equivalent in `src/analytics/scripts/map.ts`) registers a global `touchmove` handler with `{ passive: false }` and calls `e.preventDefault()` on touches outside known scrollable areas. This cancels the scroll gesture at the JS level before the browser ever tries to scroll anything — no CSS property can override a `preventDefault()`.

**Fix:** Add the overlay's CSS class to the `closest()` allowlist in the handler:

```js
// src/dashboard/scripts/init.ts
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('#flight-list, .settings-modal, .pilot-duty-modal, .bulk-edit-modal, .aircraft-info-modal')) {
    e.preventDefault();
  }
}, { passive: false });
```

**Rule:** Any time a new scrollable overlay is introduced, add its class to this selector in both `init.ts` and `map.ts` (analytics). The handler exists to prevent iOS rubber-banding of the fixed-layout dashboard behind the overlay — the allowlist is the only safe escape hatch.
