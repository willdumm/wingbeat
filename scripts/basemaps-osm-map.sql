-- Turns a tenant's `map` basemap (CARTO's raster tiles, until the Worker stopped proxying them)
-- into the OpenStreetMap vector map, first in the picker and so the default. It keeps its key, so
-- overlays' per-basemap defaults and devices' saved choices still match.
-- Not a migration: it's tenant data. Run it on each tenant that has that row, just before
-- deploying the version without the tile proxy:
--   scripts/d1-query.mjs --customer <tenant> --env <env> --file scripts/basemaps-osm-map.sql
-- Safe to run twice. The archive covers North America to zoom 14 (docs/tenant-basemaps-plan.md).
UPDATE basemaps SET
  label = 'Map', kind = 'vector', url = 'https://tiledata.dummthings.dev/pmtiles/north-america-basemap.pmtiles',
  attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://protomaps.com">Protomaps</a>',
  max_zoom = 14, detect_retina = 0, shown = 1, tile_proxy = NULL, sort_order = 0
WHERE key = 'map';
