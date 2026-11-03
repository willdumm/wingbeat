/**
 * The elevation tool's pure half: which DEM tile and pixel a point falls in, Terrarium
 * decoding, a map tile's sub-rectangle of its DEM parent, and the reference-relative color
 * ramp. Fetching the tiles (pmtiles.js), canvases and the Leaflet layer stay on the page
 * (src/shared/elevation.ts).
 *
 * The DEM is Mapterhorn's public Terrarium-encoded `planet.pmtiles` archive.
 */

export const DEM_MAX_ZOOM = 12;
// Mapterhorn's planet.pmtiles WebP tiles decode to 512x512 px, not the 256x256 most
// raster tile schemes use — verified directly against a fetched tile, not assumed.
// Getting this wrong silently crops every decoded tile to its top-left quadrant
// (canvas/getImageData/Float32Array all sized off this constant), which is what
// caused the tint overlay to render zoomed in ~2x and offset southeast from the
// basemap, with seams between adjacent tiles.
export const DEM_TILE_SIZE = 512;

// 5 ft — masks water (ocean, bays, lakes), which sits at/near 0 m and would
// otherwise show as a meaningless solid band of "reference-relative" color.
export const DEM_TINT_MASK_ELEVATION_M = 5 / 3.28084;

/** A DEM tile and the pixel row/column within it. */
export interface TilePixel {
  x: number;
  y: number;
  px: number;
  py: number;
}

/** Where a map tile's pixels come from in its DEM parent tile. */
export interface DemSubTile {
  /** The parent tile: z (at most DEM_MAX_ZOOM), x, y. */
  demZ: number;
  parentX: number;
  parentY: number;
  /** Map pixels per DEM pixel (2^(z − demZ)). */
  scale: number;
  /** The sub-rectangle's side and top-left corner, in DEM pixels. */
  subSize: number;
  offX: number;
  offY: number;
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

/**
 * DEM native data stops at z12, so every map tile maps down to its z12 parent tile plus
 * the sub-rectangle its coords address within it.
 */
export function demSubTile(coords: { x: number; y: number; z: number }): DemSubTile {
  const demZ = demZoomFor(coords.z);
  const scale = Math.pow(2, coords.z - demZ);
  const parentX = Math.floor(coords.x / scale);
  const parentY = Math.floor(coords.y / scale);
  const subSize = DEM_TILE_SIZE / scale;
  return {
    demZ, parentX, parentY, scale, subSize,
    offX: (coords.x - parentX * scale) * subSize,
    offY: (coords.y - parentY * scale) * subSize,
  };
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
 * Fills a map tile's RGBA pixels (DEM_TILE_SIZE square, starting fully transparent) with
 * the tint of its sub-rectangle of the DEM parent's elevations, at `alpha` (0–255).
 */
export function paintElevationTint(out: { [i: number]: number }, elevArr: ArrayLike<number>,
                                   sub: Pick<DemSubTile, 'offX' | 'offY' | 'scale'>,
                                   refM: number | null, rangeM: number, alpha: number): void {
  const { offX, offY, scale } = sub;
  for (let py = 0; py < DEM_TILE_SIZE; py++) {
    const srcY = Math.min(DEM_TILE_SIZE - 1, Math.floor(offY + py / scale));
    for (let px = 0; px < DEM_TILE_SIZE; px++) {
      const srcX = Math.min(DEM_TILE_SIZE - 1, Math.floor(offX + px / scale));
      const color = elevationColorFor(elevArr[srcY * DEM_TILE_SIZE + srcX], refM, rangeM);
      if (!color) continue;
      const di = (py * DEM_TILE_SIZE + px) * 4;
      out[di] = color[0];
      out[di + 1] = color[1];
      out[di + 2] = color[2];
      out[di + 3] = alpha;
    }
  }
}
