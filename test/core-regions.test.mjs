// @wingbeat/core/regions, imported directly: distances (shared with the Worker's
// segmentation and geocoding), point in polygon, home bases and which region a point is
// in. The regions are a parameter; the analytics page passes its REGIONS (checked through
// the shipped bundle at the end).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore } from './core.mjs';
import { loadEngine, plain } from './harness.mjs';
import { REGIONS, KODIAK, SPINE, KATMAI, AWAY, box } from './regions-fixture.mjs';

const regions = await importCore('regions');

describe('distances', () => {
  test('haversineKm and haversineMiles', () => {
    assert.ok(Math.abs(regions.haversineKm(57, -152, 58, -152) - 111.195) < 0.001, 'a degree of latitude');
    assert.equal(regions.haversineKm(...KODIAK, ...KODIAK), 0);
    assert.ok(Math.abs(regions.haversineMiles(57, -152, 58, -152) - 111.195 * 0.621371) < 0.001);
    assert.ok(Math.abs(regions.haversineKm(0, 0, 0, 180) - Math.PI * 6371) < 1e-6, 'antipodes: no NaN');
  });

  test('the flight threshold is the server’s', () => {
    assert.equal(regions.SPEED_THRESHOLD_KMH, 37);
  });
});

describe('polygons', () => {
  test('pointInPolygon takes [lon, lat] rings', () => {
    const ring = box(-153, 57.5, -152, 58.2);
    assert.equal(regions.pointInPolygon(57.6, -152.9, ring), true);
    assert.equal(regions.pointInPolygon(-152.9, 57.6, ring), false, 'lat and lon swapped');
    assert.equal(regions.pointInPolygon(58.3, -152.5, ring), false);
  });

  test('computeCentroid is the mean of the vertices', () => {
    assert.deepEqual(regions.computeCentroid([[-152, 57], [-150, 59]]), { lat: 58, lon: -151 });
  });
});

describe('home bases', () => {
  test('a “… (Base)” name, any case and spacing, is a home base; the display name drops it', () => {
    assert.deepEqual(REGIONS.features.map(regions.isHomeBaseRegion), [false, true, false, true]);
    assert.deepEqual(REGIONS.features.map(f => regions.regionDisplayName(f.properties.Name)),
      ['Kodiak Spine', 'Kodiak', 'Katmai', 'Homer']);
    assert.equal(regions.regionDisplayName(null), '');
  });

  test('homeBaseNames: sorted display names; none before the regions load', () => {
    assert.deepEqual(regions.homeBaseNames(REGIONS), ['Homer', 'Kodiak']);
    assert.deepEqual(regions.homeBaseNames(null), []);
  });

  test('findHomeBase', () => {
    assert.equal(regions.findHomeBase(REGIONS, ...KODIAK), 'Kodiak');
    assert.equal(regions.findHomeBase(REGIONS, ...SPINE), null);
    assert.equal(regions.findHomeBase(REGIONS, null, null), null);
    assert.equal(regions.findHomeBase(null, ...KODIAK), null);
  });
});

describe('findRegion', () => {
  test('a home base wins over the region it overlaps, listed first or not', () => {
    assert.equal(regions.findRegion(REGIONS, ...KODIAK), 'Kodiak');
    assert.equal(regions.findRegion(REGIONS, ...SPINE), 'Kodiak Spine');
    assert.equal(regions.findRegion(REGIONS, ...KATMAI), 'Katmai');
  });

  test('no coordinates, no regions, no region', () => {
    assert.equal(regions.findRegion(REGIONS, null, -152), regions.UNKNOWN_LOCATION);
    assert.equal(regions.UNKNOWN_LOCATION, 'Unknown location');
    assert.equal(regions.findRegion(null, ...KODIAK), 'Other');
    assert.equal(regions.findRegion(REGIONS, ...AWAY), regions.OTHER_REGION);
  });
});

test('the page’s globals are core’s, over the regions passed in', () => {
  const engine = loadEngine();
  assert.equal(engine.haversineKm(...KODIAK, ...KATMAI), regions.haversineKm(...KODIAK, ...KATMAI));
  assert.deepEqual(plain(engine.homeBaseNamesIn(REGIONS)), ['Homer', 'Kodiak']);
});
