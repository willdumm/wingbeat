/**
 * The Live map's MapLibre style, from the bootstrap's basemaps and tile overlays: one raster
 * source and layer for the basemap and each overlay that's on. MapLibre takes a list of tile
 * URLs rather than Leaflet's `{s}`, so a template's `{s}` becomes one URL per subdomain, and
 * `{r}` becomes `@2x` on a high-density screen. A keyed basemap's proxy path (`/api/tiles/…`)
 * is made absolute on the account's instance, whose requests carry the bearer (tile-auth.ts).
 */
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { clientBasemapPresets, DEFAULT_ENABLED_BASEMAPS, overlayDefaultEnabled, TILE_SUBDOMAINS } from '@wingbeat/core/basemaps';
import type { Basemap, BootstrapResponse, TileOverlay } from '@wingbeat/core/api/bootstrap';

/** A basemap as the map uses it: the server's (bootstrap `basemaps`) or core's preset. */
export type MapBasemap = Pick<Basemap, 'id' | 'label' | 'url' | 'attribution' | 'maxZoom' | 'detectRetina'>;

/** The basemaps to offer: the server's, or core's keyless presets from a server older than `basemaps`. */
export function availableBasemaps(bootstrap: Pick<BootstrapResponse, 'basemaps'> | null): MapBasemap[] {
  return bootstrap?.basemaps ?? clientBasemapPresets(() => false);
}

/** The basemap shown until the user picks one: the first of the web's defaults on offer. */
export function defaultBasemapId(basemaps: MapBasemap[]): string | null {
  return (basemaps.find((b) => DEFAULT_ENABLED_BASEMAPS.includes(b.id)) ?? basemaps[0])?.id ?? null;
}

/** The overlays on by default over a basemap, by id. */
export function defaultOverlayIds(overlays: TileOverlay[], basemapId: string | null): number[] {
  return overlays.filter((o) => overlayDefaultEnabled(o, basemapId)).map((o) => o.id);
}

/**
 * A tile template's URLs for MapLibre. origin is the instance's (`https://<host>`), for a
 * path on it; pixelRatio the screen's. The placeholders' case is normalized first, as the
 * web does, since admins paste templates documented as `{Z}/{X}/{Y}`.
 */
export function tileUrls(template: string, origin: string, pixelRatio: number): string[] {
  const url = template
    .replace(/\{[sxyzr]\}/gi, (m) => m.toLowerCase())
    .replace(/\{r\}/g, pixelRatio > 1 ? '@2x' : '');
  const absolute = url.startsWith('/') ? origin + url : url;
  return absolute.includes('{s}') ? TILE_SUBDOMAINS.map((s) => absolute.replace(/\{s\}/g, s)) : [absolute];
}

export interface MapStyleOptions {
  basemap: MapBasemap | null;
  /** The overlays that are on, in the bootstrap's order (drawn bottom to top). */
  overlays: TileOverlay[];
  origin: string;
  pixelRatio: number;
  /** What shows where no tile has loaded (a token color). */
  background: string;
}

export const basemapSourceId = (id: string) => 'basemap-' + id;
export const overlaySourceId = (id: number) => 'overlay-' + id;

export function liveMapStyle({ basemap, overlays, origin, pixelRatio, background }: MapStyleOptions): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': background } }],
  };
  if (basemap) {
    const id = basemapSourceId(basemap.id);
    // A detectRetina basemap (no `{r}`) fetches a zoom level deeper on a high-density
    // screen, as Leaflet's detectRetina does: half-size tiles.
    const tileSize = basemap.detectRetina && pixelRatio > 1 ? 128 : 256;
    style.sources[id] = {
      type: 'raster',
      tiles: tileUrls(basemap.url, origin, pixelRatio),
      tileSize,
      maxzoom: basemap.maxZoom,
      attribution: basemap.attribution,
    };
    style.layers.push({ id, type: 'raster', source: id });
  }
  for (const o of overlays) {
    const id = overlaySourceId(o.id);
    style.sources[id] = {
      type: 'raster',
      tiles: tileUrls(o.url, origin, pixelRatio),
      tileSize: 256,
      ...(o.max_zoom != null ? { maxzoom: o.max_zoom } : {}),
      ...(o.attribution ? { attribution: o.attribution } : {}),
    };
    style.layers.push({ id, type: 'raster', source: id });
  }
  return style;
}
