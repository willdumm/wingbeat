// @wingbeat/core/accounting, imported directly: a flight's hours split between the
// regions it flew to (home bases take none), stops per region, and both per operator
// month. The timezone and the regions are parameters; the page's global binds the
// timezone (checked through the shipped bundle at the end).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore, plain, TZ } from './core.mjs';
import { loadEngine } from './harness.mjs';
import { REGIONS, KODIAK, SPINE, KATMAI, AWAY } from './regions-fixture.mjs';

const accounting = await importCore('accounting');
const time = await importCore('time');

const at = (s) => time.tzLocalToEpoch(TZ, ...s.split(' '));
// A flight from a to b ([lat, lon], or [null, null] for a manual flight's unpicked
// endpoint), starting at the operator's local time, lasting hours.
const flight = (a, b, start, hours) => ({
  start_time: at(start), end_time: at(start) + hours * 3600,
  start_lat: a[0], start_lon: a[1], end_lat: b[0], end_lon: b[1],
});
const NOWHERE = [null, null];

describe('computeWeightedEndpoints', () => {
  test('between two away regions, half the hours each', () => {
    assert.deepEqual(accounting.computeWeightedEndpoints(REGIONS, flight(SPINE, KATMAI, '2026-10-01 09:00', 2)), [
      { lat: SPINE[0], lon: SPINE[1], weight: 1 },
      { lat: KATMAI[0], lon: KATMAI[1], weight: 1 },
    ]);
  });

  test('from or to a home base, all the hours to the other end; base to base, none', () => {
    assert.deepEqual(accounting.computeWeightedEndpoints(REGIONS, flight(KODIAK, KATMAI, '2026-10-01 09:00', 2)),
      [{ lat: KATMAI[0], lon: KATMAI[1], weight: 2 }]);
    assert.deepEqual(accounting.computeWeightedEndpoints(REGIONS, flight(SPINE, KODIAK, '2026-10-01 09:00', 1.5)),
      [{ lat: SPINE[0], lon: SPINE[1], weight: 1.5 }]);
    assert.deepEqual(accounting.computeWeightedEndpoints(REGIONS, flight(KODIAK, KODIAK, '2026-10-01 09:00', 1)), []);
  });

  test('before the regions load, nothing is a home base', () => {
    assert.equal(accounting.computeWeightedEndpoints(null, flight(KODIAK, KATMAI, '2026-10-01 09:00', 2)).length, 2);
  });
});

describe('region hours and stops', () => {
  const flights = [
    flight(KODIAK, KATMAI, '2026-10-01 09:00', 2),
    flight(KATMAI, SPINE, '2026-10-01 12:00', 1),
    flight(SPINE, KODIAK, '2026-10-01 14:00', 0.5),
    flight(KODIAK, AWAY, '2026-10-02 09:00', 3),
    flight(NOWHERE, KODIAK, '2026-10-03 09:00', 1),
  ];

  test('computeRegionHours: each region’s attributed hours', () => {
    assert.deepEqual(accounting.computeRegionHours(REGIONS, flights),
      { Katmai: 2.5, 'Kodiak Spine': 1, Other: 3, 'Unknown location': 1 });
  });

  test('computeRegionStops: flights that ended in each region, home bases included', () => {
    assert.deepEqual(accounting.computeRegionStops(REGIONS, flights),
      { Katmai: 1, 'Kodiak Spine': 1, Kodiak: 2, Other: 1 });
  });

  test('no flights, no totals', () => {
    assert.deepEqual(accounting.computeRegionHours(REGIONS, []), {});
    assert.deepEqual(accounting.computeRegionStops(REGIONS, []), {});
  });
});

describe('computeMonthlyAccounting', () => {
  // 20:00 AKDT on Oct 31 is 04:00 UTC on Nov 1: an October flight.
  const flights = [
    flight(KODIAK, KATMAI, '2026-10-31 20:00', 2),
    flight(KODIAK, SPINE, '2026-11-01 08:00', 1),
    flight(KODIAK, KATMAI, '2026-09-15 08:00', 1),
  ];

  test('by operator month of the start time, in first-seen order', () => {
    const months = accounting.computeMonthlyAccounting(TZ, REGIONS, flights);
    assert.deepEqual([...months.keys()], ['2026-10', '2026-11', '2026-09']);
    assert.deepEqual(months.get('2026-10'), { hours: { Katmai: 2 }, stops: { Katmai: 1 } });
    assert.deepEqual(months.get('2026-11'), { hours: { 'Kodiak Spine': 1 }, stops: { 'Kodiak Spine': 1 } });
  });

  test('in another operator timezone the same instant is another month', () => {
    const months = accounting.computeMonthlyAccounting('Europe/Berlin', REGIONS, flights);
    assert.deepEqual([...months.keys()], ['2026-11', '2026-09']);
  });
});

test('the page’s global binds the operator timezone', () => {
  const flights = [flight(KODIAK, KATMAI, '2026-10-31 20:00', 2), flight(SPINE, KATMAI, '2026-11-01 08:00', 1)];
  const engine = loadEngine();
  assert.deepEqual(plain([...engine.computeMonthlyAccountingIn(REGIONS, flights)]),
    [...accounting.computeMonthlyAccounting(TZ, REGIONS, flights)]);
  assert.deepEqual(plain(engine.computeRegionHoursIn(REGIONS, flights)), accounting.computeRegionHours(REGIONS, flights));
  assert.equal(engine.tzLongMonthLabel(2026, 10), 'October 2026');
});
