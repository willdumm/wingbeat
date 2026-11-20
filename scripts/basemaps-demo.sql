-- The demo tenant's basemaps (docs/tenant-basemaps-plan.md): USGS Topo (migration 0010's row,
-- left as it is) plus USGS Imagery Topo, both public domain. Not a migration: it's tenant data.
-- scripts/demo-seed.mjs includes it for a freshly seeded demo D1. For one seeded before
-- basemaps became tenant data, run it alone:
--   scripts/d1-query.mjs --customer demo --env <env> --file scripts/basemaps-demo.sql
-- Safe to run twice (it replaces the row by key). The demo's Protomaps Alaska basemap (a
-- vector row, for the app) is added in Settings > Basemaps once its PMTiles archive is hosted.
INSERT OR REPLACE INTO basemaps (key, label, kind, url, attribution, max_zoom, shown, sort_order)
VALUES
  ('usgsimagerytopo', 'USGS Imagery Topo', 'raster', 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
   'Tiles courtesy of the <a href="https://www.usgs.gov/" target="_blank">U.S. Geological Survey</a>',
   16, 1, 1);
