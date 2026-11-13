// @wingbeat/core/live, imported directly: each tracker's live data from its newest raw
// point, in flight / in progress, GPS freshness, the adaptive poll's next delay, and the
// same-tracked-flight test the dashboard's map refresh follows flights with. The
// threshold and the clock are parameters; the page's globals bind them (checked through
// the shipped bundle at the end).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore, plain } from './core.mjs';
import { loadEngine } from './harness.mjs';

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

describe('trackerColor', () => {
  test("a tracker keeps its position's color, wrapping the palette; none when inactive", () => {
    const active = Array.from({ length: 9 }, (_, i) => ({ id: 100 + i }));
    assert.equal(live.trackerColor(active, 100), live.TRACKER_COLORS[0]);
    assert.equal(live.trackerColor(active, 101), live.TRACKER_COLORS[1]);
    assert.equal(live.trackerColor(active, 108), live.TRACKER_COLORS[0]);
    assert.equal(live.trackerColor(active, 5), null);
  });
});

describe('dayFlightNumbers', () => {
  const f = (tracker_id, n = 1) => ({ tracker_id, points: Array(n).fill({}) });
  test('one tracker: a flight’s place in the day, skipping none', () => {
    assert.deepEqual(live.dayFlightNumbers([f(1), f(1, 0), f(1)]), [1, null, 3]);
  });
  test('several trackers: each counts its drawn flights from 1', () => {
    assert.deepEqual(live.dayFlightNumbers([f(1), f(2), f(2, 0), f(1), f(2)]), [1, 1, null, 2, 2]);
  });
});

describe('groupEndMarkers', () => {
  test('overlapping markers merge into one pill at their centroid; distant ones stay apart', () => {
    const groups = live.groupEndMarkers([{ x: 0, y: 0 }, { x: 15, y: 5 }, { x: 200, y: 0 }]);
    assert.deepEqual(plain(groups), [{ members: [0, 1], x: 7.5, y: 2.5 }, { members: [2], x: 200, y: 0 }]);
  });
  test('a pill widens as it grows, so a marker beside it joins', () => {
    // 30px clears a single circle (overlap under 14 + 10 = 24px) but not a pill of two (25 + 10 = 35px).
    assert.equal(live.groupEndMarkers([{ x: 0, y: 0 }, { x: 30, y: 0 }]).length, 2);
    assert.equal(live.groupEndMarkers([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 0 }]).length, 1);
  });
  test('zooming in (pixels from mercatorPixel) splits a pill apart', () => {
    const ends = [[57.79, -152.39], [57.80, -152.40]];
    const at = (zoom) => live.groupEndMarkers(ends.map(([lat, lon]) => live.mercatorPixel(lat, lon, zoom))).length;
    assert.equal(at(8), 1);
    assert.equal(at(14), 2);
  });
});

describe('locationDetails', () => {
  const d = { lat: 57.8, lon: -152.4, velocity_kmh: 185.2, elevation_m: 304.8, course_deg: 23, garmin_time: NOW - 300,
    last_point_time: NOW - 120, ground_trail: [], location_label: 'Near Kodiak', last_polled: null };
  test('the popup’s coordinates, links and rows, in order', () => {
    const details = live.locationDetails(NOW, { name: 'inReach 1', assigned_aircraft: 'N77KZ', mapshare_url: 'https://share.garmin.com/x' }, d, 'Sam');
    assert.deepEqual(plain(details), {
      coords: '57.800000, -152.400000',
      googleMapsUrl: 'https://www.google.com/maps?q=57.800000,-152.400000',
      mapshareUrl: 'https://share.garmin.com/x',
      rows: [['Tracker', 'inReach 1'], ['Aircraft', 'N77KZ'], ['Pilot', 'Sam'], ['Altitude', '1,000 ft'], ['Speed', '100.0 kt'],
        ['Heading', '23° NNE'], ['Location', 'Near Kodiak'], ['GPS fix', '2 min ago']],
    });
  });
  test('only what’s known; nothing without a position', () => {
    const bare = { ...d, velocity_kmh: null, elevation_m: null, course_deg: null, location_label: null, last_point_time: null };
    assert.deepEqual(plain(live.locationDetails(NOW, null, bare, null).rows), [['GPS fix', '5 min ago']]);
    assert.equal(live.locationDetails(NOW, null, null, null), null);
  });
});

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
