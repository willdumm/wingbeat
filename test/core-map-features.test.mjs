// @wingbeat/core/map-features, imported directly: what both clients' maps draw, as GeoJSON.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore } from './core.mjs';

const { dayTrackFeatures, defaultMapView, flightTrackFeatures, groundTrailFeatures, lineFeature, lngLatBounds, pointFeature, zoomFromStored, zoomToStored } = await importCore('map-features');
const { elevationSetting, ELEVATION_OPACITY, ELEVATION_RANGE_M } = await importCore('elevation');

const pt = (lon, lat) => ({ lon, lat, t: 0, v: null, e: null, c: null });

test('features are [lon, lat], with an id only when given one', () => {
  assert.deepEqual(pointFeature(pt(-152, 57), { color: 'c' }),
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-152, 57] }, properties: { color: 'c' } });
  assert.deepEqual(lineFeature([pt(1, 2), pt(3, 4)], {}, 7),
    { type: 'Feature', id: 7, geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] }, properties: {} });
});

test('bounds: [west, south, east, north], null without coordinates', () => {
  assert.deepEqual(lngLatBounds([[-152, 57], [-153, 58], [-150, 56]]), [-153, 56, -150, 58]);
  assert.equal(lngLatBounds([]), null);
});

test("the default view: the stored zoom is MapLibre's plus one", () => {
  assert.deepEqual(defaultMapView({ lat: 57.8, lng: -152.4, zoom: 9 }), { center: [-152.4, 57.8], zoom: 8 });
  assert.equal(zoomToStored(8.04), 9);
  assert.equal(zoomFromStored(zoomToStored(7)), 7);
});

test("a flight's track: no line for one point, an end dot only with an end color", () => {
  const colors = { track: 'T', start: 'S', end: 'E' };
  const two = flightTrackFeatures([pt(1, 2), pt(3, 4)], colors, 5);
  assert.deepEqual(two.lines.map((f) => [f.id, f.properties.color]), [[5, 'T']]);
  assert.deepEqual(two.dots.map((f) => [f.geometry.coordinates, f.properties.color]), [[[1, 2], 'S'], [[3, 4], 'E']]);
  assert.equal(flightTrackFeatures([pt(1, 2), pt(3, 4)], { ...colors, end: null }).dots.length, 1);
  assert.deepEqual(flightTrackFeatures([pt(1, 2)], colors).lines, []);
  assert.deepEqual(flightTrackFeatures([], colors), { lines: [], dots: [] });
});

test('a day: numbers per tracker, starts, in progress; hidden trackers keep their numbers and their place in trackerIds', () => {
  const flights = [
    { id: 1, tracker_id: 1, points: [pt(1, 1), pt(2, 2)] },
    { id: 2, tracker_id: 2, points: [pt(3, 3), pt(4, 4)] },
    { id: 3, tracker_id: 1, points: [] },
    { id: 4, tracker_id: 1, points: [pt(5, 5), pt(6, 6)] },
  ];
  const opts = { colorFor: (id) => 'c' + id, inProgress: (f) => f.id === 4 };
  const day = dayTrackFeatures(flights, opts);
  assert.deepEqual(day.drawn.map((d) => [d.flight.id, d.n, d.color, d.inProgress]), [[1, 1, 'c1', false], [2, 1, 'c2', false], [4, 2, 'c1', true]]);
  assert.deepEqual(day.lines.map((f) => f.id), [1, 2, 4]);
  assert.deepEqual(day.starts.map((f) => [f.id, f.geometry.coordinates]), [['start-1', [1, 1]], ['start-2', [3, 3]], ['start-4', [5, 5]]]);
  const hidden = dayTrackFeatures(flights, { ...opts, hidden: [1] });
  assert.deepEqual(hidden.drawn.map((d) => [d.flight.id, d.n]), [[2, 1]]);
  assert.deepEqual(hidden.trackerIds, [1, 2]);
});

test("a ground trail: the dotted line from the plane, and the pilot's dot", () => {
  const trail = { line: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }], pilot: { lat: 3, lon: 4 }, points: [pt(4, 3)] };
  const { line, pilot } = groundTrailFeatures(trail, 'c', 9);
  assert.deepEqual([line.id, line.geometry.coordinates, line.properties], ['trail-9', [[2, 1], [4, 3]], { color: 'c', trail: true }]);
  assert.deepEqual([pilot.id, pilot.geometry.coordinates, pilot.properties], ['pilot-9', [4, 3], { color: 'c', pilot: true }]);
});

test('an elevation setting: the stored one within its limits, else the default', () => {
  assert.equal(elevationSetting(500, ELEVATION_RANGE_M), 500);
  assert.equal(elevationSetting(5, ELEVATION_RANGE_M), 300);
  assert.equal(elevationSetting(0, ELEVATION_OPACITY), 0);
  assert.equal(elevationSetting(NaN, ELEVATION_OPACITY), 55);
  assert.equal(elevationSetting(null, ELEVATION_OPACITY), 55);
});
