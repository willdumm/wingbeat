-- Gives an existing tenant the basemaps it had before basemaps became tenant data
-- (docs/tenant-basemaps-plan.md): the five old built-ins, with their old keys and order, so
-- overlays' per-basemap defaults, devices' saved choices and color corrections still match.
-- Map, Topo and Satellite stay in the picker (the old default); the two USGS ones are
-- configured but hidden. Map is the CARTO Voyager layer, proxied by the Worker under its key
-- (tile_proxy; its url here is the proxy path, never the upstream template).
--
-- Not a migration: it's tenant data. Run it once per production tenant, right after
-- migration 0010 in the same deploy, so no tenant sees the bare default:
--   scripts/d1-query.mjs --customer <tenant> --env production --file scripts/basemaps-legacy.sql
-- Safe to run twice: it replaces these five rows by key.
INSERT OR REPLACE INTO basemaps (key, label, kind, url, attribution, max_zoom, detect_retina, shown, tile_proxy, sort_order)
VALUES
  ('map', 'Map', 'raster', '/api/tiles/map/{z}/{x}/{y}{r}.png',
   '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
   18, 0, 1, 'carto', 0),
  ('topo', 'Topo', 'raster', 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
   'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA)',
   17, 0, 1, NULL, 1),
  ('usgstopo', 'USGS Topo', 'raster', 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
   'Tiles courtesy of the <a href="https://www.usgs.gov/" target="_blank">U.S. Geological Survey</a>',
   16, 0, 0, NULL, 2),
  ('usgsimagerytopo', 'USGS Imagery Topo', 'raster', 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
   'Tiles courtesy of the <a href="https://www.usgs.gov/" target="_blank">U.S. Geological Survey</a>',
   16, 0, 0, NULL, 3),
  ('satellite', 'Satellite', 'raster', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
   'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
   18, 1, 1, NULL, 4);
