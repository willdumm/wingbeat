# Web maps on MapLibre

The web's maps move from Leaflet to MapLibre GL JS, the renderer the app already uses
(`@maplibre/maplibre-react-native`). This replaces "Web: don't migrate yet" in
`docs/mobile-app-plan.md` (Decision 3).

## Why

- **Vector PMTiles basemaps on the web.** A vector basemap (a Protomaps archive) is "mobile app
  only" today (`src/shared/basemap-settings.ts`): Leaflet can't draw `@protomaps/basemaps`
  styles. MapLibre takes the style the app already builds.
- **Native layers instead of hand-rolled ones.** The elevation tint becomes a `color-relief`
  layer on a `raster-dem` source (the app's), replacing the canvas `L.GridLayer` and its
  zoom-clamp workarounds. The heatmaps become `heatmap` layers instead of leaflet.heat 0.2.0
  (unmaintained since 2015). The per-basemap color correction becomes `raster-saturation` /
  `raster-contrast` / `raster-brightness-*` on the basemap layer, not a CSS filter on Leaflet's
  whole tile pane.
- **Shared map code.** The style builder, the layer specs and the GeoJSON feature builders move
  into `@wingbeat/core`, so both platforms draw the same map from the same code. The chrome,
  interaction and editors stay per platform (DOM vs React Native).
- **Later:** hillshade or 3D terrain from the same DEM, FAA sectionals as raster PMTiles.

## Decisions (from the user, 2026-11-23)

- Do it, on one branch (`web-maplibre`) for every phase.
- Phases 0–3 first; the user tests them on staging before phases 4–6.
- Local commits only until the user says to push.

## Library

**MapLibre GL JS 5.24.1** from unpkg, SRI-pinned like Leaflet, as a classic `<script>`
(`window.maplibregl`). 6.x is ESM-only (no UMD build), and the pages' scripts are classic
inline scripts in an IIFE that run before a module script would; moving to 6.x means loading
the page scripts as modules or bundling MapLibre ourselves, a separate change. 5.24.1 is the
5.x line's attribution-sanitizing security release. It needs WebGL2 or WebGL1, and its worker
is a `blob:` URL, which the CSP's `worker-src 'self' blob:` already allows.

`pmtiles://` sources go through pmtiles.js's `Protocol` (`maplibregl.addProtocol('pmtiles',
…)`); the pages already load pmtiles.js for the elevation tool. `@protomaps/basemaps` (the
vector style's layers, JavaScript only) becomes a dependency of core, as the app has it, and
reaches the pages through the core bundle.

Size: about 276 KB gzipped, against about 40 KB for Leaflet. Both load on a page while any of
its maps is still Leaflet (phases 1–5).

## Phases

The maps are independent (dashboard, analytics, the settings modal's regions editor, named
points editor and map-view picker, the docs showcase), so they move one at a time. The shared
map chrome (`src/shared/map-controls.ts`) gets a MapLibre version beside the Leaflet one until
the last Leaflet map moves. A render chunk the showcase calls moves together with its showcase
demo, since `npm run docs:showcase` renders it.

### Phase 0: map code into core

- `packages/core/src/map-style.ts` (from `apps/mobile/src/lib/map-style.ts`): `MapBasemap`,
  `availableBasemaps`, `defaultBasemapId`, `vectorAssetsBase`, `defaultOverlayIds`,
  `tileUrls`, `mapStyle` (was `liveMapStyle`), plus the per-basemap color correction as raster
  paint properties. Core's own minimal style-spec types (core has no MapLibre dependency);
  each platform's MapLibre types accept them.
- `packages/core/src/map-layers.ts`: the layer specs both maps draw (tracks, ground trails,
  positions, planes, heading arrows) and the elevation `color-relief` paint from
  `elevationRampStops`.
- The app imports them from core; its map looks the same. Tests in `test/`.

### Phase 1: MapLibre map chrome

- `src/shared/maplibre.ts`: the script and stylesheet tags, the `pmtiles://` protocol, and a
  `createMap()` helper that builds a map from `mapStyle()` with the page's basemaps.
- `src/shared/map-controls.ts`: the basemap switcher, overlay legend, attribution and color
  correction for a MapLibre map. Switching basemap or overlays is `map.setStyle(…, { diff:
  true })` from core's `mapStyle()`, keeping the page's own sources and layers (they're added
  back on `style.load`).
- Vector basemaps appear in the web's switcher; the "mobile app only" note goes.

### Phase 2: the dashboard map

`track-render.ts`, `hover.ts`, `live.ts`, `day-view.ts`, `point-picker.ts`,
`location-popup.ts`, `state.ts`, `init.ts`, the sidebar toggle's resize, and the showcase's
dashboard demos:

- Tracks, trails and positions become GeoJSON sources with core's layer specs; highlight and
  hover through `feature-state`. Coordinates flip to `[lon, lat]`.
- Plane icons, numbered end markers and the hover arrow are DOM `maplibregl.Marker`s (the
  existing `divIcon` HTML).
- Hover snapping keeps `nearestPointIdx`, with `map.project()` for container points.

### Phase 3: the elevation tool

A `raster-dem` source on Mapterhorn's archive and a `color-relief` layer under the tracks, its
ramp from core. The cursor readout and tap-to-set-reference keep pmtiles.js's `getZxy` decode
(no terrain needed). The DEM attribution comes from the source's `attribution`.

**Staging check after phase 3.** Dashboard: every basemap kind (raster, keyed `/api/tiles`,
vector PMTiles), overlays, color correction, live positions and tracks, hover, day view, point
picker, the elevation tool, phone width and touch. Analytics and the settings maps are still
Leaflet.

### Phase 4: analytics

Endpoint and path-density heatmaps as `heatmap` layers (core's `endpointHeatPoints`,
`interpolateRoutePoints`), flight lines, the regions overlay and its info popup; the
showcase's analytics demo. The page stops loading leaflet.heat.

### Phase 5: the settings maps

The named points editor, map-view picker, then the regions editor (vertex handles as draggable
DOM markers, polygons as fill and line layers, midpoint insert, snap and merge). Its touch
handling needs a phone check.

### Phase 6: Leaflet removed

Drop Leaflet's tags, the Leaflet branch of `map-controls.ts`, `.leaflet-*` CSS, and the CSP
comment's Leaflet note; check the doc-shot manifest and re-run `npm run docs:shots`.

## Risks

- `[lat, lon]` to `[lon, lat]` everywhere: the likeliest bugs.
- Headless WebGL for the showcase and doc shots (Playwright's Chromium uses SwiftShader):
  slower, and the showcase's shadow roots need MapLibre's CSS adopted into each root.
- Browsers without WebGL get no map. MapLibre fires an error; the map area says so.

## Progress

- **Phase 0: done.** `packages/core/src/map-style.ts` (moved from the app, `liveMapStyle` is now
  `mapStyle`, plus `mapColorPaint` and a `color` option) and `map-layers.ts` (track, trail,
  position, plane, arrow, elevation relief and reference layers; `ELEVATION_DEM_SOURCE`). The
  app uses both; its jest test moved to `test/core-map-style.test.mjs`. Core depends on
  `@protomaps/basemaps` (and on `@maplibre/maplibre-gl-style-spec` for types only); the app's
  lockfile entry for core lists them. The app's GeoJSON feature builders
  (`apps/mobile/src/lib/live.ts`) stay in the app until phase 2 shows whether the web's
  tracks fit them.
- **Phase 1: next.** Design:
  - Page head: maplibre-gl 5.24.1 from unpkg with SRI
    (`sha384-nXMl9YiLoSG5KBPTFgvxVuIqQQcqIvo0bFrvoEaGJC6r7IibIzF1S36Zbf/sKBtL` for
    `dist/maplibre-gl.js`, `sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK`
    for `dist/maplibre-gl.css`), beside Leaflet until phase 6.
  - Bind core's `mapStyle` and layer builders in `src/client/core-entry.ts`.
  - The page needs the vector basemaps too: inline `window.APP_VECTOR_BASEMAPS` beside
    `APP_BASEMAPS` (`clientBasemaps()` in `src/index.ts` already splits them), and have Settings
    (`basemap-settings.ts`) update it with `_ftPresets`. Keep `_ftPresets` raster-only for the
    Leaflet maps.
  - A MapLibre map keeps `{ basemapId, overlay ids }` and restyles with `map.setStyle(mapStyle(…),
    { transformStyle })`, carrying over every source and layer that isn't `background`,
    `basemap-*` or `overlay-*` (the page's own). Images (plane, arrow) re-added on
    `styleimagemissing`. Color correction goes into the style (`color`), so
    `_ftApplyActiveLayerColor()` also restyles MapLibre maps.
  - New `maplibreMapControlsScripts()` / `maplibreOverlayLegendMountScript()` beside the
    Leaflet ones in `map-controls.ts`, sharing the attribution sanitizer (attribution from the
    style's sources: basemap, overlays, then the page's, e.g. the DEM). `_ftCurrentBasemapId()`
    and `_ftApplyActiveLayerColor()` select `[data-basemap]` on either kind of container.
  - Drop "mobile app only" from the vector option in `basemap-settings.ts`.
