-- Points a tenant's vector map at the North America archive (zoom 0-14) in place of the Alaska
-- one (zoom 0-13). Its key and label stay, so overlays' per-basemap defaults and devices' saved
-- choices still match. Not a migration: it's tenant data.
--   scripts/d1-query.mjs --customer <tenant> --env <env> --file scripts/basemaps-north-america.sql
-- Safe to run twice (docs/tenant-basemaps-plan.md, "Protomaps hosting").
UPDATE basemaps SET url = 'https://tiledata.dummthings.dev/pmtiles/north-america-basemap.pmtiles', max_zoom = 14
WHERE url = 'https://tiledata.dummthings.dev/pmtiles/alaska-basemap.pmtiles';
