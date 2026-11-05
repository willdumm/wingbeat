// @wingbeat/core/analytics, imported directly: the stream graph's buckets (operator days,
// weeks from Monday, months) and each bucket's region totals, and the map layers' points.
// The timezone and the regions are parameters; the page's globals bind the timezone
// (checked through the shipped bundle at the end).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore, plain, TZ } from './core.mjs';
import { loadEngine } from './harness.mjs';
import { REGIONS, KODIAK, SPINE, KATMAI } from './regions-fixture.mjs';

const analytics = await importCore('analytics');
const time = await importCore('time');

const at = (s) => time.tzLocalToEpoch(TZ, ...s.split(' '));
const utc = (iso) => Date.parse(iso) / 1000;
const flight = (a, b, start, hours, points) => ({
  start_time: at(start), end_time: at(start) + hours * 3600,
  start_lat: a[0], start_lon: a[1], end_lat: b[0], end_lon: b[1], points,
});
const NOWHERE = [null, null];

test('sgResolveInterval: auto by the range’s length', () => {
  const day = 86400;
  assert.equal(analytics.sgResolveInterval('week', 0, day), 'week');
  assert.equal(analytics.sgResolveInterval('auto', null, day), 'month');
  assert.deepEqual([13, 14, 59, 60].map(n => analytics.sgResolveInterval('auto', 0, n * day)), ['day', 'week', 'week', 'month']);
});

describe('sgGenerateBuckets: operator days', () => {
  test('east of UTC, the day DST starts on begins at its own midnight', () => {
    const berlin = 'Europe/Berlin';
    const buckets = analytics.sgGenerateBuckets(berlin, Date.UTC(2026, 2, 28, 12) / 1000, Date.UTC(2026, 2, 30, 12) / 1000, 'day');
    assert.deepEqual(buckets.map(b => b.start), [
      Date.UTC(2026, 2, 27, 23) / 1000,   // Mar 28, CET
      Date.UTC(2026, 2, 28, 23) / 1000,   // Mar 29, CET until 02:00
      Date.UTC(2026, 2, 29, 22) / 1000,   // Mar 30, CEST
    ]);
  });

  test('months start at the operator’s midnight, across the end of daylight time', () => {
    const buckets = analytics.sgGenerateBuckets(TZ, at('2026-10-31 20:00'), at('2026-12-15 00:00'), 'month');
    assert.deepEqual(buckets, [
      { start: utc('2026-10-01T08:00Z'), end: utc('2026-11-01T08:00Z'), label: 'Oct 26' },
      { start: utc('2026-11-01T08:00Z'), end: utc('2026-12-01T09:00Z'), label: 'Nov 26' },
      { start: utc('2026-12-01T09:00Z'), end: utc('2027-01-01T09:00Z'), label: 'Dec 26' },
    ]);
  });

  test('weeks start on the operator’s Monday; the week the clocks change is an hour longer', () => {
    const buckets = analytics.sgGenerateBuckets(TZ, at('2026-10-28 10:00'), at('2026-11-03 00:00'), 'week');
    assert.deepEqual(buckets, [
      { start: utc('2026-10-26T08:00Z'), end: utc('2026-11-02T09:00Z'), label: 'Oct 26' },
      { start: utc('2026-11-02T09:00Z'), end: utc('2026-11-09T09:00Z'), label: 'Nov 2' },
    ]);
    assert.equal(analytics.sgGenerateBuckets(TZ, at('2026-11-01 12:00'), at('2026-11-02 00:00'), 'week')[0].label, 'Oct 26',
      'a Sunday belongs to the week before');
  });

  test('an evening flight counts toward its own day, not the next UTC day', () => {
    const s = at('2026-11-02 23:30');   // 08:30 UTC on Nov 3
    const buckets = analytics.sgGenerateBuckets(TZ, s, at('2026-11-03 12:00'), 'day');
    assert.deepEqual(buckets, [
      { start: at('2026-11-02 00:00'), end: at('2026-11-03 00:00'), label: 'Nov 2' },
      { start: at('2026-11-03 00:00'), end: at('2026-11-04 00:00'), label: 'Nov 3' },
    ]);
    assert.deepEqual(analytics.sgGenerateBuckets(TZ, at('2026-12-31 10:00'), at('2027-01-01 10:00'), 'day').map(b => b.label),
      ['Dec 31', 'Jan 1']);
  });

  test('in another operator timezone, that timezone’s days', () => {
    const [b] = analytics.sgGenerateBuckets('Europe/Berlin', utc('2026-11-03T08:30Z'), utc('2026-11-03T12:00Z'), 'day');
    assert.deepEqual(b, { start: utc('2026-11-02T23:00Z'), end: utc('2026-11-03T23:00Z'), label: 'Nov 3' });
  });
});

describe('sgComputeData', () => {
  const s = at('2026-11-02 06:00');
  const e = at('2026-11-03 12:00');
  const flights = [
    flight(KODIAK, KATMAI, '2026-11-02 23:30', 2),
    flight(SPINE, KATMAI, '2026-11-03 08:00', 1),
    flight(SPINE, KATMAI, '2026-11-02 05:00', 1),   // before s
    flight(SPINE, KATMAI, '2026-11-03 13:00', 1),   // after e
  ];
  const buckets = analytics.sgGenerateBuckets(TZ, s, e, 'day');

  test('each bucket’s region hours or stops, of the flights that started in it within the range', () => {
    assert.deepEqual(analytics.sgComputeData(REGIONS, buckets, s, e, flights, 'time'),
      [{ Katmai: 2 }, { 'Kodiak Spine': 0.5, Katmai: 0.5 }]);
    assert.deepEqual(analytics.sgComputeData(REGIONS, buckets, s, e, flights, 'stops'), [{ Katmai: 1 }, { Katmai: 1 }]);
  });

  test('a bucket outside the range is empty', () => {
    assert.deepEqual(analytics.sgComputeData(REGIONS, buckets, s, at('2026-11-02 12:00'), flights, 'time'), [{}, {}]);
  });
});

describe('map layer points', () => {
  test('interpolateRoutePoints: every 0.3 km between points up to 20 km apart', () => {
    const a = { lat: 57.8, lon: -152.4 };
    const near = { lat: 57.809, lon: -152.4 };   // 1.0 km north: 4 steps
    const far = { lat: 58.2, lon: -152.4 };      // 44 km on: a dropout, not a line
    const route = analytics.interpolateRoutePoints([{ points: [a, near, far] }, { points: [] }, {}]);
    assert.equal(route.length, 6);
    assert.deepEqual(route[0], [57.8, -152.4]);
    assert.ok(Math.abs(route[2][0] - 57.8045) < 1e-9 && route[2][1] === -152.4);
    assert.deepEqual(route.slice(4), [[57.809, -152.4], [58.2, -152.4]]);
  });

  test('endpointHeatPoints: attributed hours, or one per endpoint; no coordinates, not on the map', () => {
    const flights = [flight(KODIAK, KATMAI, '2026-10-01 09:00', 2), flight(NOWHERE, SPINE, '2026-10-01 12:00', 1)];
    assert.deepEqual(analytics.endpointHeatPoints(REGIONS, flights, 'time'), [[...KATMAI, 2], [...SPINE, 0.5]]);
    assert.deepEqual(analytics.endpointHeatPoints(REGIONS, flights, 'stops'), [[...KODIAK, 1], [...KATMAI, 1], [...SPINE, 1]]);
  });
});

test('reads the clock only from its parameters, and the page’s globals bind the operator timezone', () => {
  const s = at('2026-10-20 23:30');
  const e = at('2026-11-03 12:00');
  const flights = [flight(KODIAK, KATMAI, '2026-10-20 23:30', 2, [{ lat: 57.8, lon: -152.4 }, { lat: 57.809, lon: -152.4 }]),
    flight(SPINE, KATMAI, '2026-11-01 20:00', 1)];
  const realNow = Date.now;
  Date.now = () => { throw new Error('Date.now() read'); };
  let buckets, data, route, heat;
  try {
    buckets = analytics.sgGenerateBuckets(TZ, s, e, 'day');
    data = analytics.sgComputeData(REGIONS, buckets, s, e, flights, 'time');
    route = analytics.interpolateRoutePoints(flights);
    heat = analytics.endpointHeatPoints(REGIONS, flights, 'time');
  } finally {
    Date.now = realNow;
  }
  assert.equal(buckets.length, 15);
  const engine = loadEngine();
  assert.deepEqual(plain(engine.sgGenerateBuckets(s, e, 'day')), buckets);
  assert.deepEqual(plain(engine.sgComputeDataIn(REGIONS, buckets, s, e, flights, 'time')), data);
  assert.deepEqual(plain(engine.interpolateRoutePoints(flights)), route);
  assert.deepEqual(plain(engine.endpointHeatPointsIn(REGIONS, flights, 'time')), heat);
});
