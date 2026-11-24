/**
 * The elevation tool's pure half: which DEM tile and pixel a point falls in, Terrarium
 * decoding, and the reference-relative color ramp. Fetching the tiles (pmtiles.js) and the
 * map's layers stay on the page (src/shared/elevation.ts).
 *
 * The DEM is Mapterhorn's public Terrarium-encoded `planet.pmtiles` archive.
 */

/** Mapterhorn's public DEM archive: Terrarium-encoded WebP tiles, DEM_TILE_SIZE px square. */
export const DEM_PMTILES_URL = 'https://download.mapterhorn.com/planet.pmtiles';

/**
 * The credit Mapterhorn asks for, plus the one Copernicus GLO-30 (part of Alaska's DEM) requires,
 * shown wherever the DEM is drawn (HTML, like a basemap's attribution).
 */
export const DEM_ATTRIBUTION =
  'Elevation: <a href="https://mapterhorn.com/attribution" target="_blank">Mapterhorn</a>, including ' +
  '© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS ' +
  'by the European Union and ESA';

/** pmtiles.js, which reads the archive in the browser (the web's pages and the app's WebView). */
export const PMTILES_SCRIPT_URL = 'https://unpkg.com/pmtiles@3.2.1/dist/pmtiles.js';
export const PMTILES_SCRIPT_SRI = 'sha384-QfbOCebHNw8pQiPAOd2IFee2v2A5VYZxBk0+JGZ5H+3mfzVIp6zsQNkTsfGJot93';

export const DEM_MAX_ZOOM = 12;
// Mapterhorn's planet.pmtiles WebP tiles decode to 512x512 px, not the 256x256 most
// raster tile schemes use — verified directly against a fetched tile, not assumed.
// Getting this wrong silently crops every decoded tile to its top-left quadrant
// (canvas/getImageData/Float32Array all sized off this constant).
export const DEM_TILE_SIZE = 512;

// 5 ft — masks water (ocean, bays, lakes), which sits at/near 0 m and would
// otherwise show as a meaningless solid band of "reference-relative" color.
export const DEM_TINT_MASK_ELEVATION_M = 5 / 3.28084;

/** The tint's range either side of the reference (meters) and its opacity (percent): the limits and defaults. */
export const ELEVATION_RANGE_M = { min: 50, max: 2000, default: 300 } as const;
export const ELEVATION_OPACITY = { min: 0, max: 100, default: 55 } as const;

/** A stored value (nothing, or an older version's) as a valid one. */
export function elevationSetting(stored: unknown, limits: { min: number; max: number; default: number }): number {
  return typeof stored === 'number' && stored >= limits.min && stored <= limits.max ? stored : limits.default;
}

/** A DEM tile and the pixel row/column within it. */
export interface TilePixel {
  x: number;
  y: number;
  px: number;
  py: number;
}

/** An RGB color, 0–255 each. */
export type Rgb = [number, number, number];

export function demZoomFor(mapZoom: number): number {
  return Math.min(Math.round(mapZoom), DEM_MAX_ZOOM);
}

// Standard slippy-tile math: which tile at z contains (lat,lng), and the pixel
// row/column within that DEM_TILE_SIZE x DEM_TILE_SIZE tile.
export function latLngToTilePixel(lat: number, lng: number, z: number): TilePixel {
  const n = Math.pow(2, z);
  const latRad = lat * Math.PI / 180;
  const xTile = (lng + 180) / 360 * n;
  const yTile = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
  const x = Math.floor(xTile);
  const y = Math.floor(yTile);
  const px = Math.min(DEM_TILE_SIZE - 1, Math.max(0, Math.floor((xTile - x) * DEM_TILE_SIZE)));
  const py = Math.min(DEM_TILE_SIZE - 1, Math.max(0, Math.floor((yTile - y) * DEM_TILE_SIZE)));
  return { x, y, px, py };
}

/** A decoded tile's RGBA pixels as elevation meters, one per pixel (row-major). */
export function decodeTerrarium(rgba: ArrayLike<number>): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    out[i] = (r * 256 + g + b / 256) - 32768;
  }
  return out;
}

function lerp(a: number, b: number, t: number): number { return Math.round(a + (b - a) * t); }

// null return means "leave this pixel fully transparent" — either no reference
// yet, no DEM data, or the low-elevation water mask.
export function elevationColorFor(elevM: number | null, refM: number | null, rangeM: number): Rgb | null {
  if (refM == null || elevM == null || elevM <= DEM_TINT_MASK_ELEVATION_M) return null;
  const t = Math.max(-1, Math.min(1, (elevM - refM) / rangeM));
  const from = t < 0 ? [22, 163, 74] : [255, 255, 255];   // green -> white
  const to   = t < 0 ? [255, 255, 255] : [220, 38, 38];   // white -> red
  const k = t < 0 ? t + 1 : t;
  return [lerp(from[0], to[0], k), lerp(from[1], to[1], k), lerp(from[2], to[2], k)];
}

/**
 * elevationColorFor's ramp as stops for a renderer that interpolates linearly between them
 * (MapLibre's color-relief layer): [meters, color or null for transparent],
 * ascending. Transparent up to the water mask, then the ramp, clamped beyond its ends.
 */
export function elevationRampStops(refM: number, rangeM: number): [number, Rgb | null][] {
  const stops: [number, Rgb | null][] = [[DEM_TINT_MASK_ELEVATION_M, null]];
  // Just above the mask, so the edge of the water stays sharp.
  const first = DEM_TINT_MASK_ELEVATION_M + 0.01;
  for (const m of [first, refM - rangeM, refM, refM + rangeM]) {
    if (m >= first && m > stops[stops.length - 1][0]) stops.push([m, elevationColorFor(m, refM, rangeM)]);
  }
  return stops;
}
