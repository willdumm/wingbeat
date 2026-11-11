/**
 * The built-in basemaps: the catalog every map offers (the web's Leaflet maps and the app's
 * MapLibre map), and the pure functions over it that the Worker's keyed-tile proxy and the
 * clients share. Reading a tile-provider secret stays in the Worker (readEnvSecret() in
 * src/shared/map-controls.ts); the functions here take its result as a parameter.
 */

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
  /**
   * Set only for presets that require a hoster-held key (e.g. Carto). `url` is then
   * the *upstream* template — fetched server-side by the `/api/tiles/:providerId`
   * proxy, never by the client directly — with `{KEY}` substituted for the secret
   * named here (a Worker secret, never per-tenant D1 data).
   */
  secretEnvVar?: string;
}

/**
 * Built-in basemap choices. Order here is the default display order.
 *
 * This is also the server-side registry for the keyed-tile proxy (`/api/tiles/...`
 * in src/index.ts) — the *only* place allowed to construct an upstream tile URL. A
 * preset's `url` is the real upstream template regardless of whether it's keyed;
 * `clientBasemapPresets()` is what rewrites it to a same-origin proxy path for
 * presets that have a `secretEnvVar`.
 */
export const BASEMAP_PRESETS: readonly BasemapPreset[] = [
  {
    id: 'map',
    label: 'Map',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key={KEY}',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 18,
    secretEnvVar: 'CARTO_API_KEY',
  },
  {
    id: 'topo',
    label: 'Topo',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
  },
  {
    id: 'usgstopo',
    label: 'USGS Topo',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles courtesy of the <a href="https://www.usgs.gov/" target="_blank">U.S. Geological Survey</a>',
    maxZoom: 16,
  },
  {
    id: 'usgsimagerytopo',
    label: 'USGS Imagery Topo',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles courtesy of the <a href="https://www.usgs.gov/" target="_blank">U.S. Geological Survey</a>',
    maxZoom: 16,
  },
  {
    id: 'satellite',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 18,
    detectRetina: true,
  },
];

/** Layers enabled by default on a device that has never touched this setting. */
export const DEFAULT_ENABLED_BASEMAPS: readonly string[] = ['map', 'topo', 'satellite'];

/** The subdomains a `{s}` in a preset's `url` takes (Leaflet's default `subdomains`). */
export const TILE_SUBDOMAINS: readonly string[] = ['a', 'b', 'c'];

/**
 * The preset list for a page with no app Worker behind it (the docs site's showcase):
 * every preset, with keyed ones still carrying their `{KEY}` placeholder. The page
 * fills it in at runtime from a public, referrer-restricted key, or drops those presets
 * when it has none (see src/showcase/scripts.ts).
 */
export function staticSiteBasemapPresets(): BasemapPreset[] {
  return [...BASEMAP_PRESETS];
}

/** Looks up a keyed preset by id for the tile proxy route. Returns undefined for an
 * unknown id or a preset that isn't keyed (proxying a keyless preset is undesirable, so
 * the route 404s on it same as an unknown id). */
export function keyedBasemapPreset(id: string): BasemapPreset | undefined {
  return BASEMAP_PRESETS.find((p) => p.id === id && p.secretEnvVar);
}

/** Substitutes `{s}`/`{z}`/`{x}`/`{y}`/`{r}`/`{KEY}` into a preset's upstream URL
 * template. The only place allowed to build an upstream tile-provider URL. */
export function substituteTileUrl(
  template: string,
  params: { s: string; z: string; x: string; y: string; r: string; key: string },
): string {
  return template
    .replace(/\{s\}/g, params.s)
    .replace(/\{z\}/g, params.z)
    .replace(/\{x\}/g, params.x)
    .replace(/\{y\}/g, params.y)
    .replace(/\{r\}/g, params.r)
    .replace(/\{KEY\}/g, encodeURIComponent(params.key));
}

/** The same-origin proxy path a keyed preset's tiles are fetched from. */
export function basemapProxyUrl(id: string): string {
  return `/api/tiles/${id}/{z}/{x}/{y}{r}.png`;
}

/**
 * The preset list as a *client* should see it: keyless presets pass through unchanged;
 * a keyed preset is only included when `hasSecret(secretEnvVar)` says its secret is
 * configured, and its `url` is rewritten to the same-origin proxy path so the key itself
 * never reaches the client. A preset whose secret is unset is simply absent — no error
 * state, no disabled/"fixed" entry. The web inlines it into the page
 * (mapLayersRuntimeScript() in src/shared/map-controls.ts); the app gets it as
 * `basemaps` in GET /api/bootstrap.
 */
export function clientBasemapPresets(hasSecret: (name: string) => boolean): BasemapPreset[] {
  return BASEMAP_PRESETS.flatMap((p) => {
    if (!p.secretEnvVar) return [p];
    if (!hasSecret(p.secretEnvVar)) return [];
    return [{ ...p, url: basemapProxyUrl(p.id) }];
  });
}

/**
 * Whether a tile overlay is on by default over a basemap: its default_enabled_by_basemap
 * entry for that basemap, else default_enabled (also for a basemap the admin couldn't
 * name, like a viewer's own custom one). Self-contained: the web embeds it in its page
 * script with toString() (overlayLegendRuntimeScript() in src/shared/map-controls.ts).
 */
export function overlayDefaultEnabled(
  overlay: { default_enabled: number | boolean; default_enabled_by_basemap?: Record<string, boolean> | null },
  basemapId: string | null,
): boolean {
  const byBasemap = overlay.default_enabled_by_basemap;
  if (basemapId && byBasemap && Object.prototype.hasOwnProperty.call(byBasemap, basemapId)) return !!byBasemap[basemapId];
  return !!overlay.default_enabled;
}
