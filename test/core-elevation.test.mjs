// @wingbeat/core/elevation, imported directly: the elevation tool's DEM tile and pixel
// math, Terrarium decoding and the tint's color ramp. Fetching tiles stays on the page (checked through the
// shipped bundle at the end).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore, plain } from './core.mjs';
import { loadEngine } from './harness.mjs';

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

describe('elevationRampStops', () => {
  // Linear interpolation between the stops, clamped at the ends (MapLibre's interpolate).
  const colorAt = (stops, m) => {
    if (m <= stops[0][0]) return stops[0][1];
    const i = stops.findIndex(([at]) => at >= m);
    if (i === -1) return stops.at(-1)[1];
    const [[a, ca], [b, cb]] = [stops[i - 1], stops[i]];
    if (!ca) return null;
    return ca.map((c, k) => Math.round(c + (cb[k] - c) * (m - a) / (b - a)));
  };

  test('interpolated, they give elevationColorFor', () => {
    for (const [ref, range] of [[500, 300], [0, 300], [100, 50], [3000, 2000]]) {
      const stops = elevation.elevationRampStops(ref, range);
      assert.deepEqual(stops.map(([m]) => m), [...stops.map(([m]) => m)].sort((x, y) => x - y));
      for (const m of [-10, 1, 2, 50, 150, 200, 350, 500, 650, 800, 900, 1200, 4000, 6000]) {
        const want = elevation.elevationColorFor(m, ref, range);
        const got = colorAt(stops, m);
        if (want == null) assert.equal(got, null, `${ref}±${range} at ${m}`);
        else got.forEach((c, k) => assert.ok(Math.abs(c - want[k]) <= 1, `${ref}±${range} at ${m}: ${got} vs ${want}`));
      }
    }
  });

  test('transparent through the water mask', () => {
    assert.deepEqual(plain(elevation.elevationRampStops(500, 300)[0]), [5 / 3.28084, null]);
  });
});

test('reads no clock, and the page’s globals are core’s', () => {
  const realNow = Date.now;
  Date.now = () => { throw new Error('Date.now() read'); };
  let decoded;
  try {
    decoded = Array.from(elevation.decodeTerrarium(terrarium(12.25, 900)));
  } finally {
    Date.now = realNow;
  }
  const engine = loadEngine();
  assert.deepEqual(plain(engine.latLngToTilePixel(57.79, -152.4, 12)), elevation.latLngToTilePixel(57.79, -152.4, 12));
  assert.deepEqual(Array.from(engine.decodeTerrarium(terrarium(12.25, 900))), decoded);
});
