import type { FlightPoint, TrackedFlight } from '@wingbeat/core/api/flights';
import { TRACKER_COLORS, type LiveData } from '@wingbeat/core/live';
import type { Flight } from '@/lib/flights';
import {
  cardStack, dayMap, flightTrackPicks, followWait, groundTrailLines, initialView, latestTracks, liveBounds, liveTrackPicks, mapDays,
  pickDetails, positionFeatures, spotDetails, statusCards, trackStarts, type StatusCard,
} from '@/lib/live';

const NOW = 1_793_739_600;
const trackers = [
  { id: 1, name: 'Tracker 1', assigned_aircraft: 'N123AB' },
  { id: 2, name: 'Tracker 2', assigned_aircraft: null },
  { id: 3, name: 'Tracker 3', assigned_aircraft: null },
];
const liveData = (over: Partial<LiveData>): LiveData => ({
  lat: 57.8, lon: -152.4, velocity_kmh: 0, elevation_m: 30, course_deg: 90, garmin_time: NOW - 600,
  last_point_time: null, ground_trail: [], location_label: null, last_polled: NOW - 30, ...over,
});
const pt = (lon: number, lat: number, over: Partial<FlightPoint> = {}): FlightPoint =>
  ({ t: 0, lat, lon, v: 0, e: 0, c: 0, ...over });
const tracked = (id: number, tracker_id: number, points: FlightPoint[]): TrackedFlight => ({
  id, tracker_id, start_time: NOW - 3600, end_time: null, modified_at: NOW, aircraft_tail: null, pilot_id: null,
  pilot_name: 'Sam', origin_label: null, destination_label: null, start_lat: null, start_lon: null, end_lat: null,
  end_lon: null, points,
});
const live = {
  1: liveData({ velocity_kmh: 180, elevation_m: 300, garmin_time: NOW - 120, location_label: 'Kodiak' }),
  2: liveData({ last_point_time: NOW - 7200 }),
};

test('one card per tracker, as the dashboard builds it', () => {
  const [a, b, c] = statusCards(trackers, live, NOW, 'faint');
  expect(a).toMatchObject({
    label: 'N123AB', color: TRACKER_COLORS[0], inFlight: true, gps: 'GPS 2 min ago', gpsFresh: true,
    metrics: '984 ft · 97.2 kt', location: 'Kodiak', position: [-152.4, 57.8],
  });
  expect(b).toMatchObject({ label: 'Tracker 2', inFlight: false, gps: 'GPS 2 hr ago', gpsFresh: false, metrics: null });
  expect(c).toMatchObject({ color: TRACKER_COLORS[2], gps: null, gpsTime: null, position: null });
  expect(b.gpsTime).toBe(NOW - 7200);
});

describe('cardStack', () => {
  const card = (trackerId: number, inFlight: boolean, gpsTime: number | null = null): StatusCard => ({
    trackerId, label: 'T' + trackerId, color: 'c', inFlight, gps: null, gpsTime, gpsFresh: false,
    metrics: null, location: null, position: null,
  });
  const ids = (s: { shown: StatusCard[] }) => s.shown.map((c) => c.trackerId);
  test('collapsed: the pinned cards, in the cards’ order; the in-flight ones not shown counted', () => {
    const cards = [card(1, false), card(2, true), card(3, false), card(4, true)];
    expect(cardStack(cards, [3, 2], false)).toEqual({ shown: [cards[1], cards[2]], moreInFlight: 1 });
    // A pinned tracker that's gone.
    expect(ids(cardStack(cards, [9, 4], false))).toEqual([4]);
  });
  test('collapsed with nothing pinned: the card that last reported', () => {
    expect(cardStack([card(1, true, 100), card(2, false, 300), card(3, false)], [], false))
      .toEqual({ shown: [expect.objectContaining({ trackerId: 2 })], moreInFlight: 1 });
    expect(ids(cardStack([card(1, false)], [9], false))).toEqual([1]);
    expect(ids(cardStack([], [], false))).toEqual([]);
  });
  test('open: every card', () => {
    const cards = [card(1, true), card(2, false)];
    expect(cardStack(cards, [2], true)).toEqual({ shown: cards, moreInFlight: 0 });
  });
});

test('positions for trackers with one; each tracker\'s latest track, in flight or not, and the bounds of all', () => {
  const cards = statusCards(trackers, live, NOW, 'faint');
  expect(positionFeatures(cards, live).features.map((f) => f.id)).toEqual([1, 2]);
  const raw: Record<number, TrackedFlight[]> = {
    1: [tracked(10, 1, [pt(2, 1)]), tracked(11, 1, [pt(-152, 57), pt(-152.4, 57.8)])],
    2: [tracked(20, 2, [pt(2, 1), pt(4, 3)])],
  };
  const tracks = latestTracks(cards, ([id]: number[]) => raw[id] ?? []);
  expect(tracks.features.map((f) => f.geometry.coordinates)).toEqual([[[-152, 57], [-152.4, 57.8]], [[2, 1], [4, 3]]]);
  expect(trackStarts(tracks).features.map((f) => [f.id, f.geometry.coordinates, f.properties])).toEqual([
    ['start-1', [-152, 57], { color: TRACKER_COLORS[0] }],
    ['start-2', [2, 1], { color: TRACKER_COLORS[1] }],
  ]);
  const [w, s, e, n] = liveBounds(tracks, positionFeatures(cards, live))!;
  expect([w, s, e, n]).toEqual([-152.4, 1, 4, 57.8]);
  expect(liveBounds({ type: 'FeatureCollection', features: [] })).toBeNull();
});

test('planes turned to their course; ground trails and their pilots only on the ground', () => {
  const trail = [{ t: NOW - 60, lat: 57.81, lon: -152.39, v: 4, e: 10, c: 0 }];
  const moved = { ...live, 1: { ...live[1], ground_trail: trail }, 2: { ...live[2], ground_trail: trail } };
  const cards = statusCards(trackers, moved, NOW, 'faint');
  const points = positionFeatures(cards, moved, { trails: true }).features;
  expect(points.map((f) => [f.id, f.properties])).toEqual([
    [1, { color: TRACKER_COLORS[0], inFlight: true, plane: true, course: 90 }],
    [2, { color: TRACKER_COLORS[1], inFlight: false, plane: true, course: 90 }],
    ['pilot-2', { color: TRACKER_COLORS[1], pilot: true }],
  ]);
  const trails = groundTrailLines(cards, moved).features;
  expect(trails.map((f) => f.id)).toEqual(['trail-2']);
  expect(trails[0].geometry.coordinates).toEqual([[-152.4, 57.8], [-152.39, 57.81]]);
});

test("the map opens on the instance's view, else the first position", () => {
  const cards = statusCards(trackers, live, NOW, 'faint');
  expect(initialView({ app_name: 'x', timezone: 'UTC', map_default_lat: 60, map_default_lng: -150, map_default_zoom: 6 }, cards))
    .toEqual({ center: [-150, 60], zoom: 5 });
  expect(initialView(undefined, cards)).toEqual({ center: [-152.4, 57.8], zoom: 8 });
  expect(initialView(undefined, [])).toEqual({ center: [0, 20], zoom: 1 });
});

describe('a day’s flights', () => {
  const TZ = 'America/Anchorage';
  // 2026-11-03 09:00 and 13:00 AKST, then 2026-11-04 10:00.
  const flight = (id: number, start: number, tracker_id: number | null, points = [pt(-152, 57), pt(-153, 58)]): Flight =>
    ({ id, start_time: start, end_time: start + 3600, tracker_id, points });
  const flights = [
    flight(1, 1_793_728_800, 1),
    flight(2, 1_793_743_200, 2, [pt(-150, 59), pt(-151, 60)]),
    flight(3, 1_793_745_000, null, []),
    flight(4, 1_793_818_800, 1),
  ];

  test('days with a tracked flight, newest first', () => {
    expect(mapDays(TZ, flights)).toEqual([
      { dayKey: '2026-11-04', title: expect.stringContaining('Nov 4'), count: 1 },
      { dayKey: '2026-11-03', title: expect.stringContaining('Nov 3'), count: 2 },
    ]);
  });

  test('each track in its color, numbered ends, a legend for several trackers, the bounds', () => {
    const d = dayMap(TZ, '2026-11-03', flights, {
      colorFor: (id) => 'c' + id, labelFor: (id) => 'T' + id, inProgress: (f) => f.id === 2,
    });
    expect(d.tracks.features.map((f) => f.properties)).toEqual([{ color: 'c1' }, { color: 'c2' }]);
    // Flight 2 is in progress: a start, no numbered end.
    expect(d.points.features.map((f) => [f.id, f.properties?.label])).toEqual([['start-1', undefined], ['start-2', undefined], ['end-1', '1']]);
    expect(d.legend).toEqual([
      { trackerId: 1, label: 'T1', color: 'c1', hidden: false },
      { trackerId: 2, label: 'T2', color: 'c2', hidden: false },
    ]);
    expect(d.bounds).toEqual([-153, 57, -150, 60]);
  });

  test('a hidden tracker\'s flights aren\'t drawn and the bounds leave them out; the numbers stay', () => {
    const d = dayMap(TZ, '2026-11-03', flights, {
      colorFor: (id) => 'c' + id, labelFor: (id) => 'T' + id, inProgress: () => false, hidden: [1],
    });
    expect(d.flights.map((f) => [f.flight.id, f.n])).toEqual([[2, 1]]);
    expect(d.points.features.map((f) => f.id)).toEqual(['start-2', 'end-2']);
    expect(d.legend.map((e) => [e.trackerId, e.hidden])).toEqual([[1, true], [2, false]]);
    expect(d.bounds).toEqual([-151, 59, -150, 60]);
  });
});


describe('the point picker', () => {
  const TZ = 'America/Anchorage';
  const picks = flightTrackPicks([{
    id: 1, start_time: NOW, end_time: NOW + 600, tracker_id: 1, pilot_name: 'Sam',
    points: [pt(-152, 57, { t: NOW, v: 185.2, e: 304.8, c: 45 }), pt(-151, 57.5, { t: NOW + 600, c: 90 })],
  }]);
  const trackerFor = (id: number) => trackers.find((t) => t.id === id) ?? null;

  test('the picks: each drawn point with its tracker and pilot', () => {
    expect(picks.map((p) => [p.point.lon, p.trackerId, p.pilotName])).toEqual([[-152, 1, 'Sam'], [-151, 1, 'Sam']]);
    const cards = statusCards(trackers, live, NOW, 'faint');
    const latest = liveTrackPicks(cards, live, (ids) => (ids[0] === 1 ? [tracked(10, 1, [pt(-152, 57)])] : []));
    expect(latest.map((p) => [p.point.lon, p.trackerId, p.pilotName])).toEqual([[-152, 1, 'Sam']]);
  });

  test('a tap within 30 px snaps to the nearest point, with its heading', () => {
    // At zoom 10 a degree of longitude is about 730 px: 0.01° is about 7 px.
    const spot = pickDetails(TZ, [-152.01, 57], 10, picks, trackerFor);
    expect(spot).toMatchObject({ snapped: true, lngLat: [-152, 57], course: 45, coords: '57.000000, -152.000000' });
    expect(spot?.rows.slice(0, 3)).toEqual([['Tracker', 'Tracker 1'], ['Aircraft', 'N123AB'], ['Pilot', 'Sam']]);
  });

  test('a tap far from a track picks nothing; a long press is the spot itself', () => {
    expect(pickDetails(TZ, [-152.1, 57], 10, picks, trackerFor)).toBeNull();
    expect(spotDetails(TZ, [-152.1, 57])).toMatchObject({ snapped: false, lngLat: [-152.1, 57], course: null, rows: [] });
  });
});

test('a follow refit waits until the map has been left alone', () => {
  expect(followWait({ touchedAt: 0, now: 50_000, idleMs: 10_000 })).toBe(0);
  expect(followWait({ touchedAt: 45_000, now: 50_000, idleMs: 10_000 })).toBe(5_000);
  expect(followWait({ touchedAt: 50_000, now: 50_000, idleMs: 10_000 })).toBe(10_000);
});

test('a one-spot day still opens at a sensible zoom', () => {
  const one: Flight = { id: 1, start_time: 1_793_728_800, end_time: 1_793_732_400, tracker_id: 1, points: [pt(-152, 57)] };
  const d = dayMap('America/Anchorage', '2026-11-03', [one], { colorFor: () => 'c', labelFor: () => 'T', inProgress: () => false });
  const [w, s, e, n] = d.bounds!;
  expect(e - w).toBeCloseTo(0.05);
  expect(n - s).toBeCloseTo(0.05);
});
