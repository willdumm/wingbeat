/**
 * The layers both clients draw over the basemap, as MapLibre layer specs without their
 * `source` (the app nests each under its `GeoJSONSource`; the web adds `source` when it adds
 * the layer). Colors come from each feature's `color` property, and the surface color (the
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
