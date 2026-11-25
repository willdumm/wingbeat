/**
 * The rules behind the Live view and the aircraft status cards: each tracker's live
 * position (from its newest raw point), whether it's in flight, GPS freshness, when to
 * poll next, and which flight is "the same tracked flight" across re-segmentation.
 *
 * Takes the flight threshold (km/h, the server's SPEED_THRESHOLD_KMH) and the clock
 * (`now`, Unix seconds) as parameters.
 */
import type { FlightPoint, TrackedFlight } from './api/flights';
import type { RefreshResult } from './flight-store';
import { toFeet, toKnots } from './format';
import { fmtTzPointTime, relativeTime } from './time';

/** A GPS fix younger than this (seconds) shows as fresh on its status card. */
export const GPS_FRESH_SECS = 240;

/** A tracker sends a fix about this often (seconds) in flight: the next poll aims just after it. */
export const LIVE_FIX_INTERVAL_SECS = 150;
/** The poll delays (ms): at least this in flight, and this with nothing in flight. */
export const LIVE_POLL_MIN_MS = 30_000;
export const LIVE_POLL_IDLE_MS = 60_000;

/**
 * The trackers' colors on the map and the status cards (ColorBrewer Dark2), by position. A
 * data series palette, not UI chrome, so not from tokens.ts.
 */
export const TRACKER_COLORS: readonly string[] = ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'];

/** The trackers that are on (active and not deleted), in order: what trackerColor() takes. */
export function activeTrackers<T extends { active: number | boolean; deleted: number | boolean }>(trackers: T[]): T[] {
  return trackers.filter((t) => t.active && !t.deleted);
}

/**
 * A tracker's color: its position among the active trackers, so colors stay put as long as
 * the tracker list does. null for a tracker not among them (the caller's faint text color).
 */
export function trackerColor(activeTrackers: { id: number }[], trackerId: number): string | null {
  const idx = activeTrackers.findIndex(t => t.id === trackerId);
  return idx >= 0 ? TRACKER_COLORS[idx % TRACKER_COLORS.length] : null;
}

/** A tracker's live position: its newest raw point, plus what the last refresh said about it. */
export interface LiveData {
  lat: number;
  lon: number;
  velocity_kmh: number | null;
  elevation_m: number | null;
  course_deg: number | null;
  garmin_time: number;
  /** The tracker's newest point of any kind (the card's GPS time); null until the first refresh. */
  last_point_time: number | null;
  /** Its points since its latest flight (the ground trail); empty until the first refresh. */
  ground_trail: FlightPoint[];
  location_label: string | null;
  last_polled: number | null;
}

/**
 * Each tracker's live data, from its latest flight's last point (the tracker's own records:
 * positions don't depend on corrections). getRaw is the store's getRaw; refreshResult the
 * last refresh's, or null before the first.
 */
export function trackerLiveData(
  trackers: { id: number }[],
  getRaw: (trackerIds: number[]) => TrackedFlight[],
  refreshResult: Partial<RefreshResult> | null,
): Record<number, LiveData> {
  const result: Record<number, LiveData> = {};
  for (const tracker of trackers) {
    const sorted = getRaw([tracker.id]);
    if (!sorted.length) continue;
    const latest = sorted[sorted.length - 1];
    const lp = latest.points[latest.points.length - 1];
    if (!lp) continue;
    result[tracker.id] = {
      lat: lp.lat, lon: lp.lon,
      velocity_kmh: lp.v, elevation_m: lp.e, course_deg: lp.c,
      garmin_time: lp.t,
      last_point_time: refreshResult?.lastPointTimeByTracker?.[tracker.id] ?? null,
      ground_trail: refreshResult?.groundTrailsByTracker?.[tracker.id] ?? [],
      location_label: refreshResult?.liveLabelsByTracker?.[tracker.id] ?? null,
      last_polled: refreshResult?.lastPolled ?? null,
    };
  }
  return result;
}

/** Whether a tracker's live data says it's in flight (at or above the threshold). */
export function isInFlight(thresholdKmh: number, live: { velocity_kmh?: number | null } | null | undefined): boolean {
  return !!live && (live.velocity_kmh ?? 0) >= thresholdKmh;
}

/** A tracker's ground trail: where the pilot went after landing, while the plane stayed put. */
export interface GroundTrail {
  /** The landing spot (the live position, where the plane marker stays), then each point since. */
  line: { lat: number; lon: number }[];
  /** The tracker's current position: the pilot, carrying it. */
  pilot: { lat: number; lon: number };
  /** Its points since the latest flight (ground_trail's). */
  points: FlightPoint[];
}

/**
 * A tracker's ground trail, drawn from its plane marker: none while it's in flight, or
 * before it has moved since its latest flight (or before the first refresh).
 */
export function groundTrail(thresholdKmh: number, live: LiveData | null | undefined): GroundTrail | null {
  if (!live || isInFlight(thresholdKmh, live)) return null;
  const points = live.ground_trail;
  if (!points.length) return null;
  const last = points[points.length - 1];
  return {
    line: [{ lat: live.lat, lon: live.lon }, ...points.map((p) => ({ lat: p.lat, lon: p.lon }))],
    pilot: { lat: last.lat, lon: last.lon },
    points,
  };
}

/** Whether a GPS time (the card's, Unix seconds) is fresh. */
export function isGpsFresh(now: number, gpsTime: number): boolean {
  return (now - gpsTime) < GPS_FRESH_SECS;
}

/**
 * In progress: the flight is its tracker's most recent (flights is newest first, as the
 * dashboard's allFlights) and the tracker is in flight.
 */
export function isFlightInProgress(
  thresholdKmh: number,
  flight: { id: number; tracker_id: number | null },
  flights: { id: number; tracker_id: number | null }[],
  liveByTracker: Record<number, { velocity_kmh?: number | null }>,
): boolean {
  const latestForTracker = flights.find(f => f.tracker_id === flight.tracker_id);
  const trackerLive = flight.tracker_id == null ? null : liveByTracker[flight.tracker_id] ?? null;
  return latestForTracker?.id === flight.id && isInFlight(thresholdKmh, trackerLive);
}

/**
 * The adaptive poll's next delay (ms), and the newest in-flight fix it has now seen (pass
 * it back next time). In flight, a new fix schedules the poll for just after the next
 * expected one of the tracker whose fix is oldest (so no tracker's next fix is missed),
 * but never sooner than LIVE_POLL_MIN_MS; with no new fix, LIVE_POLL_MIN_MS. With nothing
 * in flight, LIVE_POLL_IDLE_MS.
 */
export function nextLivePoll(
  thresholdKmh: number,
  now: number,
  liveByTracker: Record<number, { velocity_kmh?: number | null; garmin_time?: number | null }>,
  lastKnownGarminTime: number | null,
): { delayMs: number; lastKnownGarminTime: number | null } {
  const inFlight = Object.values(liveByTracker).filter(d => isInFlight(thresholdKmh, d));
  if (!inFlight.length) return { delayMs: LIVE_POLL_IDLE_MS, lastKnownGarminTime };

  // The max garmin_time detects new data; the min schedules the poll.
  let latestGarminTime = 0;
  let earliestGarminTime = 0;
  let firstInFlight = true;
  for (const d of inFlight) {
    if (!d.garmin_time) continue;
    if (d.garmin_time > latestGarminTime) latestGarminTime = d.garmin_time;
    if (firstInFlight || d.garmin_time < earliestGarminTime) {
      earliestGarminTime = d.garmin_time;
      firstInFlight = false;
    }
  }
  if (latestGarminTime && latestGarminTime !== lastKnownGarminTime) {
    const nextExpectedSec = (earliestGarminTime || latestGarminTime) + LIVE_FIX_INTERVAL_SECS;
    return { delayMs: Math.max(LIVE_POLL_MIN_MS, (nextExpectedSec - now) * 1000), lastKnownGarminTime: latestGarminTime };
  }
  return { delayMs: LIVE_POLL_MIN_MS, lastKnownGarminTime };
}

export type MaybeEdited = { tracker_id: number | null; start_time: number; edit?: { original: Record<string, unknown> } | null };

/**
 * A flight's identity across re-segmentation: its tracker's own start time (a corrected
 * departure doesn't change it).
 */
export function trackedStart(f: MaybeEdited): number {
  return f.edit && 'start_time' in f.edit.original ? f.edit.original.start_time as number : f.start_time;
}

/** Whether two flights are the same tracked flight (manual flights have no tracker, so never). */
export function sameTrackedFlight(a: MaybeEdited, b: MaybeEdited): boolean {
  return a.tracker_id != null && a.tracker_id === b.tracker_id && trackedStart(a) === trackedStart(b);
}

/**
 * A day view's flight numbers (the end markers' and the "Flight 2 end" labels'), for its
 * flights in chronological order: with flights of several trackers, each tracker's flights
 * with points count from 1; with one tracker, a flight's place in the day. null for a flight
 * without points, which has nothing to draw.
 */
export function dayFlightNumbers(flights: readonly { tracker_id: number | null; points?: readonly unknown[] | null }[]): (number | null)[] {
  const drawn = (f: (typeof flights)[number]) => (f.points ?? []).length > 0;
  const multiTracker = new Set(flights.filter(drawn).map((f) => f.tracker_id)).size > 1;
  const perTracker = new Map<number | null, number>();
  return flights.map((f, i) => {
    if (!drawn(f)) return null;
    if (!multiTracker) return i + 1;
    const n = (perTracker.get(f.tracker_id) ?? 0) + 1;
    perTracker.set(f.tracker_id, n);
    return n;
  });
}

/**
 * A day's numbered end markers: circles END_MARKER.size across, merged into a pill of
 * circles (END_MARKER.gap apart, END_MARKER.pad inside its border) wherever they'd overlap.
 */
export const END_MARKER = { size: 20, gap: 2, pad: 4 } as const;

/** Half the width of a pill of n end markers. */
export function endPillHalfWidth(n: number): number {
  const { size, gap, pad } = END_MARKER;
  return (n * size + (n - 1) * gap + 2 * pad) / 2;
}

/** A group of end markers: their indices in the input, and the group's centroid in pixels. */
export interface EndMarkerGroup {
  members: number[];
  x: number;
  y: number;
}

/**
 * Groups end markers by where they are on screen (pixels at the map's current zoom): a
 * marker joins the first group whose pill it would overlap, which then moves to the
 * centroid of its markers. Re-run on zoom, so pills split apart as the map zooms in.
 */
export function groupEndMarkers(points: { x: number; y: number }[]): EndMarkerGroup[] {
  const r = END_MARKER.size / 2;
  const pillHalfHeight = r + END_MARKER.pad;
  const groups: EndMarkerGroup[] = [];
  points.forEach((pt, i) => {
    const group = groups.find((g) =>
      Math.abs(pt.x - g.x) < endPillHalfWidth(g.members.length) + r &&
      Math.abs(pt.y - g.y) < pillHalfHeight + r);
    if (!group) {
      groups.push({ members: [i], x: pt.x, y: pt.y });
      return;
    }
    const n = group.members.length;
    group.members.push(i);
    group.x = (group.x * n + pt.x) / (n + 1);
    group.y = (group.y * n + pt.y) / (n + 1);
  });
  return groups;
}

/**
 * A position's Web Mercator pixel coordinates at a zoom (tileSize 512 for MapLibre):
 * what groupEndMarkers needs on a map that only reports its zoom.
 */
export function mercatorPixel(lat: number, lon: number, zoom: number, tileSize = 512): { x: number; y: number } {
  const world = tileSize * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * world,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world,
  };
}

/** How far from a track point, in screen pixels, a tap or the cursor still snaps to it. */
export const SNAP_PX = 30;

/**
 * The index of the point nearest target on screen, within maxPx, or -1: what the hover and
 * the point picker snap to. project gives a point's screen position (the web's
 * latLngToContainerPoint, or mercatorPixel at the map's zoom with target projected the same way).
 */
export function nearestPointIdx<P>(
  target: { x: number; y: number },
  points: readonly P[],
  project: (p: P) => { x: number; y: number },
  maxPx = SNAP_PX,
): number {
  let minPx = Infinity, nearest = -1;
  points.forEach((p, i) => {
    const pt = project(p);
    const d = Math.hypot(target.x - pt.x, target.y - pt.y);
    if (d < minPx) { minPx = d; nearest = i; }
  });
  return minPx <= maxPx ? nearest : -1;
}

/** A compass heading's 16-point direction ("NNE"). */
export function cardinalDir(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** What a tracker's location details show (the dashboard's location popup, the app's sheet). */
export interface LocationDetails {
  /** "57.800000, -152.400000", as copied. */
  coords: string;
  googleMapsUrl: string;
  /** The tracker's Garmin MapShare page (inReach trackers only). */
  mapshareUrl: string | null;
  /** [label, value] rows: tracker, aircraft, pilot, altitude, speed, heading, location, GPS fix. */
  rows: [string, string][];
}

type DetailsTracker = { name: string; assigned_aircraft?: string | null };

/** The coordinates as copied, and their Google Maps link. */
function coordsAndLinks(lat: number, lon: number): Pick<LocationDetails, 'coords' | 'googleMapsUrl'> {
  const latStr = lat.toFixed(6);
  const lonStr = lon.toFixed(6);
  return { coords: latStr + ', ' + lonStr, googleMapsUrl: 'https://www.google.com/maps?q=' + latStr + ',' + lonStr };
}

/** The tracker, aircraft and pilot rows. */
function trackerRows(tracker: DetailsTracker | null, pilotName: string | null | undefined): [string, string][] {
  const rows: [string, string][] = [];
  if (tracker) {
    rows.push(['Tracker', tracker.name]);
    if (tracker.assigned_aircraft) rows.push(['Aircraft', tracker.assigned_aircraft]);
  }
  if (pilotName) rows.push(['Pilot', pilotName]);
  return rows;
}

/**
 * A tracker's location details from its live data. pilotName: its latest flight's pilot.
 * null without a position.
 */
export function locationDetails(
  now: number,
  tracker: (DetailsTracker & { mapshare_url?: string | null }) | null,
  d: LiveData | null | undefined,
  pilotName: string | null | undefined,
): LocationDetails | null {
  if (d?.lat == null || d.lon == null) return null;
  const rows = trackerRows(tracker, pilotName);
  if (d.elevation_m != null) rows.push(['Altitude', toFeet(d.elevation_m)]);
  if (d.velocity_kmh != null) rows.push(['Speed', toKnots(d.velocity_kmh)]);
  if (d.course_deg != null) rows.push(['Heading', Math.round(d.course_deg) + '° ' + cardinalDir(d.course_deg)]);
  if (d.location_label) rows.push(['Location', d.location_label]);
  const gpsTime = d.last_point_time ?? d.garmin_time;
  if (gpsTime) rows.push(['GPS fix', relativeTime(now, gpsTime)]);
  return { ...coordsAndLinks(d.lat, d.lon), mapshareUrl: tracker?.mapshare_url ?? null, rows };
}

/** A track point the point picker snapped to (its time in Unix seconds). */
export interface PickedPoint {
  time: number | null;
  velocity_kmh: number | null;
  elevation_m: number | null;
}

/**
 * The point picker's details for a tapped position: the coordinates and, when it snapped to
 * a track point, that point's tracker, aircraft, pilot, time, speed and altitude.
 */
export function pickedPointDetails(
  tz: string,
  lat: number,
  lon: number,
  point: PickedPoint | null,
  tracker: DetailsTracker | null,
  pilotName: string | null | undefined,
): LocationDetails {
  const rows = point ? trackerRows(tracker, pilotName) : [];
  if (point) {
    if (point.time) rows.push(['Time', fmtTzPointTime(tz, point.time)]);
    if (point.velocity_kmh != null) rows.push(['Speed', toKnots(point.velocity_kmh)]);
    if (point.elevation_m != null) rows.push(['Altitude', toFeet(point.elevation_m)]);
  }
  return { ...coordsAndLinks(lat, lon), mapshareUrl: null, rows };
}
