-- The basemaps a map offers are tenant data (docs/tenant-basemaps-plan.md), not code.
-- `key` is the id clients use: an overlay's default_enabled_by_basemap, a device's chosen
-- basemap and its color corrections. tile_proxy names a keyed provider in core's
-- KEYED_TILE_PROVIDERS; only scripts/basemaps-legacy.sql sets it, never the API.
CREATE TABLE IF NOT EXISTS basemaps (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT    NOT NULL UNIQUE,
  label         TEXT    NOT NULL,
  kind          TEXT    NOT NULL DEFAULT 'raster' CHECK (kind IN ('raster', 'vector')),
  url           TEXT    NOT NULL,
  attribution   TEXT,
  max_zoom      INTEGER,
  detect_retina INTEGER NOT NULL DEFAULT 0,
  shown         INTEGER NOT NULL DEFAULT 1,
  tile_proxy    TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- The starting state of a new tenant: one basemap whose terms clearly allow commercial use
-- (public domain). Existing tenants get their old basemaps from scripts/basemaps-legacy.sql.
INSERT INTO basemaps (key, label, url, attribution, max_zoom, sort_order) VALUES
  ('usgstopo', 'USGS Topo',
   'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
   'Tiles courtesy of the <a href="https://www.usgs.gov/" target="_blank">U.S. Geological Survey</a>',
   16, 0);
