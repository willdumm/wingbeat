# Tenant basemaps

The basemaps a map offers become tenant settings, saved in D1 like tile overlays, instead of
the built-in `BASEMAP_PRESETS` list in `packages/core/src/basemaps.ts`. Admins add, edit,
hide, reorder and remove them in Settings. A new tenant starts with one basemap whose terms
clearly allow commercial use. Existing production tenants keep what they have.

## Why

A licensing check before the App Store submission (2026-11-20) found that two built-in
basemaps aren't safe for a paid hosted service as built:

- **CARTO Voyager** (`map`, since removed): our Worker proxied and cached its tiles under one shared key for
  every tenant (`/api/tiles/:providerId`). CARTO's basemap terms forbid proxying, caching and
  serving tiles to others, and from 2026-12-01 older keys lose the free commercial tier.
- **Esri World Imagery** (`satellite`): fetched straight from `server.arcgisonline.com` with no
  ArcGIS account or key. Esri's terms appear to need a key or plan for commercial use.
- **OpenTopoMap** (`topo`) is licensed for commercial use (CC-BY-SA) but runs on a small
  donation-funded server. It's not a good default for a hosted service.
- **USGS Topo / USGS Imagery Topo** are public domain. They're fine.
- **Mapterhorn** (the elevation tool's DEM) needs credit to its sources, and none is shown.

Operators who want Esri imagery or anything else can add it themselves, under their own
agreement with the provider, the way CalTopo lets users add layers.

## Decisions (from the user, 2026-11-20)

- The basemap list is tenant data, not code. Admins can add basemaps the way they add
  overlays, tenant-wide.
- Which basemaps appear in the map's picker is a tenant setting too. The per-device
  "enabled layers" list and the per-device custom basemaps on the web go away. A device still
  picks which basemap is showing, and keeps its own color corrections.
- A new tenant gets a single default: **USGS Topo**.
- Existing production tenants don't change. The demo tenant drops the others and keeps its two
  dummthings.dev-hosted overlays (tenant rows, untouched).
- The app gets a **Protomaps** OpenStreetMap vector basemap, **mobile only** for now. It's an
  extract covering **North America** (Alaska only until 2026-11-25), hosted in our own R2
  (Protomaps' hosted API is free only for non-commercial use; the tiles are an ODbL Produced Work and need OpenStreetMap credit).
- Mapterhorn gets credited wherever the elevation tool is on, on web and mobile.
- As much as possible is server-side. What the app needs ships as an OTA update to build 8
  (JavaScript only: no new native modules, so the fingerprint doesn't change).

## Data model

Migration `migrations/0010_tenant_basemaps.sql`:

```sql
CREATE TABLE IF NOT EXISTS basemaps (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT    NOT NULL UNIQUE,  -- the id clients use: overlays' default_enabled_by_basemap,
                                          -- a device's chosen basemap, its color corrections
  label         TEXT    NOT NULL,
  kind          TEXT    NOT NULL DEFAULT 'raster' CHECK (kind IN ('raster', 'vector')),
  url           TEXT    NOT NULL,         -- raster: tile template; vector: an https .pmtiles archive
  attribution   TEXT,                     -- sanitized HTML, like tile_overlays.attribution
  max_zoom      INTEGER,
  detect_retina INTEGER NOT NULL DEFAULT 0,
  shown         INTEGER NOT NULL DEFAULT 1,  -- in the map's picker
  tile_proxy    TEXT,                     -- unused since the tile proxy was removed ("Keyed tiles")
  sort_order    INTEGER NOT NULL DEFAULT 0
);
INSERT INTO basemaps (key, label, url, attribution, max_zoom, sort_order) VALUES
  ('usgstopo', 'USGS Topo',
   'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
   'Tiles courtesy of the <a href="https://www.usgs.gov/" target="_blank">U.S. Geological Survey</a>',
   16, 0);
```

The keys of the old presets (`map`, `topo`, `usgstopo`, `usgsimagerytopo`, `satellite`) are
kept for the rows that replace them, so existing overlays' per-basemap defaults, devices'
saved choices (`ft_map_basemap`, the app's `map` pref) and color corrections still match.

The default row is part of the schema's starting state, like a default setting, so it goes
in the migration. Anything tenant-specific goes in scripts, never in migrations (README,
"Database migrations").

## Existing tenants and the demo

- **Production tenants:** `scripts/basemaps-legacy.sql` adds the four other old presets with
  their old keys and order (`map`, `topo`, `usgstopo`, `usgsimagerytopo`, `satellite`).
  `map`, `topo` and `satellite` are shown (the old `DEFAULT_ENABLED_BASEMAPS`), and the USGS
  rows are configured but hidden. `map` gets `tile_proxy = 'carto'`. Run it on each production
  tenant right after the migration, in the same deploy, so no tenant sees the bare default.
- **Per-device custom basemaps** on the web live in each browser's localStorage, so the server
  can't carry them over. Tell operators before the deploy; an admin re-adds any they need as
  tenant basemaps.
- **Demo tenant:** a script (or a `demo-seed.mjs` step) leaves USGS Topo, adds USGS Imagery
  Topo and the Protomaps vector basemap (North America; Alaska only until 2026-11-25), and
  removes nothing else (it has no legacy rows).

## Keyed tiles (CARTO)

**Removed** (the web-maplibre branch): CARTO, the `/api/tiles` proxy, `KEYED_TILE_PROVIDERS`,
`CARTO_API_KEY` and `scripts/basemaps-legacy.sql` are gone. `scripts/basemaps-osm-map.sql` turns
a tenant's `map` row into the OpenStreetMap vector map, under the same key, and has to run before
that version is deployed. The `tile_proxy` column stays, unused, until a later release drops it
(a destructive migration takes two releases). What follows is how it was.

Core keeps a small registry in place of `BASEMAP_PRESETS`:
`KEYED_TILE_PROVIDERS = { carto: { url: '…voyager/{z}/{x}/{y}{r}.png?key={KEY}', secretEnvVar: 'CARTO_API_KEY' } }`.
`/api/tiles/:key/...` looks up the tenant's row by `key`, requires `tile_proxy`, and takes
the upstream template from the registry, never from the row, so an admin can't point the
Worker's secret at another URL. A proxied row is left out of the client list when the secret
isn't set (as now). The API can't set `tile_proxy`, only the legacy script can.

## API

`packages/core/src/api/basemaps.ts` and `basemaps-requests.ts`, following overlays:

- `GET /api/basemaps`: every row, hidden ones included, in `sort_order`.
- `POST /api/basemaps` (admin): `label`, `kind`, `url`, `attribution`, `max_zoom`, `shown`. The
  server makes `key` from the label (a unique slug) and never changes it.
- `PUT /api/basemaps/:id` (admin): any of those fields. `PUT /api/basemaps/order` (admin):
  `{ ids }`.
- `DELETE /api/basemaps/:id` (admin).
- Refuse (409) hiding or deleting the last shown raster basemap: the web map needs one.
- Validation: a raster `url` needs `{z}`, `{x}` and `{y}` (`validOverlayUrl`); a vector `url`
  must be an `https://` `.pmtiles` URL. The request schema strips `tile_proxy`.
- Each route gets a response schema and a response-shape test in `test/worker-sql.test.mjs`.

`GET /api/bootstrap`:

- `basemaps` keeps its shape (`Basemap` in `api/bootstrap.ts`, `id` = `key`) and lists only the
  shown **raster** rows. Build 8 reads it as is, and would try to draw a vector row as raster
  tiles.
- New optional `vector_basemaps`: the shown vector rows (`id`, `label`, `url`,
  `attribution`, `maxZoom`). Only the updated app reads it.

## Web

- `mapLayersRuntimeScript()` inlines the tenant's shown raster rows instead of
  `envBasemapPresets(env)`. Drop `_ftGetEnabledIds`, `_ftGetCustomLayers` and the
  `ft_map_layers_enabled` / `ft_map_layers_custom` keys (clear them once on load).
  `sharedTileLayerDefs` falls back to the first shown basemap.
- Settings > "Map layers" keeps the per-device color sliders for each shown basemap and loses
  the add-layer form and the delete buttons.
- Instance settings gets a "Basemaps" section next to Overlays (`src/shared/settings.ts`, about
  line 313): list, add, edit, show/hide, reorder, delete, and "Look up details" through
  `/api/tile-metadata`. Vector rows are listed with a "mobile app only" note.
- The overlay forms' per-basemap default checkboxes (settings.ts, about line 691) list the
  tenant's basemaps instead of the presets.
- The docs-site showcase (`src/showcase/scripts.ts`, `site/layouts/home.html`) stops using
  `staticSiteBasemapPresets()` and the public CARTO key, and shows USGS Topo and USGS Imagery
  Topo. Re-run `npm run docs:showcase` and check the doc-shot manifest.

## App (OTA update)

- `apps/mobile/src/lib/map-style.ts`: offer `vector_basemaps` after the raster ones. A vector
  basemap is a MapLibre vector source with `url: 'pmtiles://' + url` (the app already reads
  PMTiles this way for the DEM, `elevation-tool.tsx:125`), and layers from `@protomaps/basemaps`
  (`layers('protomaps', namedFlavor('white'), { lang: 'en' })`, a JavaScript-only package).
  Glyphs and sprites come from Protomaps' `basemaps-assets`, copied into the same R2 bucket.
- The default basemap is the first one the server sends. Drop `DEFAULT_ENABLED_BASEMAPS` and
  the `clientBasemapPresets` fallback (servers older than `basemaps` are gone).
- The picker lists raster and vector basemaps together, in the server's order.

## Mapterhorn credit

`DEM_ATTRIBUTION` in `packages/core/src/elevation.ts`:
`Elevation: <a href="https://mapterhorn.com/attribution">Mapterhorn</a>, including © DLR e.V.
2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European
Union and ESA` (the credit Copernicus GLO-30, part of Alaska's DEM, requires). The web's tint layer
carries it, so the map's attribution row shows it while the elevation tool is on (the page
script is served by the Worker, so this is server-side). The app sets it as the
`RasterDEMSource`'s attribution, in the OTA update.

## Protomaps hosting

```sh
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles north-america.pmtiles \
  --region=scripts/north-america.geojson --maxzoom=14
```

The region crosses the antimeridian (the western Aleutians), so it needs a GeoJSON
MultiPolygon with one part on each side, not a single `--bbox`: `scripts/north-america.geojson`
is a rough one (rectangles from 7°N, so Panama and South America's north coast, to the
Arctic, with Hawaii, the Caribbean, Greenland and the Aleutians; about 18 GB at zoom 14,
measured 2026-11-25). `pmtiles extract` can't resume a dropped download, and
`wrangler r2 object put` stops at 300 MiB, so the upload is a multipart one through R2's S3
API. Upload it, with the
`basemaps-assets` fonts and sprites, to the R2 bucket that serves the dummthings.dev overlays.
That bucket's CORS must allow range requests from the app. Credit:
`© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://protomaps.com">Protomaps</a>`.
Hosted (2026-11-20): an Alaska extract made earlier (2026-11-04 OSM data, basemap v4.15.2,
zoom 0–13) was already in the `kodiak-imagery` R2 bucket as
`https://tiledata.dummthings.dev/pmtiles/alaska-basemap.pmtiles`, with CORS and range requests
working, so it's reused; the `basemaps-assets` fonts (all four fontstacks, with `OFL.txt`) and
`sprites/v4` are beside it under `pmtiles/basemaps-assets/`. That bucket is public. To refresh
an extract, make a new one as above and upload it over the same key.

**North America (2026-11-25):** the whole-continent extract (2026-11-24 OSM data, basemap
v4.15.2, zoom 0–14) goes under `pmtiles/north-america-basemap.pmtiles`, and
`scripts/basemaps-north-america.sql` moves a tenant's vector row to it; upload and check the
archive before running that or either of the other basemap scripts. Keep the Alaska archive:
devices hold its URL until they next load their settings, and it's the way back.

The app finds a vector basemap's glyphs and sprites at `basemaps-assets/` beside its archive
(`vectorAssetsBase()` in `apps/mobile/src/lib/map-style.ts`): `<dir>/north-america-basemap.pmtiles`,
`<dir>/basemaps-assets/fonts/{fontstack}/{range}.pbf` and
`<dir>/basemaps-assets/sprites/v4/white.{json,png}` (and `white@2x`). Once it's hosted, an
admin adds the vector row in Settings > Basemaps (or the demo script does) with the credit
below.

## Built (2026-11-20)

Migration `0010`, `/api/basemaps`, Settings > Basemaps (`src/shared/basemap-settings.ts`),
`scripts/basemaps-legacy.sql`, `scripts/basemaps-demo.sql` (also in `demo-seed.mjs sql`), the
showcase on USGS tiles, the Mapterhorn credit on web and app, and the app's vector basemap
(`@protomaps/basemaps`; the Expo fingerprint is unchanged). The Protomaps archive and its
assets are hosted, and `scripts/basemaps-demo.sql` gave the demo its Alaska vector row (the
North America one since 2026-11-25; its key is still `alaska`, so saved choices keep matching).

## Rollout

1. Code, migration, scripts and tests, locally (no pushes until the user says so).
2. Staging: deploy, run the legacy script on the staging tenants, seed the staging demo, and
   check web and the app (a preview-channel OTA) against it.
3. Production deploy, legacy script and demo seed, and the production OTA update, each with the
   user's approval.
4. After that, update `docs/app-store-listing.md` (the description's "street map, satellite
   imagery, terrain") and section 5 of the App Review notes ("Map tiles come from USGS and
   OpenStreetMap via Protomaps, each credited on the map").
