/**
 * The Live map's MapLibre style, from the bootstrap's basemaps and tile overlays: the basemap
 * (a raster source and layer, or a Protomaps vector basemap read from its PMTiles archive) and
 * one raster source and layer for each overlay that's on. MapLibre takes a list of tile
 * URLs rather than Leaflet's `{s}`, so a template's `{s}` becomes one URL per subdomain, and
 * `{r}` becomes `@2x` on a high-density screen. A keyed basemap's proxy path (`/api/tiles/…`)
 * is made absolute on the account's instance, whose requests carry the bearer (tile-auth.ts).
 */
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { layers as protomapsLayers, namedFlavor } from '@protomaps/basemaps';
import { overlayDefaultEnabled, TILE_SUBDOMAINS } from '@wingbeat/core/basemaps';
import type { Basemap, BootstrapResponse, TileOverlay, VectorBasemap } from '@wingbeat/core/api/bootstrap';

/** A basemap as the map uses it: the server's raster basemaps (bootstrap `basemaps`) or vector ones (`vector_basemaps`). */
export type MapBasemap =
  | ({ kind: 'raster' } & Pick<Basemap, 'id' | 'label' | 'url' | 'attribution' | 'maxZoom' | 'detectRetina' | 'order'>)
  | ({ kind: 'vector' } & Pick<VectorBasemap, 'id' | 'label' | 'url' | 'attribution' | 'maxZoom' | 'order'>);

/**
 * The basemaps to offer, in the tenant's order (each one's `order`). A server older than the
 * app sends no order (and no vector ones): its raster ones, then any vector ones.
 */
export function availableBasemaps(bootstrap: Pick<BootstrapResponse, 'basemaps' | 'vector_basemaps'> | null): MapBasemap[] {
  const all: MapBasemap[] = [
    ...(bootstrap?.basemaps ?? []).map((b) => ({ kind: 'raster' as const, ...b })),
    ...(bootstrap?.vector_basemaps ?? []).map((b) => ({ kind: 'vector' as const, ...b })),
  ];
  return all.every((b) => b.order !== undefined) ? all.sort((a, b) => a.order! - b.order!) : all;
}

/** The basemap shown until the user picks one: the first the server sends. */
export function defaultBasemapId(basemaps: MapBasemap[]): string | null {
  return basemaps[0]?.id ?? null;
}

/**
 * Where a vector basemap's glyphs and sprites are: `basemaps-assets/` beside its PMTiles
 * archive (Protomaps' basemaps-assets, copied to the same host). MapLibre has no built-in
 * fonts, and the Protomaps flavor draws labels and icons.
 */
export function vectorAssetsBase(archiveUrl: string): string {
  return archiveUrl.replace(/[^/]*$/, '') + 'basemaps-assets';
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

const basemapSourceId = (id: string) => 'basemap-' + id;
const overlaySourceId = (id: number) => 'overlay-' + id;

export function liveMapStyle({ basemap, overlays, origin, pixelRatio, background }: MapStyleOptions): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': background } }],
  };
  if (basemap?.kind === 'vector') {
    // The flavor draws its own background, and its layers read from this source.
    const id = basemapSourceId(basemap.id);
    const assets = vectorAssetsBase(basemap.url);
    style.glyphs = assets + '/fonts/{fontstack}/{range}.pbf';
    style.sprite = assets + '/sprites/v4/light';
    style.sources[id] = {
      type: 'vector',
      url: 'pmtiles://' + basemap.url,
      ...(basemap.maxZoom ? { maxzoom: basemap.maxZoom } : {}),
      attribution: basemap.attribution,
    };
    style.layers = protomapsLayers(id, namedFlavor('light'), { lang: 'en' });
  } else if (basemap) {
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
