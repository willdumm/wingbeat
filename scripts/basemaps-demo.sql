-- The demo tenant's basemaps (docs/tenant-basemaps-plan.md): USGS Topo (migration 0010's row,
-- left as it is) plus USGS Imagery Topo, both public domain, and the app's Protomaps Alaska map
-- (a vector row, so the web doesn't list it): an OpenStreetMap extract to zoom 13, hosted with
-- its fonts and sprites on tiledata.dummthings.dev ("Protomaps hosting" in the plan). Not a
-- migration: it's tenant data. scripts/demo-seed.mjs includes it for a freshly seeded demo D1.
-- For one seeded before basemaps became tenant data, run it alone:
--   scripts/d1-query.mjs --customer demo --env <env> --file scripts/basemaps-demo.sql
-- Safe to run twice (it replaces the rows by key).
INSERT OR REPLACE INTO basemaps (key, label, kind, url, attribution, max_zoom, shown, sort_order)
VALUES
  ('usgsimagerytopo', 'USGS Imagery Topo', 'raster', 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
   'Tiles courtesy of the <a href="https://www.usgs.gov/" target="_blank">U.S. Geological Survey</a>',
   16, 1, 1),
  ('alaska', 'Alaska Map', 'vector', 'https://tiledata.dummthings.dev/pmtiles/alaska-basemap.pmtiles',
   '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://protomaps.com">Protomaps</a>',
   13, 1, 2);
