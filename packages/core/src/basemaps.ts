/**
 * Basemap helpers shared by the Worker and the clients: the fallback, URL validation, and the
 * per-basemap overlay defaults. The basemaps themselves are tenant data (the `basemaps` table,
 * docs/tenant-basemaps-plan.md).
 */

/** A raster basemap as a client draws it (`Basemap` in api/bootstrap.ts). */
export interface BasemapPreset {
  id: string;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
  /** Only set true when `url` actually contains `{r}` — otherwise Leaflet's retina
   * fallback silently fetches tiles a zoom level deeper (4x the requests on retina
   * screens) instead of real @2x tiles, which is what overloaded OpenTopoMap's
   * server and caused gray tiles on iPad/iPhone. */
  detectRetina?: boolean;
  /** Its place among the tenant's shown basemaps, both kinds (the app merges the two lists by it). */
  order?: number;
}

/**
 * What a client draws when the tenant has no shown
 * raster basemap, so a map never has zero layers. USGS data is public domain.
 */
export const FALLBACK_BASEMAP: BasemapPreset = {
  id: 'usgstopo',
  label: 'USGS Topo',
  url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles courtesy of the <a href="https://www.usgs.gov/" target="_blank">U.S. Geological Survey</a>',
  maxZoom: 16,
};

/** The subdomains a `{s}` in a basemap's `url` takes (Leaflet's default `subdomains`). */
export const TILE_SUBDOMAINS: readonly string[] = ['a', 'b', 'c'];

/** Whether `url` is an absolute URL with `{z}`, `{x}` and `{y}` placeholders. */
export function validTileTemplate(url: unknown): url is string {
  if (typeof url !== 'string' || !url) return false;
  try { new URL(url); } catch { return false; }
  return /\{x\}/i.test(url) && /\{y\}/i.test(url) && /\{z\}/i.test(url);
}

/** Whether `url` is an `https://` PMTiles archive (a vector basemap's source). */
export function validPmtilesUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.pathname.toLowerCase().endsWith('.pmtiles');
  } catch { return false; }
}

/** A basemap key from its label: lowercase letters and digits, at most 24 of them
 * ("USGS Imagery Topo" → "usgsimagerytopo"), "basemap" when the label has none. A caller
 * that needs it unique appends a number. */
export function basemapKeyFromLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'basemap';
}

/**
 * Whether a tile overlay is on by default over a basemap: its default_enabled_by_basemap
 * entry for that basemap, else default_enabled (also for a basemap the admin couldn't
 * name). Self-contained: the web embeds it in its page script with toString()
 * (overlayLegendRuntimeScript() in src/shared/map-controls.ts).
 */
export function overlayDefaultEnabled(
  overlay: { default_enabled: number | boolean; default_enabled_by_basemap?: Record<string, boolean> | null },
  basemapId: string | null,
): boolean {
  const byBasemap = overlay.default_enabled_by_basemap;
  if (basemapId && byBasemap && Object.prototype.hasOwnProperty.call(byBasemap, basemapId)) return !!byBasemap[basemapId];
  return !!overlay.default_enabled;
}
