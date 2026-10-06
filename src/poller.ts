import { Tenant, ParsedPoint } from './types';
import { runSegmentation, resegment, fetchRecentFlights } from './segmentation';
import { geocodePendingPoints, geocodeLivePoint, computeLiveLabel, resolveRefPoint } from './geocoding';
import { SPEED_THRESHOLD_KMH } from './geo';
import { loadSettings } from './settings';
import { dispatchNotifications, mapshareUrl, trackerLabel, NotificationEvent } from './notifications';

const POLL_INTERVAL_SECONDS = 120; // matches Garmin inReach's ~2-min transmission rate

interface MaybePollOptions {
  intervalSeconds?: number;
  throttleKey?: 'last_polled' | 'last_quick_poll';
  geocode?: boolean;
}

interface TrackerRef {
  id: number;
  name: string;
  source_url: string;
  assigned_aircraft: string | null;
  assigned_pilot: number | null;
  credentials: string | null;
}

export async function maybePoll(
  tenant: Tenant,
  tracker: TrackerRef,
  options: MaybePollOptions = {},
): Promise<void> {
  const {
    intervalSeconds = POLL_INTERVAL_SECONDS,
    throttleKey = 'last_polled',
    geocode = true,
  } = options;

  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - intervalSeconds;

  // The throttle check-and-claim is a single UPDATE ... WHERE so it's atomic under D1's
  // single-writer serialization. With separate SELECT-then-UPDATE steps, two concurrent
  // callers (e.g. the once-a-minute cron tick and a browser's background poll landing in
  // the same window) could both read a stale poll_state, both pass the throttle check, and
  // both call poll() for the same tracker — each with its own stale view of poll_state,
  // which could make the second run's gap detection use an outdated last_point_time and
  // fire a spurious duplicate gap notification. Only the caller whose UPDATE actually
  // matches a row (changes > 0) proceeds.
  const result = await tenant.db.prepare(
    throttleKey === 'last_polled'
      ? 'UPDATE poll_state SET last_polled = ? WHERE tracker_id = ? AND last_polled < ?'
      : 'UPDATE poll_state SET last_quick_poll = ? WHERE tracker_id = ? AND MAX(last_polled, last_quick_poll) < ?'
  ).bind(now, tracker.id, cutoff).run();

  if ((result.meta.changes ?? 0) === 0) return;

  await poll(tenant, tracker, undefined, { updateLastPolled: false, geocode });
}

const INSERT_BATCH_SIZE = 500;

async function fetchFeedPoints(
  host: string,
  sourceUrl: string,
  credentials: string | null,
  d1: Date,
  d2?: Date,
): Promise<ParsedPoint[]> {
  const url = new URL(sourceUrl);
  url.searchParams.set('d1', formatGarminDate(d1));
  if (d2) url.searchParams.set('d2', formatGarminDate(d2));

  const headers: Record<string, string> = { 'User-Agent': `FlightTracker/1.0 (${host})` };
  if (credentials) {
    const creds = JSON.parse(credentials) as Record<string, string>;
    if (creds.password) {
      headers['Authorization'] = 'Basic ' + btoa(':' + creds.password);
    }
  }
  const response = await fetch(url.toString(), { headers });

  if (!response.ok) {
    throw new Error(`Garmin feed returned ${response.status}: ${response.statusText}`);
  }

  return parseKML(await response.text());
}

/**
 * Fetches the last 30 days of a feed without storing anything, so the tracker form can
 * confirm a MapShare URL (and password) works before saving it.
 */
export async function testFeed(
  host: string,
  sourceUrl: string,
  credentials: string | null,
): Promise<{ points: number; latest: number | null }> {
  const d1 = new Date(Date.now() - 30 * 86400_000);
  const points = await fetchFeedPoints(host, sourceUrl, credentials, d1);
  const latest = points.reduce<number | null>((max, p) => (max === null || p.garmin_time > max ? p.garmin_time : max), null);
  return { points: points.length, latest };
}

export async function poll(
  tenant: Tenant,
  tracker: TrackerRef,
  fromDate?: Date,
  options: { updateLastPolled?: boolean; geocode?: boolean; toDate?: Date } = {},
): Promise<number> {
  const { updateLastPolled = true, geocode = false, toDate } = options;

  let recentFlights: import('./segmentation').RecentFlightRow[] | undefined;
  let d1: Date;
  if (fromDate) {
    d1 = fromDate;
  } else {
    recentFlights = await fetchRecentFlights(tenant.db, tracker.id);
    if (recentFlights.length > 0) {
      d1 = new Date(recentFlights[0].end_time * 1000);
    } else {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      d1 = d;
    }
  }

  const parsedPoints = await fetchFeedPoints(tenant.host, tracker.source_url, tracker.credentials, d1, toDate);

  if (parsedPoints.length === 0) {
    if (updateLastPolled) await tenant.db.prepare(
      'UPDATE poll_state SET last_polled = ? WHERE tracker_id = ?'
    ).bind(Math.floor(Date.now() / 1000), tracker.id).run();
    return 0;
  }

  // Garmin's feed re-sends everything from the `d1` query param forward on every request
  // (see formatGarminDate below — it's a calendar date, not a precise cursor), so whenever
  // the checkpoint date hasn't advanced (e.g. no completed flight in a day or more) the same
  // already-stored points get re-fetched on every poll. INSERT OR IGNORE silently drops the
  // resulting duplicate conflicts, but D1 still bills each attempt as a row write, so without
  // this filter that stale backlog gets re-billed in full on every single poll.
  //
  // Only applied to live polls: an explicit fromDate means the caller (the admin backfill
  // endpoint) is deliberately asking for a historical window that may sit entirely below
  // this tracker's current max garmin_time, which the watermark can't distinguish from
  // already-stored data — INSERT OR IGNORE's per-row check is the correct dedup there.
  let points = parsedPoints;
  if (!fromDate) {
    const maxKnown = await tenant.db.prepare(
      'SELECT MAX(garmin_time) as max_t FROM points WHERE tracker_id = ?'
    ).bind(tracker.id).first<{ max_t: number | null }>();
    if (maxKnown?.max_t != null) {
      points = parsedPoints.filter((p) => p.garmin_time > maxKnown.max_t!);
    }
  }

  if (points.length === 0) {
    if (updateLastPolled) await tenant.db.prepare(
      'UPDATE poll_state SET last_polled = ? WHERE tracker_id = ?'
    ).bind(Math.floor(Date.now() / 1000), tracker.id).run();
    return 0;
  }

  const statements = points.map((p) =>
    tenant.db.prepare(
      `INSERT OR IGNORE INTO points (garmin_time, lat, lon, elevation_m, velocity_kmh, course_deg, event, raw_kml, tracker_id, aircraft_tail, pilot_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(p.garmin_time, p.lat, p.lon, p.elevation_m, p.velocity_kmh, p.course_deg, p.event, p.raw_kml, tracker.id, tracker.assigned_aircraft, tracker.assigned_pilot)
  );

  // Each point carries its raw KML (~6 KB), and a single D1 batch is one RPC capped at
  // 32 MiB, so a long backfill window has to be split.
  const results: D1Result[] = [];
  for (let i = 0; i < statements.length; i += INSERT_BATCH_SIZE) {
    results.push(...await tenant.db.batch(statements.slice(i, i + INSERT_BATCH_SIZE)));
  }
  const inserted = results.reduce((sum, r) => sum + (r.meta.changes ?? 0), 0);

  const now = Math.floor(Date.now() / 1000);
  if (updateLastPolled) await tenant.db.prepare(
    'UPDATE poll_state SET last_polled = ? WHERE tracker_id = ?'
  ).bind(now, tracker.id).run();

  if (inserted > 0) {
    // Incremental segmentation only looks past the last completed flight, so a backfill
    // that lands before it (e.g. importing history after live polling started) has to
    // resegment the whole tracker or those points would never become flights.
    let backfilledBeforeSegmented = false;
    if (fromDate) {
      recentFlights = await fetchRecentFlights(tenant.db, tracker.id);
      const lastCompleted = recentFlights[1];
      backfilledBeforeSegmented = !!lastCompleted && points.some(
        (p, i) => (results[i].meta.changes ?? 0) > 0 && p.garmin_time < lastCompleted.end_time,
      );
    }
    if (backfilledBeforeSegmented) {
      await resegment(tenant.db, tracker.id);
    } else {
      await runSegmentation(tenant.db, tracker.id, recentFlights);
    }
    if (geocode) {
      await geocodePendingPoints(tenant, tracker.id, 4);
      await geocodeLivePoint(tenant, tracker.id);
    }
    // Backfills (fromDate set) replay history that's already been evaluated —
    // only genuinely live polls should trigger takeoff/landing/gap notifications.
    if (!fromDate) {
      const newPoints = points
        .filter((_, i) => (results[i].meta.changes ?? 0) > 0)
        .sort((a, b) => a.garmin_time - b.garmin_time);
      await processNotifications(tenant, tracker, newPoints, now);
    }
  }

  return inserted;
}

/**
 * Resolves the same dashboard-style location description shown in the "current location"
 * popup (`computeLiveLabel`/`resolveRefPoint` in geocoding.ts), using only already-computed
 * values: the point's own `location_label` if it was geocoded directly as a flight boundary
 * (by the time notifications run, `poll()` has already run `geocodePendingPoints` for this
 * batch), otherwise a live bearing/distance off the nearest previously-geocoded reference
 * point. Never triggers a fresh Overpass lookup.
 */
async function resolveEventLocationLabel(
  tenant: Tenant,
  trackerId: number,
  point: { lat: number; lon: number; garmin_time: number },
): Promise<string | null> {
  const row = await tenant.db.prepare(
    'SELECT location_label FROM points WHERE tracker_id = ? AND garmin_time = ?'
  ).bind(trackerId, point.garmin_time).first<{ location_label: string | null }>();
  const { refPoint } = await resolveRefPoint(tenant, trackerId, point.lat, point.lon);
  return computeLiveLabel({ lat: point.lat, lon: point.lon, location_label: row?.location_label ?? null }, refPoint);
}

/**
 * Detects takeoff/landing transitions among newly-inserted points, closes out any
 * ongoing alerted signal gap (gap_resolved), and dispatches webhook notifications.
 * State (last known flying/grounded, last point time) is persisted in poll_state so
 * detection is incremental across polls.
 */
async function processNotifications(
  tenant: Tenant,
  tracker: TrackerRef,
  newPoints: ParsedPoint[],
  now: number,
): Promise<void> {
  if (newPoints.length === 0) return;

  const state = await tenant.db.prepare(
    'SELECT flight_status, last_point_time, gap_alerted FROM poll_state WHERE tracker_id = ?'
  ).bind(tracker.id).first<{ flight_status: string; last_point_time: number | null; gap_alerted: number }>();

  // No prior state means this is the tracker's first-ever poll: the batch is likely a
  // multi-day history backfill, not live telemetry, so initialize silently.
  const isFirstEver = state == null || state.last_point_time == null;

  let flying = state?.flight_status === 'in_flight';
  let lastTime = state?.last_point_time ?? null;
  const events: NotificationEvent[] = [];
  const name = trackerLabel(tracker);
  const trackerMapshareUrl = mapshareUrl(tracker.source_url);
  const instanceUrl = `https://${tenant.host}/`;

  // Gap detection lives entirely in the timeout path (maybeAlertSilentTracker), which
  // alerts while the silence is still ongoing and repeats each minute. Alerting here on
  // transmission-time gaps between resumed points would fire *after* the track is current
  // again — the "gap alert while the dashboard shows a minute-old point" false positive
  // (e.g. the MapShare feed delivering a late batch). All this path does is close out an
  // alerted silence: the first resumed point turns it into a one-shot gap_resolved.
  if (!isFirstEver && lastTime !== null && (state?.gap_alerted ?? 0) === 1) {
    const first = newPoints[0];
    events.push({
      type: 'gap_resolved', tracker_id: tracker.id, tracker_name: name,
      time: first.garmin_time, lat: first.lat, lon: first.lon,
      location_label: await resolveEventLocationLabel(tenant, tracker.id, first),
      velocity_kmh: first.velocity_kmh, elevation_m: first.elevation_m,
      // Wall-clock gap (now vs. the last point's transmission time), matching how the
      // repeating `gap` alerts measure the silence — not first.garmin_time - lastTime,
      // which is just the ~2-min spacing between consecutive feed points and would
      // always report a tiny gap regardless of how long the silence actually lasted.
      gap_minutes: Math.max(0, Math.round((now - lastTime) / 60)),
      mapshare_url: trackerMapshareUrl,
      instance_url: instanceUrl,
    });
  }

  for (const pt of newPoints) {
    const nowFlying = (pt.velocity_kmh ?? 0) >= SPEED_THRESHOLD_KMH;
    if (!isFirstEver && lastTime !== null) {
      if (!flying && nowFlying) {
        // Location is described from the takeoff point itself (pt), but speed/altitude/
        // coordinates come from the most recent point in this batch — by the time a
        // takeoff notification is read, the aircraft has typically already climbed well
        // past its speed-threshold-crossing stats, so "current" figures are more useful
        // than the ones frozen at the moment of takeoff detection.
        const latest = newPoints[newPoints.length - 1];
        events.push({
          type: 'takeoff', tracker_id: tracker.id, tracker_name: name, time: pt.garmin_time,
          lat: latest.lat, lon: latest.lon,
          location_label: await resolveEventLocationLabel(tenant, tracker.id, pt),
          velocity_kmh: latest.velocity_kmh, elevation_m: latest.elevation_m,
          mapshare_url: trackerMapshareUrl,
          instance_url: instanceUrl,
        });
      } else if (flying && !nowFlying) {
        events.push({
          type: 'landing', tracker_id: tracker.id, tracker_name: name, time: pt.garmin_time, lat: pt.lat, lon: pt.lon,
          location_label: await resolveEventLocationLabel(tenant, tracker.id, pt),
          velocity_kmh: pt.velocity_kmh, elevation_m: pt.elevation_m,
          mapshare_url: trackerMapshareUrl,
          instance_url: instanceUrl,
        });
      }
    }
    flying = nowFlying;
    lastTime = pt.garmin_time;
  }

  await tenant.db.prepare(
    'UPDATE poll_state SET flight_status = ?, last_point_time = ?, gap_alerted = 0 WHERE tracker_id = ?'
  ).bind(flying ? 'in_flight' : 'grounded', lastTime, tracker.id).run();

  await dispatchNotifications(tenant, events);
}

interface TrackerPollRow extends TrackerRef {
  last_polled: number;
  last_quick_poll: number;
  flight_status: string | null;
  last_point_time: number | null;
  gap_alerted: number | null;
  gap_last_alert_at: number | null;
}

/**
 * Queries all active trackers and calls maybePoll for each sequentially.
 * D1 discourages concurrent writes within a single Worker invocation.
 *
 * Each tracker's poll is isolated in a try/catch: one tracker's Garmin fetch failing
 * (e.g. feed down or slow) must not skip the rest of the fleet for this tick — it just
 * retries on its own throttle next time around.
 *
 * poll_state is joined into the tracker query so the every-minute cron tick costs one
 * read total when everything is throttled: the snapshot pre-filters trackers whose
 * interval clearly hasn't elapsed instead of issuing a no-op claim UPDATE per tracker
 * per tick. maybePoll's atomic claim still decides for real when the snapshot says the
 * interval has passed, so a stale snapshot can't cause a double poll.
 */
export async function pollAllActive(tenant: Tenant, options: MaybePollOptions = {}): Promise<void> {
  const {
    intervalSeconds = POLL_INTERVAL_SECONDS,
    throttleKey = 'last_polled',
  } = options;

  const { results } = await tenant.db.prepare(
    `SELECT t.id, t.name, t.source_url, t.assigned_aircraft, t.assigned_pilot, t.credentials,
            COALESCE(p.last_polled, 0) AS last_polled, COALESCE(p.last_quick_poll, 0) AS last_quick_poll,
            p.flight_status, p.last_point_time, p.gap_alerted, p.gap_last_alert_at
     FROM trackers t LEFT JOIN poll_state p ON p.tracker_id = t.id
     WHERE t.active = 1 AND t.deleted = 0`
  ).all<TrackerPollRow>();

  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - intervalSeconds;

  for (const tracker of results) {
    const lastAttempt = throttleKey === 'last_polled'
      ? tracker.last_polled
      : Math.max(tracker.last_polled, tracker.last_quick_poll);
    if (lastAttempt < cutoff) {
      try {
        await maybePoll(tenant, tracker, options);
      } catch (err) {
        console.error(`Poll failed for tracker ${tracker.id} ("${tracker.name}"):`, String(err));
      }
    }
    try {
      await maybeAlertSilentTracker(tenant, tracker, now);
    } catch (err) {
      console.error(`Silent-tracker check failed for tracker ${tracker.id} ("${tracker.name}"):`, String(err));
    }
  }
}

// Minimum spacing between repeated gap alerts for one ongoing silence. Slightly under the
// one-minute cron cadence so tick-timing jitter can't make a tick skip its repeat.
const GAP_REALERT_SECONDS = 55;

/**
 * Fires a `gap` notification for a tracker that is in flight but has been silent longer
 * than the gap threshold, and keeps re-firing every cron tick (~1 min) until points
 * resume — at which point processNotifications sees gap_alerted = 1 and sends the
 * one-shot gap_resolved. This is the only gap-detection path: it alerts while the
 * silence is actually ongoing, so an alert always corresponds to a stale "last seen"
 * on the dashboard. Works entirely off the poll_state snapshot pollAllActive already
 * read, so a quiet tick costs no extra queries.
 *
 * Note last_point_time is Garmin's transmission time, so sustained MapShare feed latency
 * above the threshold could false-positive; the default 5-minute threshold sits well
 * above the feed's typical delay.
 */
async function maybeAlertSilentTracker(tenant: Tenant, row: TrackerPollRow, now: number): Promise<void> {
  if (row.flight_status !== 'in_flight' || row.last_point_time == null) return;
  if (now - (row.gap_last_alert_at ?? 0) < GAP_REALERT_SECONDS) return;
  const gapThresholdSeconds = (await loadSettings(tenant)).gap_alert_minutes * 60;
  if (now - row.last_point_time <= gapThresholdSeconds) return;

  // Atomic claim, same pattern as maybePoll's throttle: of all concurrent callers (cron
  // tick, page-load polls, 30s quick polls), only the one whose UPDATE matches gets to
  // send this minute's alert. The last_point_time guard drops the claim if a concurrent
  // poll received fresh points between our snapshot read and now.
  const result = await tenant.db.prepare(
    `UPDATE poll_state SET gap_alerted = 1, gap_last_alert_at = ?
     WHERE tracker_id = ? AND flight_status = 'in_flight' AND last_point_time = ? AND gap_last_alert_at <= ?`
  ).bind(now, row.id, row.last_point_time, now - GAP_REALERT_SECONDS).run();
  if ((result.meta.changes ?? 0) === 0) return;

  const lastPoint = await tenant.db.prepare(
    'SELECT lat, lon, location_label, velocity_kmh, elevation_m FROM points WHERE tracker_id = ? ORDER BY garmin_time DESC LIMIT 1'
  ).bind(row.id).first<{ lat: number; lon: number; location_label: string | null; velocity_kmh: number | null; elevation_m: number | null }>();
  if (!lastPoint) return;

  const { refPoint } = await resolveRefPoint(tenant, row.id, lastPoint.lat, lastPoint.lon);

  await dispatchNotifications(tenant, [{
    type: 'gap', tracker_id: row.id, tracker_name: trackerLabel(row),
    time: row.last_point_time, lat: lastPoint.lat, lon: lastPoint.lon,
    location_label: computeLiveLabel(lastPoint, refPoint),
    velocity_kmh: lastPoint.velocity_kmh, elevation_m: lastPoint.elevation_m,
    gap_minutes: Math.round((now - row.last_point_time) / 60),
    mapshare_url: mapshareUrl(row.source_url),
    instance_url: `https://${tenant.host}/`,
  }]);
}

/**
 * Calls poll() for each active tracker sequentially. When polling a single tracker
 * (trackerId given), errors propagate to the caller as before — the caller asked for
 * that one tracker specifically. When polling the whole fleet, each tracker's failure
 * is isolated the same way as pollAllActive so one bad tracker can't skip the rest.
 */
export async function pollAllActiveForce(
  tenant: Tenant,
  trackerId: number | null,
  fromDate?: Date,
  options: { updateLastPolled?: boolean; geocode?: boolean; toDate?: Date } = {},
): Promise<number> {
  if (trackerId !== null) {
    const row = await tenant.db.prepare(
      'SELECT name, source_url, assigned_aircraft, assigned_pilot, credentials FROM trackers WHERE id = ?'
    ).bind(trackerId).first<Omit<TrackerRef, 'id'>>();
    if (!row) throw new Error(`Tracker ${trackerId} not found`);
    return poll(tenant, { id: trackerId, ...row }, fromDate, options);
  }

  const { results } = await tenant.db.prepare(
    'SELECT id, name, source_url, assigned_aircraft, assigned_pilot, credentials FROM trackers WHERE active = 1 AND deleted = 0'
  ).all<TrackerRef>();

  let total = 0;
  for (const tracker of results) {
    try {
      total += await poll(tenant, tracker, fromDate, options);
    } catch (err) {
      console.error(`Poll failed for tracker ${tracker.id} ("${tracker.name}"):`, String(err));
    }
  }
  return total;
}

// ── KML parsing ──────────────────────────────────────────────────────────────

function parseMaybe(s: string | null): number | null {
  if (s === null) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseKML(kml: string): ParsedPoint[] {
  const points: ParsedPoint[] = [];
  const placemarkRe = /<Placemark>([\s\S]*?)<\/Placemark>/g;
  let match: RegExpExecArray | null;

  while ((match = placemarkRe.exec(kml)) !== null) {
    const block = match[1];
    const rawKml = match[0];

    const get = (name: string): string | null => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`<Data name="${escaped}">\\s*<value>([\\s\\S]*?)<\\/value>`);
      const m = re.exec(block);
      return m ? m[1].trim() : null;
    };

    const timeStr = get('Time UTC');
    const latStr = get('Latitude');
    const lonStr = get('Longitude');
    if (!timeStr || !latStr || !lonStr) continue;

    const garmin_time = parseGarminTime(timeStr);
    if (garmin_time === null) continue;

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) continue;

    const elevStr = get('Elevation');
    const velStr = get('Velocity');
    const courseStr = get('Course');

    points.push({
      garmin_time,
      lat,
      lon,
      elevation_m: parseMaybe(elevStr),
      velocity_kmh: parseMaybe(velStr),
      course_deg: parseMaybe(courseStr),
      event: get('Event'),
      raw_kml: rawKml,
    });
  }

  return points;
}

function parseGarminTime(timeStr: string): number | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i.exec(timeStr);
  if (!m) return null;
  const [, month, day, year, hourStr, min, sec, ampm] = m;
  let hour = +hourStr;
  if (ampm.toUpperCase() === 'AM') {
    if (hour === 12) hour = 0;
  } else {
    if (hour !== 12) hour += 12;
  }
  return Math.floor(Date.UTC(+year, +month - 1, +day, hour, +min, +sec) / 1000);
}

function formatGarminDate(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getUTCFullYear()}`;
}
