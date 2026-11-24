/**
 * The layers the clients draw over the basemap (the analytics ones are the web's), as
 * MapLibre layer specs without their `source` (the app nests each under its `GeoJSONSource`;
 * the web adds `source` when it adds the layer). Colors come from each feature's `color` property, and the surface color (the
 * halos and rings that keep a marker readable on any basemap) from the caller's theme tokens.
 *
 * The features: LineStrings in a `tracks` source (a ground trail has `trail`),
 * Points in a `positions` source (`pilot` for a tracker on foot, `plane` and `arrow` for
 * symbols turned to `course`, `label` for points another layer draws).
 */
import type { ExpressionSpecification, LayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import { DEM_ATTRIBUTION, DEM_MAX_ZOOM, DEM_PMTILES_URL, elevationRampStops } from './elevation';

type Distribute<T> = T extends unknown ? Omit<T, 'source'> : never;
/** A layer spec without its source. */
export type MapLayer = Distribute<Exclude<LayerSpecification, { type: 'background' }>>;

/** The plane and arrow symbols' images (signed distance fields, tinted per marker). */
export const MAP_IMAGE_IDS = { plane: 'plane', arrow: 'arrow' } as const;

/** A flight's track, solid. */
export function trackLayer(): MapLayer {
  return {
    id: 'tracks', type: 'line', filter: ['!', ['has', 'trail']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 3 },
  };
}

/** A ground trail (taxi between flights): dotted, dashes in line widths. */
export function trailLayer(): MapLayer {
  return {
    id: 'trails', type: 'line', filter: ['has', 'trail'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [0.3, 2.3] },
  };
}

/**
 * Tracker positions and track starts as dots; a pilot on foot as a ring. Points only: a
 * circle layer would draw a dot on every vertex of a line sharing its source (the web's).
 */
export function positionLayer(surface: string): MapLayer {
  return {
    id: 'positions', type: 'circle',
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'label']], ['!', ['has', 'plane']], ['!', ['has', 'arrow']]],
    paint: {
      'circle-color': ['case', ['has', 'pilot'], surface, ['get', 'color']],
      'circle-radius': ['case', ['has', 'pilot'], 6, 7],
      'circle-stroke-color': ['case', ['has', 'pilot'], ['get', 'color'], surface],
      'circle-stroke-width': ['case', ['has', 'pilot'], 3, 2.5],
    },
  };
}

/** A symbol from MAP_IMAGE_IDS turned to the feature's `course`, at the image's third (it's drawn at 3x). */
function headingSymbol(id: string, flag: string, image: string, surface: string): MapLayer {
  return {
    id, type: 'symbol', filter: ['has', flag],
    layout: {
      'icon-image': image,
      'icon-size': 1 / 3,
      'icon-rotate': ['get', 'course'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    // The field reaches 6 image pixels out from the outline, and a halo-width counts
    // halo-width / icon-size of them: at icon-size 1/3 a halo of 2 or more fills the whole
    // image square, so the halos are 1.5.
    paint: { 'icon-color': ['get', 'color'], 'icon-halo-color': surface, 'icon-halo-width': 1.5 },
  };
}

/** A tracker's plane marker. */
export function planeLayer(surface: string): MapLayer {
  return headingSymbol('planes', 'plane', MAP_IMAGE_IDS.plane, surface);
}

/** A picked track point's direction arrow. */
export function arrowLayer(surface: string): MapLayer {
  return headingSymbol('arrows', 'arrow', MAP_IMAGE_IDS.arrow, surface);
}

/**
 * The elevation tool's DEM: Mapterhorn's archive through the `pmtiles://` protocol. As tiles,
 * not a url: the archive's metadata names no encoding, and with a url MapLibre takes the
 * encoding from there only (defaulting to mapbox: everything red).
 */
export const ELEVATION_DEM_SOURCE = {
  type: 'raster-dem',
  tiles: ['pmtiles://' + DEM_PMTILES_URL],
  maxzoom: DEM_MAX_ZOOM,
  tileSize: 512,
  encoding: 'terrarium',
  attribution: DEM_ATTRIBUTION,
} as const;

/** The elevation tint's color: core's ramp around the reference (elevationRampStops). */
export function elevationReliefColor(refM: number, rangeM: number): ExpressionSpecification {
  return ['interpolate', ['linear'], ['elevation'], ...elevationRampStops(refM, rangeM).flatMap(([m, rgb]) =>
    [m, rgb ? `rgb(${rgb.join(',')})` : 'rgba(0,0,0,0)'])] as ExpressionSpecification;
}

/** The elevation tint, opacity in percent. */
export function elevationReliefLayer(refM: number, rangeM: number, opacity: number): MapLayer {
  return {
    id: 'elevation', type: 'color-relief',
    paint: { 'color-relief-color': elevationReliefColor(refM, rangeM), 'color-relief-opacity': opacity / 100 },
  };
}

/** The elevation reference's dot. */
export function elevationReferenceLayer(ink: string, surface: string): MapLayer {
  return {
    id: 'elevation-reference', type: 'circle',
    paint: { 'circle-radius': 5, 'circle-color': ink, 'circle-stroke-color': surface, 'circle-stroke-width': 2 },
  };
}

// ── Analytics (the web's): heatmaps, flight lines, region boundaries ──
//
// The heatmaps match leaflet.heat's. It summed the points' weights in a screen grid of
// cells (half its radius + blur across), capped each cell's alpha (sum × a per-zoom scale)
// at 1, and drew each cell as a blurred disc colored by the gradient at that alpha. The
// discs stacked by alpha compositing, so n faint ones reach 1 − e^(−their sum) and never
// quite turn opaque. Here the source clusters its points per zoom (the cells, `weight`
// summed), heatmap-weight caps a cluster, and MapLibre's density, which just adds up, is
// scaled down by HEAT_DENSITY_SPAN (density 1 is a sum of 3, 95% opaque) and heatColor()
// bends it through that curve.

/** MapLibre's heatmap kernel peaks at weight × intensity × 1/√(2π) (its GAUSS_COEF). */
const HEAT_KERNEL_PEAK = 1 / Math.sqrt(2 * Math.PI);
const HEAT_DENSITY_SPAN = 3;

type Rgb = [number, number, number];

/** A heat source's clustering: leaflet.heat's cells, `cellPx` across, their weights summed. */
function heatSource(cellPx: number) {
  return { cluster: true, clusterRadius: cellPx, clusterProperties: { weight: ['+', ['get', 'weight']] } };
}

/**
 * heatmap-weight: a cell's alpha, its summed weight × `scale` (a [zoom, scale] list,
 * exponential between), capped at 1.
 */
function heatWeight(scale: [number, number][]): ExpressionSpecification {
  return ['interpolate', ['exponential', 2], ['zoom'],
    ...scale.flatMap(([z, k]) => [z, ['min', ['*', ['get', 'weight'], k], 1]])] as ExpressionSpecification;
}

/**
 * heatmap-intensity for leaflet.heat's disc of `radius` and `blur` px: a canvas shadow blur
 * (σ = blur / 2) of a filled circle, so it peaks below the cell's alpha.
 */
function heatIntensity(radius: number, blur: number): number {
  const discPeak = 1 - Math.exp(-(radius * radius) / (2 * (blur / 2) ** 2));
  return discPeak / HEAT_KERNEL_PEAK / HEAT_DENSITY_SPAN;
}

/** leaflet.heat's gradient at alpha a: the first stop's color below it, then linear. */
function heatGradientAt(stops: [number, Rgb][], a: number): Rgb {
  if (a <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [a0, c0] = stops[i - 1], [a1, c1] = stops[i];
    if (a <= a1) return c0.map((c, k) => Math.round(c + (c1[k] - c) * (a - a0) / (a1 - a0))) as Rgb;
  }
  return stops[stops.length - 1][1];
}

/** A heatmap's color: at density d the alpha is 1 − e^(−SPAN·d), colored as leaflet.heat's. */
function heatColor(stops: [number, Rgb][]): ExpressionSpecification {
  const N = 24;
  const ramp = Array.from({ length: N + 1 }, (_, i) => {
    const d = i / N, a = 1 - Math.exp(-HEAT_DENSITY_SPAN * d);
    return [d, `rgba(${heatGradientAt(stops, a).join(',')},${+a.toFixed(3)})`];
  });
  return ['interpolate', ['linear'], ['heatmap-density'], ...ramp.flat()] as ExpressionSpecification;
}

/** The endpoint heat's GeoJSON source options, beside its data. */
export function endpointHeatSource() {
  return heatSource(32);
}

/**
 * The heat at flight endpoints (endpointHeatPoints), each Point's `weight` its hours or
 * stops. leaflet.heat's radius 30 and blur 35, and its scale: a ceiling of 0.05 at Leaflet's
 * zoom 14, halving per level out and floored at 0.01, against points weighted 2^(z − 22) from
 * Leaflet zoom 10 in. That's 1/40.96 out to MapLibre zoom 9, rising to 1/12.8 at 10.68, then
 * level.
 */
export function endpointHeatLayer(): MapLayer {
  return {
    id: 'endpoint-heat', type: 'heatmap',
    paint: {
      'heatmap-weight': heatWeight([[9, 1 / 40.96], [10.68, 1 / 12.8]]),
      'heatmap-intensity': heatIntensity(30, 35),
      'heatmap-radius': 30 + 35,
      'heatmap-color': heatColor([[0.4, [107, 33, 168]], [0.65, [147, 51, 234]], [1, [233, 213, 255]]]),
    },
  };
}

/**
 * Path density: the interpolated route points (interpolateRoutePoints), one MultiPoint with
 * `weight` 1, unclustered (MapLibre clusters Points only), so no cell caps it. leaflet.heat's
 * radius 8 and blur 10, its points scaled 2^(z − 16) (its maxZoom 16) from Leaflet zoom 4
 * to 16: MapLibre's 3 to 15.
 */
export function routeHeatLayer(): MapLayer {
  return {
    id: 'route-heat', type: 'heatmap',
    paint: {
      'heatmap-weight': heatWeight([[3, 2 ** -12], [15, 1]]),
      'heatmap-intensity': heatIntensity(8, 10),
      'heatmap-radius': 8 + 10,
      'heatmap-color': heatColor([[0.4, [22, 78, 99]], [0.65, [8, 145, 178]], [1, [165, 243, 252]]]),
    },
  };
}

/** Every flight's track, thin and faint, so where they bunch up reads darker. */
export function flightLinesLayer(): MapLayer {
  return {
    id: 'flight-lines', type: 'line',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-opacity': 0.35, 'line-width': 1.5 },
  };
}

/** The analytics regions' fill: faint, and what a hover or tap finds. */
export function regionFillLayer(): MapLayer {
  return { id: 'region-fill', type: 'fill', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.06 } };
}

/** The analytics regions' outlines. */
export function regionOutlineLayer(): MapLayer {
  return {
    id: 'region-outline', type: 'line',
    layout: { 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 1.5 },
  };
}
