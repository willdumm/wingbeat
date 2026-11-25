-- The demo tenant's basemaps (docs/tenant-basemaps-plan.md): a Protomaps vector map of
-- Alaska, first and so the default, then USGS Topo (migration 0010's row), public domain. The
-- vector map is an OpenStreetMap extract to zoom 13, hosted with its fonts and sprites on
-- tiledata.dummthings.dev ("Protomaps hosting" in the plan). No imagery: USGS retired its
-- Imagery Topo service, its imagery-only one has no tiles at Kodiak's zooms 9-11, and Esri's
-- terms need a key for commercial use. Not a migration: it's tenant data. scripts/demo-seed.mjs
-- includes it for a freshly seeded demo D1. For one seeded before basemaps became tenant data,
-- or one that still has the old imagery row, run it alone:
--   scripts/d1-query.mjs --customer demo --env <env> --file scripts/basemaps-demo.sql
-- Safe to run twice (it replaces the rows by key).
UPDATE basemaps SET sort_order = 1 WHERE key = 'usgstopo';
DELETE FROM basemaps WHERE key = 'usgsimagerytopo';
INSERT OR REPLACE INTO basemaps (key, label, kind, url, attribution, max_zoom, shown, sort_order)
VALUES
  ('alaska', 'Map', 'vector', 'https://tiledata.dummthings.dev/pmtiles/alaska-basemap.pmtiles',
   '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://protomaps.com">Protomaps</a>',
   13, 1, 0);
