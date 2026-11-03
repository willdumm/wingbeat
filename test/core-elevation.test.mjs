// @wingbeat/core/elevation, imported directly: the elevation tool's DEM tile and pixel
// math, Terrarium decoding, a map tile's sub-rectangle of its z12 parent and the tint's
// color ramp. Fetching tiles and the canvases stay on the page (checked through the
// shipped bundle at the end).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore } from './core.mjs';
import { loadEngine, plain } from './harness.mjs';

const elevation = await importCore('elevation');
const { DEM_TILE_SIZE: SIZE } = elevation;

// Terrarium: meters + 32768 = r·256 + g + b/256.
const terrarium = (...meters) => meters.flatMap((m) => {
  const v = m + 32768;
  return [Math.floor(v / 256), Math.floor(v) % 256, Math.round((v % 1) * 256), 255];
});

describe('latLngToTilePixel', () => {
  test('tile corners land on pixel 0; the last pixel is clamped', () => {
    assert.deepEqual(elevation.latLngToTilePixel(0, 0, 0), { x: 0, y: 0, px: SIZE / 2, py: SIZE / 2 });
    assert.deepEqual(elevation.latLngToTilePixel(0, 0, 1), { x: 1, y: 1, px: 0, py: 0 });
    assert.deepEqual(elevation.latLngToTilePixel(0, -180, 2), { x: 0, y: 2, px: 0, py: 0 });
    assert.equal(elevation.latLngToTilePixel(0, 179.99999999, 0).px, SIZE - 1);
  });

  test('Kodiak at z12: the pixel’s bounds contain the point', () => {
    const [lat, lng, z] = [57.79, -152.4, 12];
    const { x, y, px, py } = elevation.latLngToTilePixel(lat, lng, z);
    const n = 2 ** z * SIZE;
    const lonOf = (gx) => gx / n * 360 - 180;
    const latOf = (gy) => Math.atan(Math.sinh(Math.PI * (1 - 2 * gy / n))) * 180 / Math.PI;
    const gx = x * SIZE + px, gy = y * SIZE + py;
    assert.deepEqual([x, y], [314, 1238]);
    assert.ok(lonOf(gx) <= lng && lng < lonOf(gx + 1));
    assert.ok(latOf(gy) >= lat && lat > latOf(gy + 1));
  });
});

test('demZoomFor: rounds, and stops at the DEM’s z12', () => {
  assert.deepEqual([3.4, 3.5, 12, 12.6, 18].map(elevation.demZoomFor), [3, 4, 12, 12, 12]);
  assert.equal(elevation.DEM_MAX_ZOOM, 12);
});

test('decodeTerrarium: one elevation per RGBA pixel, below sea level and fractional meters too', () => {
  assert.deepEqual(terrarium(0, 1000.5, -10), [128, 0, 0, 255, 131, 232, 128, 255, 127, 246, 0, 255]);
  assert.deepEqual(Array.from(elevation.decodeTerrarium(terrarium(0, 1000.5, -10))), [0, 1000.5, -10]);
  assert.equal(elevation.decodeTerrarium(new Uint8ClampedArray(SIZE * SIZE * 4)).length, SIZE * SIZE);
});

describe('demSubTile', () => {
  test('at or below z12 a map tile is its own DEM tile', () => {
    assert.deepEqual(elevation.demSubTile({ x: 5, y: 3, z: 10 }),
      { demZ: 10, parentX: 5, parentY: 3, scale: 1, subSize: SIZE, offX: 0, offY: 0 });
  });

  test('above z12 it’s a sub-rectangle of its z12 parent', () => {
    assert.deepEqual(elevation.demSubTile({ x: 5, y: 3, z: 14 }),
      { demZ: 12, parentX: 1, parentY: 0, scale: 4, subSize: SIZE / 4, offX: SIZE / 4, offY: 3 * SIZE / 4 });
  });
});

describe('elevationColorFor', () => {
  test('green below the reference, white at it, red above, clamped at ± the range', () => {
    const at = (m) => elevation.elevationColorFor(m, 500, 300);
    assert.deepEqual(at(500), [255, 255, 255]);
    assert.deepEqual(at(800), [220, 38, 38]);
    assert.deepEqual(at(5000), [220, 38, 38]);
    assert.deepEqual(at(200), [22, 163, 74]);
    assert.deepEqual(at(350), [139, 209, 165]);
    assert.deepEqual(at(650), [238, 147, 147]);
  });

  test('transparent with no reference, no data, or water (5 ft and below)', () => {
    assert.equal(elevation.elevationColorFor(500, null, 300), null);
    assert.equal(elevation.elevationColorFor(null, 500, 300), null);
    assert.equal(elevation.elevationColorFor(5 / 3.28084, 0, 300), null);
    assert.deepEqual(elevation.elevationColorFor(1.6, 0, 300), [255, 254, 254]);
  });
});

test('paintElevationTint: each DEM pixel of the sub-rectangle covers scale² map pixels; water stays transparent', () => {
  const elev = new Float32Array(SIZE * SIZE);   // all sea level
  elev[300] = 500;                             // row 0, column 300
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  const sub = elevation.demSubTile({ x: 1, y: 0, z: 13 });   // the parent's right half, scale 2
  elevation.paintElevationTint(out, elev, sub, 500, 300, 128);
  const painted = [];
  for (let i = 0; i < SIZE * SIZE; i++) if (out[i * 4 + 3]) painted.push([i % SIZE, Math.floor(i / SIZE)]);
  assert.deepEqual(painted, [[88, 0], [89, 0], [88, 1], [89, 1]]);
  assert.deepEqual(Array.from(out.slice(88 * 4, 89 * 4)), [255, 255, 255, 128]);
});

test('reads no clock, and the page’s globals are core’s', () => {
  const realNow = Date.now;
  Date.now = () => { throw new Error('Date.now() read'); };
  const elev = new Float32Array(SIZE * SIZE).fill(400);
  const out = new Uint8ClampedArray(SIZE * SIZE * 4);
  let decoded;
  try {
    decoded = Array.from(elevation.decodeTerrarium(terrarium(12.25, 900)));
    elevation.paintElevationTint(out, elev, elevation.demSubTile({ x: 3, y: 7, z: 15 }), 500, 300, 200);
  } finally {
    Date.now = realNow;
  }
  const engine = loadEngine();
  assert.deepEqual(plain(engine.latLngToTilePixel(57.79, -152.4, 12)), elevation.latLngToTilePixel(57.79, -152.4, 12));
  assert.deepEqual(Array.from(engine.decodeTerrarium(terrarium(12.25, 900))), decoded);
  assert.deepEqual(plain(engine.demSubTile({ x: 3, y: 7, z: 15 })), elevation.demSubTile({ x: 3, y: 7, z: 15 }));
  const pageOut = new Uint8ClampedArray(SIZE * SIZE * 4);
  engine.paintElevationTint(pageOut, elev, engine.demSubTile({ x: 3, y: 7, z: 15 }), 500, 300, 200);
  assert.deepEqual(pageOut, out);
  assert.deepEqual(Array.from(out.slice(0, 4)), [177, 224, 195, 200]);
});
