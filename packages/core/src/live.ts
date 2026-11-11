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

/** A GPS fix younger than this (seconds) shows as fresh on its status card. */
export const GPS_FRESH_SECS = 240;

/** A tracker sends a fix about this often (seconds) in flight: the next poll aims just after it. */
export const LIVE_FIX_INTERVAL_SECS = 150;
/** The poll delays (ms): at least this in flight, and this with nothing in flight. */
export const LIVE_POLL_MIN_MS = 30_000;
export const LIVE_POLL_IDLE_MS = 60_000;

/** The trackers' colors on the map and the status cards (ColorBrewer Dark2), by position. */
export const TRACKER_COLORS: readonly string[] = ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'];

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

type MaybeEdited = { tracker_id: number | null; start_time: number; edit?: { original: Record<string, unknown> } | null };

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
