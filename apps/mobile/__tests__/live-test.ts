import { TRACKER_COLORS, type LiveData } from '@wingbeat/core/live';
import { inFlightTracks, initialView, positionFeatures, statusCards } from '@/lib/live';

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

test("the map opens on the instance's view, else the first position", () => {
  const cards = statusCards(trackers, live, NOW, 'faint');
  expect(initialView({ app_name: 'x', timezone: 'UTC', map_default_lat: 60, map_default_lng: -150, map_default_zoom: 6 }, cards))
    .toEqual({ center: [-150, 60], zoom: 6 });
  expect(initialView(undefined, cards)).toEqual({ center: [-152.4, 57.8], zoom: 8 });
  expect(initialView(undefined, [])).toEqual({ center: [0, 20], zoom: 1 });
});
