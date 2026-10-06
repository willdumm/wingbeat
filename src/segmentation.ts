import { updateFlightLabelsFromCache } from './geocoding';
import { SPEED_THRESHOLD_KMH, haversineMiles } from './geo';

const SHORT_GAP_S = 6 * 60;     // 6 min
const LONG_GAP_S = 15 * 60;     // 15 min
const NEARBY_MI = 5;             // miles

interface RawPoint {
  id: number;
  garmin_time: number;
  lat: number;
  lon: number;
  velocity_kmh: number | null;
  aircraft_tail: string | null;
  pilot_id: number | null;
}

interface FlightCandidate {
  start_time: number;
  end_time: number;
  point_ids: number[];
  max_speed: number;
  start_lat: number;
  start_lon: number;
  aircraft_tail: string | null;
  pilot_id: number | null;
}

/** Shape shared between segmentation.ts and poller.ts to avoid a duplicate D1 query. */
export interface RecentFlightRow { id: number; end_time: number; }

/**
 * Returns the last two flights by start_time (index 0 = newest). Exported so
 * poll() can reuse the result for the d1 lookback date without an extra round-trip.
 */
export async function fetchRecentFlights(db: D1Database, trackerId: number): Promise<RecentFlightRow[]> {
  const { results } = await db
    .prepare('SELECT id, end_time FROM flights WHERE tracker_id = ? ORDER BY start_time DESC LIMIT 2')
    .bind(trackerId)
    .all<RecentFlightRow>();
  return results;
}

function isGapBoundary(pt: RawPoint, prev: RawPoint): boolean {
  const gap = pt.garmin_time - prev.garmin_time;
  if (gap > LONG_GAP_S) return true;
  if (gap > SHORT_GAP_S && haversineMiles(prev.lat, prev.lon, pt.lat, pt.lon) < NEARBY_MI) return true;
  return false;
}

function isBoundary(pt: RawPoint, prev: RawPoint | null): boolean {
  if ((pt.velocity_kmh ?? 0) < SPEED_THRESHOLD_KMH) return true;
  if (prev === null) return false;
  return isGapBoundary(pt, prev);
}

/**
 * Incremental segmentation: deletes the last (potentially in-progress) flight and
 * re-segments all points after the last completed flight's end. Falls back to a full
 * resegment when fewer than two flights exist.
 */
export async function runSegmentation(
  db: D1Database,
  trackerId: number,
  recentFlights?: RecentFlightRow[],
): Promise<void> {
  const recent = recentFlights ?? await fetchRecentFlights(db, trackerId);
  const [lastFlight, lastCompletedFlight] = recent;

  if (!lastCompletedFlight) {
    return resegment(db, trackerId);
  }

  await db.batch([
    db.prepare('DELETE FROM point_flights WHERE flight_id = ?').bind(lastFlight.id),
    db.prepare('DELETE FROM flights WHERE id = ?').bind(lastFlight.id),
  ]);

  const endPt =
    (await db
      .prepare('SELECT id, garmin_time, lat, lon, velocity_kmh, aircraft_tail, pilot_id FROM points WHERE garmin_time = ? AND tracker_id = ?')
      .bind(lastCompletedFlight.end_time, trackerId)
      .first<RawPoint>()) ?? null;

  const { results: points } = await db
    .prepare(
      'SELECT id, garmin_time, lat, lon, velocity_kmh, aircraft_tail, pilot_id FROM points WHERE garmin_time > ? AND tracker_id = ? ORDER BY garmin_time ASC'
    )
    .bind(lastCompletedFlight.end_time, trackerId)
    .all<RawPoint>();

  if (points.length === 0) return;

  const flights = segmentPoints(points, endPt);
  if (flights.length === 0) return;

  await db.batch(writeFlights(db, flights, trackerId));
  await updateFlightLabelsFromCache(db, trackerId);
}

/**
 * Wipes all derived tables for this tracker and re-runs segmentation over its raw points.
 */
export async function resegment(db: D1Database, trackerId: number): Promise<void> {
  const { results } = await db
    .prepare('SELECT id, garmin_time, lat, lon, velocity_kmh, aircraft_tail, pilot_id FROM points WHERE tracker_id = ? ORDER BY garmin_time ASC')
    .bind(trackerId)
    .all<RawPoint>();

  const deleteStmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM point_flights WHERE flight_id IN (SELECT id FROM flights WHERE tracker_id = ?)').bind(trackerId),
    db.prepare('DELETE FROM flights WHERE tracker_id = ?').bind(trackerId),
  ];

  const flights = results.length > 0 ? segmentPoints(results) : [];
  const insertStmts = flights.length > 0 ? writeFlights(db, flights, trackerId) : [];
  await db.batch([...deleteStmts, ...insertStmts]);
  await updateFlightLabelsFromCache(db, trackerId);
}

// ── Core algorithm ────────────────────────────────────────────────────────────

function segmentPoints(
  points: RawPoint[],
  initialLastPoint: RawPoint | null = null,
): FlightCandidate[] {
  const flights: FlightCandidate[] = [];
  let current: FlightCandidate | null = null;
  let pendingBoundary: RawPoint | null = null;
  let lastPoint: RawPoint | null = initialLastPoint;

  for (const pt of points) {
    if (!isBoundary(pt, lastPoint)) {
      if (current === null) {
        if (pendingBoundary !== null) {
          current = {
            start_time: pendingBoundary.garmin_time,
            end_time: pt.garmin_time,
            point_ids: [pendingBoundary.id, pt.id],
            max_speed: Math.max(pendingBoundary.velocity_kmh ?? 0, pt.velocity_kmh ?? 0),
            start_lat: pendingBoundary.lat,
            start_lon: pendingBoundary.lon,
            aircraft_tail: pendingBoundary.aircraft_tail ?? pt.aircraft_tail,
            pilot_id: pendingBoundary.pilot_id ?? pt.pilot_id,
          };
          pendingBoundary = null;
        } else {
          current = {
            start_time: pt.garmin_time,
            end_time: pt.garmin_time,
            point_ids: [pt.id],
            max_speed: pt.velocity_kmh ?? 0,
            start_lat: pt.lat,
            start_lon: pt.lon,
            aircraft_tail: pt.aircraft_tail,
            pilot_id: pt.pilot_id,
          };
        }
      } else {
        current.end_time = pt.garmin_time;
        current.point_ids.push(pt.id);
        current.max_speed = Math.max(current.max_speed, pt.velocity_kmh ?? 0);
        if (current.aircraft_tail === null) current.aircraft_tail = pt.aircraft_tail;
        if (current.pilot_id === null) current.pilot_id = pt.pilot_id;
      }
    } else if (lastPoint !== null && isGapBoundary(pt, lastPoint)) {
      if (current !== null) {
        flights.push(current);
        current = null;
      }
      if ((pt.velocity_kmh ?? 0) >= SPEED_THRESHOLD_KMH) {
        current = { start_time: pt.garmin_time, end_time: pt.garmin_time, point_ids: [pt.id], max_speed: pt.velocity_kmh ?? 0, start_lat: pt.lat, start_lon: pt.lon, aircraft_tail: pt.aircraft_tail, pilot_id: pt.pilot_id };
      } else {
        pendingBoundary = pt;
      }
    } else {
      if (current !== null) {
        current.end_time = pt.garmin_time;
        current.point_ids.push(pt.id);
        current.max_speed = Math.max(current.max_speed, pt.velocity_kmh ?? 0);
        if (current.aircraft_tail === null) current.aircraft_tail = pt.aircraft_tail;
        if (current.pilot_id === null) current.pilot_id = pt.pilot_id;
        flights.push(current);
        current = null;
      }
      pendingBoundary = pt;
    }

    lastPoint = pt;
  }

  if (current !== null && current.point_ids.length > 0) {
    flights.push(current);
  }

  return flights;
}

// ── DB writes ─────────────────────────────────────────────────────────────────

function writeFlights(
  db: D1Database,
  flights: FlightCandidate[],
  trackerId: number,
): D1PreparedStatement[] {
  // Interleave each flight INSERT with its point_flights INSERTs so that the
  // subquery (tracker_id, start_time) lookup resolves to the just-inserted row.
  const stmts: D1PreparedStatement[] = [];
  for (const flight of flights) {
    const originLabel = null; // filled in asynchronously by geocodePendingPoints
    stmts.push(
      db
        .prepare('INSERT INTO flights (tracker_id, start_time, end_time, point_count, max_speed_kmh, origin_label, aircraft_tail, pilot_id, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())')
        .bind(trackerId, flight.start_time, flight.end_time, flight.point_ids.length, flight.max_speed, originLabel, flight.aircraft_tail, flight.pilot_id)
    );
    for (const pid of flight.point_ids) {
      stmts.push(
        db.prepare('INSERT OR IGNORE INTO point_flights (point_id, flight_id) VALUES (?, (SELECT id FROM flights WHERE tracker_id = ? AND start_time = ?))')
          .bind(pid, trackerId, flight.start_time)
      );
    }
  }
  return stmts;
}
