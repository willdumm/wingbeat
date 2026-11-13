import { TRACKER_COLORS, type LiveData } from '@wingbeat/core/live';
import type { Flight } from '@/lib/flights';
import { dateToDayKey, dayKeyToDate, dayMap, groundTrailFeatures, inFlightTracks, initialView, mapDays, positionFeatures, statusCards } from '@/lib/live';

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
  expect(c).toMatchObject({ color: TRACKER_COLORS[2], gps: null, position: null });
});

test('positions for trackers with one; tracks only for those in flight', () => {
  const cards = statusCards(trackers, live, NOW, 'faint');
  expect(positionFeatures(cards, live).features.map((f) => f.id)).toEqual([1, 2]);
  const raw: Record<number, { points: { lat: number; lon: number }[] }[]> = {
    1: [{ points: [{ lat: 1, lon: 2 }] }, { points: [{ lat: 57, lon: -152 }, { lat: 57.8, lon: -152.4 }] }],
    2: [{ points: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }] }],
  };
  const tracks = inFlightTracks(cards, ([id]) => (raw[id] ?? []) as never);
  expect(tracks.features).toHaveLength(1);
  expect(tracks.features[0].geometry.coordinates).toEqual([[-152, 57], [-152.4, 57.8]]);
});

test('planes turned to their course; ground trails and their pilots only on the ground', () => {
  const trail = [{ t: NOW - 60, lat: 57.81, lon: -152.39, v: 4, e: 10, c: 0 }];
  const moved = { ...live, 1: { ...live[1], ground_trail: trail }, 2: { ...live[2], ground_trail: trail } };
  const cards = statusCards(trackers, moved, NOW, 'faint');
  const points = positionFeatures(cards, moved, { trails: true }).features;
  expect(points.map((f) => [f.id, f.properties])).toEqual([
    [1, { color: TRACKER_COLORS[0], inFlight: true, plane: true, course: 90 }],
    [2, { color: TRACKER_COLORS[1], inFlight: false, plane: true, course: 90 }],
    ['pilot-2', { color: TRACKER_COLORS[1], inFlight: false, pilot: true }],
  ]);
  const trails = groundTrailFeatures(cards, moved).features;
  expect(trails.map((f) => f.id)).toEqual(['trail-2']);
  expect(trails[0].geometry.coordinates).toEqual([[-152.4, 57.8], [-152.39, 57.81]]);
});

test("the map opens on the instance's view, else the first position", () => {
  const cards = statusCards(trackers, live, NOW, 'faint');
  expect(initialView({ app_name: 'x', timezone: 'UTC', map_default_lat: 60, map_default_lng: -150, map_default_zoom: 6 }, cards))
    .toEqual({ center: [-150, 60], zoom: 6 });
  expect(initialView(undefined, cards)).toEqual({ center: [-152.4, 57.8], zoom: 8 });
  expect(initialView(undefined, [])).toEqual({ center: [0, 20], zoom: 1 });
});

describe('a day’s flights', () => {
  const TZ = 'America/Anchorage';
  const pt = (lon: number, lat: number) => ({ t: 0, lat, lon, v: 0, e: 0, c: 0 });
  // 2026-11-03 09:00 and 13:00 AKST, then 2026-11-04 10:00.
  const flight = (id: number, start: number, tracker_id: number | null, points = [pt(-152, 57), pt(-153, 58)]) =>
    ({ id, start_time: start, end_time: start + 3600, tracker_id, points }) as unknown as Flight;
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
    expect(d.points.features.map((f) => [f.id, f.properties?.label])).toEqual([['start-1', undefined], ['end-1', '1'], ['start-2', undefined]]);
    expect(d.legend).toEqual([{ label: 'T1', color: 'c1' }, { label: 'T2', color: 'c2' }]);
    expect(d.bounds).toEqual([-153, 57, -150, 60]);
  });
});

describe('the date picker’s days', () => {
  test('a day key round-trips through a local date', () => {
    for (const key of ['2026-01-01', '2026-03-08', '2026-11-01', '2026-12-31']) expect(dateToDayKey(dayKeyToDate(key))).toBe(key);
  });
});
