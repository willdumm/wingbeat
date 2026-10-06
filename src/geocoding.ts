import { Tenant, Point } from './types';
import { haversineKm, haversineMiles, SPEED_THRESHOLD_KMH } from './geo';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
  /** Set when the query didn't complete (e.g. "runtime error: Query timed out"). */
  remark?: string;
}

interface PlaceRef {
  name: string;
  lat: number;
  lon: number;
}

// ── Geo math ─────────────────────────────────────────────────────────────────

function compassBearing(fromLat: number, fromLon: number, toLat: number, toLon: number): string {
  const toRad = (d: number) => d * Math.PI / 180;
  const lat1 = toRad(fromLat);
  const lat2 = toRad(toLat);
  const dLon = toRad(toLon - fromLon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  return dirs[Math.round(bearing / 45) % 8];
}

export function buildLiveLabel(
  distMiles: number,
  placeLat: number,
  placeLon: number,
  planeLat: number,
  planeLon: number,
  placeName: string,
): string | null {
  if (distMiles < 0.5) return placeName;
  if (distMiles > 80) return null;
  const dir = compassBearing(placeLat, placeLon, planeLat, planeLon);
  return `${distMiles.toFixed(1)} miles ${dir} of ${placeName}`;
}

// ── Overpass ─────────────────────────────────────────────────────────────────

async function overpassFetch(query: string, host: string): Promise<OverpassResponse | null> {
  const body = 'data=' + encodeURIComponent(query);
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
    'User-Agent': `FlightTracker/1.0 (${host})`,
  };

  const attempt = (url: string): Promise<OverpassResponse> =>
    fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(8000) })
      .then(async res => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw Object.assign(new Error(`HTTP ${res.status} from ${url}`), { status: res.status, text });
        }
        const data = await res.json() as OverpassResponse;
        // An overloaded server answers 200 with a remark and partial or no elements;
        // that's a failed lookup, not "no place here".
        if (data.remark) throw new Error(`Overpass remark from ${url}: ${data.remark}`);
        return data;
      });

  try {
    return await Promise.any(OVERPASS_ENDPOINTS.map(attempt));
  } catch (err) {
    if (err instanceof AggregateError) {
      for (const e of err.errors) {
        console.error('[geocoding] overpassFetch failed:', String(e));
      }
    } else {
      console.error('[geocoding] overpassFetch failed:', String(err));
    }
    return null;
  }
}

// ── Shared Overpass query ─────────────────────────────────────────────────────

function buildOverpassQuery(lat: number, lon: number, radiusM: number): string {
  return `[out:json];
(
  node(around:${radiusM},${lat},${lon})["name"]["place"];
  way(around:${radiusM},${lat},${lon})["name"]["place"];
  node(around:${radiusM},${lat},${lon})["name"]["natural"~"^(bay|inlet|cove|strait|water)$"];
  way(around:${radiusM},${lat},${lon})["name"]["natural"~"^(bay|inlet|cove|strait|water)$"];
  relation(around:${radiusM},${lat},${lon})["name"]["natural"~"^(bay|inlet|cove|strait|water)$"];
);
out tags center;`;
}

// ── Priority tiers ────────────────────────────────────────────────────────────

const PRIORITY: Array<{
  test: (tags: Record<string, string>) => boolean;
  maxKm: number;
}> = [
  { test: t => t.place === 'city',                                              maxKm: 8  },
  { test: t => t.place === 'town',                                              maxKm: 8  },
  { test: t => t.place === 'village' || t.place === 'hamlet',                  maxKm: 5  },
  { test: t => ['bay', 'inlet', 'cove', 'strait'].includes(t.natural ?? ''),   maxKm: 10 },
  { test: t => t.natural === 'water',                                           maxKm: 8  },
  { test: t => t.place === 'locality',                                          maxKm: 10 },
  { test: t => !!t.place,                                                       maxKm: 15 },
];

function selectCandidate(
  elements: OverpassElement[],
  lat: number,
  lon: number,
  priority: typeof PRIORITY,
): (PlaceRef & { distKm: number }) | null {
  const candidates = elements
    .filter(e => e.tags?.name)
    .map(e => {
      const elLat = e.type === 'node' ? e.lat : e.center?.lat;
      const elLon = e.type === 'node' ? e.lon : e.center?.lon;
      if (elLat == null || elLon == null) return null;
      return {
        name: e.tags.name,
        tags: e.tags,
        lat: elLat,
        lon: elLon,
        distKm: haversineKm(lat, lon, elLat, elLon),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  for (const { test, maxKm } of priority) {
    const qualifying = candidates
      .filter(c => test(c.tags) && c.distKm <= maxKm)
      .sort((a, b) => a.distKm - b.distKm);
    if (qualifying.length > 0) {
      const { name, lat: wLat, lon: wLon, distKm } = qualifying[0];
      return { name, lat: wLat, lon: wLon, distKm };
    }
  }
  return null;
}

// ── Named Points (D1) ─────────────────────────────────────────────────────────

interface NamedPointRow { name: string; lat: number; lon: number; max_km: number | null }

// The TTL bounds cross-isolate staleness, as for settings (see src/settings.ts):
// invalidateNamedPointsCache only reaches the isolate that served the edit, and the cron
// geocodes in whichever isolate it lands on. Without it, an isolate that loaded the list
// before a named-points import kept labelling every landing from Overpass instead.
const NAMED_POINTS_TTL_MS = 60_000;

const _namedPointsCache = new Map<string, { at: number; rows: NamedPointRow[] }>();

export function invalidateNamedPointsCache(tenantKey: string): void {
  _namedPointsCache.delete(tenantKey);
}

async function loadNamedPoints(tenant: Tenant): Promise<NamedPointRow[]> {
  const hit = _namedPointsCache.get(tenant.key);
  if (hit && Date.now() - hit.at < NAMED_POINTS_TTL_MS) return hit.rows;
  const { results } = await tenant.db.prepare('SELECT name, lat, lon, max_km FROM named_points').all<NamedPointRow>();
  _namedPointsCache.set(tenant.key, { at: Date.now(), rows: results });
  return results;
}

export async function lookupNamedPoint(
  tenant: Tenant,
  lat: number,
  lon: number,
): Promise<{ name: string; lat: number; lon: number } | null> {
  const points = await loadNamedPoints(tenant);
  let best: { name: string; lat: number; lon: number; distKm: number } | null = null;
  for (const p of points) {
    const distKm = haversineKm(lat, lon, p.lat, p.lon);
    const maxKm = p.max_km ?? 10;
    if (distKm <= maxKm && (!best || distKm < best.distKm))
      best = { name: p.name, lat: p.lat, lon: p.lon, distKm };
  }
  return best;
}

// ── Live label resolution (shared by the dashboard's live-position display and
// notification message formatting — see trackerLabel/mapshareUrl in notifications.ts for
// their equivalents) ───────────────────────────────────────────────────────────

export type LivePoint = Pick<Point, 'lat' | 'lon' | 'location_label'>;
export type RefPoint = { location_label: string; place_lat: number; place_lon: number };

/**
 * Resolves a point to a human-readable label using only already-computed values: the
 * point's own `location_label` if it's been geocoded directly (e.g. a flight boundary),
 * otherwise a live bearing/distance description off the nearest already-geocoded reference
 * point (`buildLiveLabel`). Never triggers a fresh Overpass lookup.
 */
export function computeLiveLabel(point: LivePoint | null | undefined, ref: RefPoint | null | undefined): string | null {
  if (point?.location_label) return point.location_label;
  if (ref && point?.lat != null && point?.lon != null) {
    const dist = haversineMiles(point.lat, point.lon, ref.place_lat, ref.place_lon);
    return buildLiveLabel(dist, ref.place_lat, ref.place_lon, point.lat, point.lon, ref.location_label);
  }
  return null;
}

/**
 * Finds the reference point `computeLiveLabel` should measure distance/bearing from: a
 * matching named point if the given coordinates fall within one, otherwise the tracker's
 * most recently Overpass-geocoded point.
 */
export async function resolveRefPoint(
  tenant: Tenant,
  trackerId: number,
  lat: number | null | undefined,
  lon: number | null | undefined,
): Promise<{ refPoint: RefPoint | null; fromNamedPoint: boolean }> {
  if (lat != null && lon != null) {
    const local = await lookupNamedPoint(tenant, lat, lon);
    if (local) {
      return { refPoint: { location_label: local.name, place_lat: local.lat, place_lon: local.lon }, fromNamedPoint: true };
    }
  }
  return {
    refPoint: await tenant.db.prepare(
      `SELECT location_label, place_lat, place_lon FROM points WHERE tracker_id = ? AND place_lat IS NOT NULL ORDER BY garmin_time DESC LIMIT 1`
    ).bind(trackerId).first<RefPoint>(),
    fromNamedPoint: false,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function geocodePoint(
  tenant: Tenant,
  lat: number,
  lon: number,
): Promise<{ label: string; lat: number; lon: number } | null> {
  const local = await lookupNamedPoint(tenant, lat, lon);
  if (local) return { label: local.name, lat: local.lat, lon: local.lon };

  const result = await overpassLookup(tenant, lat, lon);
  return typeof result === 'string' ? null : result;
}

/**
 * Overpass-only lookup. `'empty'` means Overpass answered with no usable place;
 * `'error'` means it couldn't be reached (both endpoints failed or timed out).
 */
async function overpassLookup(
  tenant: Tenant,
  lat: number,
  lon: number,
): Promise<{ label: string; lat: number; lon: number } | 'empty' | 'error'> {
  const data = await overpassFetch(buildOverpassQuery(lat, lon, 10000), tenant.host);
  if (!data) return 'error';

  const winner = selectCandidate(data.elements, lat, lon, PRIORITY);
  if (!winner) return 'empty';
  return { label: winner.name, lat: winner.lat, lon: winner.lon };
}

/**
 * Propagates already-cached point labels into the parent flights' origin_label /
 * destination_label columns. Scoped to a single tracker to avoid ambiguous
 * garmin_time joins when two trackers share a timestamp.
 */
export async function updateFlightLabelsFromCache(db: D1Database, trackerId: number): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE flights
      SET origin_label = (
        SELECT p.location_label FROM points p
        WHERE p.garmin_time = flights.start_time AND p.tracker_id = flights.tracker_id AND p.location_label IS NOT NULL
      ), modified_at = unixepoch()
      WHERE tracker_id = ?
        AND origin_label IS NULL
        AND EXISTS (
          SELECT 1 FROM points p
          WHERE p.garmin_time = flights.start_time AND p.tracker_id = flights.tracker_id AND p.location_label IS NOT NULL
        )
    `).bind(trackerId),
    db.prepare(`
      UPDATE flights
      SET destination_label = (
        SELECT p.location_label FROM points p
        WHERE p.garmin_time = flights.end_time AND p.tracker_id = flights.tracker_id AND p.location_label IS NOT NULL
      ), modified_at = unixepoch()
      WHERE tracker_id = ?
        AND destination_label IS NULL
        AND end_time IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM points p
          WHERE p.garmin_time = flights.end_time AND p.tracker_id = flights.tracker_id AND p.location_label IS NOT NULL
        )
    `).bind(trackerId),
  ]);
}

/**
 * Labels unlabeled flight boundary points for a specific tracker, in two passes:
 *
 * 1. Every pending point is checked against the tenant's named points. That's local
 *    and cheap, so a backfill's hundreds of flights label in one call.
 * 2. Up to `limit` of the rest (newest first) go to Overpass. Each result is written as
 *    soon as it arrives. A point Overpass has no place for gets `geocode_empty_at` so it
 *    isn't asked again (pass 1 still checks it). If Overpass is unreachable the pass
 *    stops, leaving the remaining points for a later call.
 */
export async function geocodePendingPoints(
  tenant: Tenant,
  trackerId: number,
  limit = 4,
): Promise<void> {
  const db = tenant.db;
  const { results } = await db
    .prepare(`
      SELECT p.id, p.lat, p.lon, p.garmin_time, p.geocode_empty_at
      FROM (
        SELECT f.start_time AS t FROM flights f WHERE f.tracker_id = ? AND f.origin_label IS NULL
        UNION
        SELECT f.end_time AS t FROM flights f
        WHERE f.tracker_id = ?
          AND f.destination_label IS NULL
          AND f.end_time IS NOT NULL
          AND NOT (
            f.end_time = (SELECT MAX(garmin_time) FROM points WHERE tracker_id = ?)
            AND (SELECT velocity_kmh FROM points WHERE tracker_id = ? ORDER BY garmin_time DESC LIMIT 1) >= ${SPEED_THRESHOLD_KMH}
          )
      ) AS boundary
      JOIN points p ON p.garmin_time = boundary.t AND p.tracker_id = ?
      ORDER BY p.garmin_time DESC
    `)
    .bind(trackerId, trackerId, trackerId, trackerId, trackerId)
    .all<{ id: number; lat: number; lon: number; garmin_time: number; geocode_empty_at: number | null }>();

  console.log(`[geocoding] geocodePendingPoints(tracker=${trackerId}): found ${results.length} pending boundary points (overpass limit=${limit})`);
  if (results.length === 0) return;

  const setLabel = (id: number, place: { label: string; lat: number; lon: number }) =>
    db.prepare('UPDATE points SET location_label = ?, place_lat = ?, place_lon = ? WHERE id = ?')
      .bind(place.label, place.lat, place.lon, id);

  // Pass 1: named points.
  const localUpdates: D1PreparedStatement[] = [];
  const remaining: typeof results = [];
  for (const p of results) {
    const local = await lookupNamedPoint(tenant, p.lat, p.lon);
    if (local) localUpdates.push(setLabel(p.id, { label: local.name, lat: local.lat, lon: local.lon }));
    else remaining.push(p);
  }
  for (let i = 0; i < localUpdates.length; i += 100) {
    await db.batch(localUpdates.slice(i, i + 100));
  }
  console.log(`[geocoding] labeled ${localUpdates.length} points from named points`);

  // Pass 2: Overpass.
  const CONCURRENCY = 2;
  const queue = remaining.filter(p => p.geocode_empty_at === null).slice(0, limit);
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    const outcomes = await Promise.all(
      queue.slice(i, i + CONCURRENCY).map(async ({ id, lat, lon }) => {
        const result = await overpassLookup(tenant, lat, lon);
        console.log(`[geocoding] point id=${id} (${lat}, ${lon}) → ${JSON.stringify(typeof result === 'string' ? result : result.label)}`);
        if (result === 'empty') {
          await db.prepare('UPDATE points SET geocode_empty_at = unixepoch() WHERE id = ?').bind(id).run();
        } else if (result !== 'error') {
          await setLabel(id, result).run();
        }
        return result;
      })
    );
    if (outcomes.includes('error')) {
      console.log('[geocoding] Overpass unreachable; leaving the rest for a later call');
      break;
    }
  }

  await updateFlightLabelsFromCache(db, trackerId);

  console.log('[geocoding] geocodePendingPoints: done');
}

/**
 * Geocodes the most recent ungeocoded point for a specific tracker.
 */
export async function geocodeLivePoint(tenant: Tenant, trackerId: number): Promise<void> {
  const point = await tenant.db.prepare(
    `SELECT id, lat, lon FROM points
     WHERE tracker_id = ? AND place_lat IS NULL
     ORDER BY garmin_time DESC LIMIT 1`
  ).bind(trackerId).first<{ id: number; lat: number; lon: number }>();
  if (!point) return;

  const result = await geocodePoint(tenant, point.lat, point.lon);
  if (!result) return;

  await tenant.db.prepare(
    'UPDATE points SET location_label = ?, place_lat = ?, place_lon = ? WHERE id = ?'
  ).bind(result.label, result.lat, result.lon, point.id).run();
}
