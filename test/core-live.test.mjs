// @wingbeat/core/live, imported directly: each tracker's live data from its newest raw
// point, in flight / in progress, GPS freshness, the adaptive poll's next delay, and the
// same-tracked-flight test the dashboard's map refresh follows flights with. The
// threshold and the clock are parameters; the page's globals bind them (checked through
// the shipped bundle at the end).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore } from './core.mjs';
import { loadEngine, plain } from './harness.mjs';

const live = await importCore('live');
const KMH = 37;   // the server's SPEED_THRESHOLD_KMH
const NOW = 1_793_739_600;

const point = (t, v, over = {}) => ({ t, lat: 57.8, lon: -152.4, v, e: 300, c: 90, ...over });
const raw = {
  1: [{ id: 10, points: [point(NOW - 4000, 120)] }, { id: 11, points: [point(NOW - 200, 110), point(NOW - 120, 140, { lat: 58 })] }],
  2: [{ id: 20, points: [point(NOW - 9000, 3)] }],
  3: [{ id: 30, points: [] }],
};
const getRaw = ([id]) => raw[id] ?? [];

describe('trackerLiveData', () => {
  test('each tracker’s latest flight’s last point, with what the refresh said about it', () => {
    const result = {
      lastPolled: NOW - 30,
      liveLabelsByTracker: { 1: 'Near Kodiak' },
      lastPointTimeByTracker: { 1: NOW - 60, 2: NOW - 100 },
      groundTrailsByTracker: { 2: [point(NOW - 100, 0)] },
    };
    const data = live.trackerLiveData([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], getRaw, result);
    assert.deepEqual(Object.keys(data), ['1', '2'], 'no points or no flights: no live data');
    assert.deepEqual(data[1], {
      lat: 58, lon: -152.4, velocity_kmh: 140, elevation_m: 300, course_deg: 90, garmin_time: NOW - 120,
      last_point_time: NOW - 60, ground_trail: [], location_label: 'Near Kodiak', last_polled: NOW - 30,
    });
    assert.equal(data[2].ground_trail.length, 1);
    assert.equal(data[2].location_label, null);
  });

  test('before the first refresh: no GPS time, trail, label or poll time', () => {
    const d = live.trackerLiveData([{ id: 1 }], getRaw, null)[1];
    assert.deepEqual([d.last_point_time, d.ground_trail, d.location_label, d.last_polled], [null, [], null, null]);
  });
});

describe('in flight and in progress', () => {
  test('in flight at or above the threshold; no data or no speed is on the ground', () => {
    assert.equal(live.isInFlight(KMH, { velocity_kmh: 37 }), true);
    assert.equal(live.isInFlight(KMH, { velocity_kmh: 36.9 }), false);
    assert.equal(live.isInFlight(KMH, { velocity_kmh: null }), false);
    assert.equal(live.isInFlight(KMH, null), false);
  });

  test('in progress: its tracker’s newest flight, with the tracker in flight', () => {
    const flights = [{ id: 11, tracker_id: 1 }, { id: 20, tracker_id: 2 }, { id: 10, tracker_id: 1 }, { id: 99, tracker_id: null }];
    const liveBy = { 1: { velocity_kmh: 140 }, 2: { velocity_kmh: 3 } };
    const inProgress = flights.filter(f => live.isFlightInProgress(KMH, f, flights, liveBy)).map(f => f.id);
    assert.deepEqual(inProgress, [11]);
  });

  test('GPS is fresh for under four minutes', () => {
    assert.equal(live.GPS_FRESH_SECS, 240);
    assert.equal(live.isGpsFresh(NOW, NOW - 239), true);
    assert.equal(live.isGpsFresh(NOW, NOW - 240), false);
  });
});

describe('nextLivePoll', () => {
  test('nothing in flight: a minute, and the last fix seen is kept', () => {
    assert.deepEqual(live.nextLivePoll(KMH, NOW, { 2: { velocity_kmh: 3, garmin_time: NOW - 10 } }, 123),
      { delayMs: 60_000, lastKnownGarminTime: 123 });
  });

  test('a new fix: just after the next expected fix of the tracker heard from longest ago', () => {
    const liveBy = { 1: { velocity_kmh: 140, garmin_time: NOW - 60 }, 2: { velocity_kmh: 90, garmin_time: NOW - 100 } };
    // Tracker 2's next fix is due 150 s after its last: in 50 s.
    assert.deepEqual(live.nextLivePoll(KMH, NOW, liveBy, null), { delayMs: 50_000, lastKnownGarminTime: NOW - 60 });
  });

  test('never sooner than 30 s; the same fix again polls in 30 s', () => {
    const liveBy = { 1: { velocity_kmh: 140, garmin_time: NOW - 140 } };
    assert.deepEqual(live.nextLivePoll(KMH, NOW, liveBy, null), { delayMs: 30_000, lastKnownGarminTime: NOW - 140 });
    assert.deepEqual(live.nextLivePoll(KMH, NOW, { 1: { velocity_kmh: 140, garmin_time: NOW - 60 } }, NOW - 60),
      { delayMs: 30_000, lastKnownGarminTime: NOW - 60 });
  });
});

describe('sameTrackedFlight', () => {
  const tracked = { tracker_id: 1, start_time: 1000 };
  test('a corrected departure keeps the tracker’s own start', () => {
    const corrected = { tracker_id: 1, start_time: 900, edit: { original: { start_time: 1000 } } };
    assert.equal(live.trackedStart(corrected), 1000);
    assert.equal(live.sameTrackedFlight(corrected, tracked), true);
  });

  test('another tracker, another start, or a manual flight is not the same', () => {
    assert.equal(live.sameTrackedFlight({ tracker_id: 2, start_time: 1000 }, tracked), false);
    assert.equal(live.sameTrackedFlight({ tracker_id: 1, start_time: 1001 }, tracked), false);
    const manual = { tracker_id: null, start_time: 1000 };
    assert.equal(live.sameTrackedFlight(manual, manual), false);
  });
});

test('the page’s globals bind the server’s threshold and the clock', () => {
  const engine = loadEngine();
  engine.setNow(NOW * 1000);
  const liveBy = { 1: { velocity_kmh: 140, garmin_time: NOW - 60 } };
  assert.deepEqual(plain(engine.nextLivePoll(liveBy, null)), live.nextLivePoll(KMH, NOW, liveBy, null));
  assert.equal(engine.isInFlight({ velocity_kmh: 36 }), false);
  assert.equal(engine.isInFlight({ velocity_kmh: 37 }), true);
  assert.equal(engine.isGpsFresh(NOW - 100), true);
  assert.equal(engine.isGpsFresh(NOW - 300), false);
});
