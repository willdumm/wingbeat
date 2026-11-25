/**
 * The MapLibre style both clients' maps start from, built from the bootstrap's basemaps and
 * tile overlays: the basemap (a raster source and layer, or a Protomaps vector basemap read from
 * its PMTiles archive) and one raster source and layer for each overlay that's on. MapLibre
 * takes a list of tile URLs, not a `{s}`, so a template's `{s}` becomes one URL
 * per subdomain, and `{r}` becomes `@2x` on a high-density screen. A path on the
 * instance is made absolute.
 *
 * Each client adds its own sources and layers (tracks, markers, the elevation tint) on top;
 * their specs are in map-layers.ts.
 */
import type { LayerSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { layers as protomapsLayers, namedFlavor } from '@protomaps/basemaps';
import type { Basemap, BootstrapResponse, TileOverlay, VectorBasemap } from './api/bootstrap';
import { MAP_THEME, type MapTheme } from './map-theme';
import { overlayDefaultEnabled, TILE_SUBDOMAINS } from './basemaps';

export type { LayerSpecification, StyleSpecification };

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

/** The basemap to show: the one picked, or the first when none is, or it's no longer offered. */
export function chosenBasemap(basemaps: MapBasemap[], id: string | null | undefined): MapBasemap | null {
  return basemaps.find((b) => b.id === id) ?? basemaps[0] ?? null;
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
 * path on it; pixelRatio the screen's. The placeholders' case is normalized first, since admins
 * paste templates documented as `{Z}/{X}/{Y}`.
 */
export function tileUrls(template: string, origin: string, pixelRatio: number): string[] {
  const url = template
    .replace(/\{[sxyzr]\}/gi, (m) => m.toLowerCase())
    .replace(/\{r\}/g, pixelRatio > 1 ? '@2x' : '');
  const absolute = url.startsWith('/') ? origin + url : url;
  return absolute.includes('{s}') ? TILE_SUBDOMAINS.map((s) => absolute.replace(/\{s\}/g, s)) : [absolute];
}

/**
 * A raster basemap's color correction (the web's per-device Settings → Map layers sliders), in
 * percent: 100 is no change. MapLibre's raster paint has saturation and contrast in -1…1 and a
 * brightness range instead of CSS's filter multipliers, so mapColorPaint() maps one to the other.
 */
export interface MapColor {
  sat: number;
  con: number;
  bri: number;
}

/**
 * The raster paint for a color correction. Saturation and contrast map linearly to MapLibre's
 * -1…1 around 100%. Brightness scales the pixel range as CSS brightness() does: below 100% the
 * top of the range comes down; above it, the bottom goes up (MapLibre can't brighten past white).
 */
export function mapColorPaint(c: MapColor): Record<string, number> {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const paint: Record<string, number> = {};
  if (c.sat !== 100) paint['raster-saturation'] = clamp((c.sat - 100) / 100);
  if (c.con !== 100) paint['raster-contrast'] = clamp((c.con - 100) / 100);
  if (c.bri < 100) paint['raster-brightness-max'] = Math.max(0, c.bri / 100);
  else if (c.bri > 100) paint['raster-brightness-min'] = Math.min(1, (c.bri - 100) / 100);
  return paint;
}

export interface MapStyleOptions {
  basemap: MapBasemap | null;
  /** The overlays that are on, in the bootstrap's order (drawn bottom to top). */
  overlays: TileOverlay[];
  origin: string;
  pixelRatio: number;
  /** What shows where no tile has loaded (a token color). */
  background: string;
  /** The basemap's color correction, for a raster one; none by default. */
  color?: MapColor;
  /** A vector basemap's colors (the theme editor's draft); the app's by default. */
  theme?: MapTheme;
}

/** Whether a source is the style's own (a basemap or an overlay), not one the client added. */
export const isStyleSource = (id: string | undefined) => /^(basemap|overlay)-/.test(id ?? '');

/** The style's source id for a basemap, and its (raster) layer's. */
export const basemapSourceId = (id: string) => 'basemap-' + id;
/** The style's source and layer id for an overlay. */
export const overlaySourceId = (id: number) => 'overlay-' + id;

export function mapStyle({ basemap, overlays, origin, pixelRatio, background, color, theme = MAP_THEME }: MapStyleOptions): StyleSpecification {
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
    style.sprite = assets + '/sprites/v4/' + theme.base;
    style.sources[id] = {
      type: 'vector',
      url: 'pmtiles://' + basemap.url,
      ...(basemap.maxZoom ? { maxzoom: basemap.maxZoom } : {}),
      attribution: basemap.attribution,
    };
    style.layers = protomapsLayers(id, { ...namedFlavor(theme.base), ...theme.colors }, { lang: 'en' });
  } else if (basemap) {
    const id = basemapSourceId(basemap.id);
    // A detectRetina basemap (no `{r}`) fetches a zoom level deeper on a high-density
    // screen: half-size tiles.
    const tileSize = basemap.detectRetina && pixelRatio > 1 ? 128 : 256;
    style.sources[id] = {
      type: 'raster',
      tiles: tileUrls(basemap.url, origin, pixelRatio),
      tileSize,
      maxzoom: basemap.maxZoom,
      attribution: basemap.attribution,
    };
    style.layers.push({ id, type: 'raster', source: id, ...(color ? { paint: mapColorPaint(color) } : {}) });
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
