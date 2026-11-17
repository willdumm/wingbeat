import { Tenant } from './types';
import { loadSettings } from './settings';
import { sendAppPushes, subscribedDevices } from './app-push';
import { PUSH_CHANNELS } from '@wingbeat/core/api/push-requests';
import { queryAircraft, queryPilots, queryTrackers } from './queries';
import { alertText, alertTitle, computeAlerts, type Alert, type AlertLists } from '@wingbeat/core/alerts';
import { applyFlightEdits, type EffectiveFlight, type FlightCorrection } from '@wingbeat/core/flight-edits';

// Alert notifications (docs/mobile-app-plan.md, "Alert notifications"): the cron
// computes the alerts feed with core's computeAlerts, from the same lists the dashboard
// computes it from, and pushes each alert to the `alerts` subscribers once, when it first
// appears. alerts_seen keeps the key of every alert present at the last check; one that's
// gone drops its key, so it notifies again if it comes back. It's kept only while someone is
// subscribed: the first check with a subscriber records a baseline without pushing, so
// subscribing (or adding the Expo token) doesn't replay the alerts already present.

/** The check runs on the cron ticks of every ALERT_CHECK_MINUTES-th minute: on the hour. */
export const ALERT_CHECK_MINUTES = 60;

/** The alerts_seen row that says the table holds a baseline. Alert keys all contain a '/'. */
const BASELINE_KEY = 'baseline';

/**
 * The page's AlertLists, from D1: the effective flights of active trackers and the manual
 * ones (applyFlightEdits, as the flight store's getAll()), and the aircraft, pilots and
 * trackers (the bootstrap's lists). Also the newest flight of each tracker in flight.
 */
export async function alertLists(tenant: Tenant): Promise<{ lists: AlertLists; airborne: Set<number> }> {
  const db = tenant.db;
  const [trackerRows, aircraftRows, pilotRows, [flights, entries, inFlight]] = await Promise.all([
    queryTrackers(db, false),
    queryAircraft(db),
    queryPilots(db),
    db.batch([
      db.prepare(
        `SELECT f.id, f.tracker_id, f.start_time, f.end_time, f.modified_at, f.aircraft_tail, f.pilot_id, f.origin_label, f.destination_label
         FROM flights f JOIN trackers t ON t.id = f.tracker_id
         WHERE t.active = 1 AND t.deleted = 0`),
      db.prepare('SELECT * FROM flight_corrections'),
      db.prepare(
        `SELECT (SELECT id FROM flights WHERE tracker_id = ps.tracker_id ORDER BY start_time DESC LIMIT 1) AS id
         FROM poll_state ps WHERE ps.flight_status = 'in_flight'`),
    ]),
  ]);
  const activeTrackerIds = trackerRows.filter(t => t.active && !t.deleted).map(t => t.id);
  const effective = applyFlightEdits(flights.results as EffectiveFlight[], entries.results as FlightCorrection[],
    { pilots: pilotRows, knownTrackerIds: activeTrackerIds }).flights;
  return {
    lists: { flights: effective, aircraft: aircraftRows, pilots: pilotRows, trackers: trackerRows },
    airborne: new Set((inFlight.results as { id: number | null }[]).flatMap(r => r.id == null ? [] : [r.id])),
  };
}

/**
 * An alert's alerts_seen key. An unassigned flight's is its correction key (the tracker and
 * its tracked start, or the manual flight's row), which survives the poller rewriting the
 * flight under a new id. Maintenance keys carry the status, so an item that goes from due
 * soon to overdue notifies again.
 */
export function alertKey(alert: Alert, flightsById: Map<number, EffectiveFlight>): string {
  switch (alert.kind) {
    case 'unassigned_flight': {
      const f = flightsById.get(alert.flight_id);
      if (!f) throw new Error(`alert references unknown flight ${alert.flight_id}`);
      return 'flight/' + (f.tracker_id == null ? 'manual/' + -f.id : f.tracker_id + '/' + (f.edit ? f.edit.entry.flight_start_time : f.start_time));
    }
    case 'maintenance': return 'maintenance/' + alert.aircraft_tail + '/' + alert.item.id + '/' + alert.status.status;
    case 'timer_not_recorded': return 'timer/' + alert.aircraft_tail + '/' + alert.timer_type;
    case 'pilot_duty': return 'duty/' + alert.pilot_id + '/' + alert.window_label;
  }
}

/**
 * The cron's alert check (on every ALERT_CHECK_MINUTES-th minute, and only with an Expo
 * access token and `alerts` subscribers): pushes each alert that wasn't present at the last
 * check to the subscribers' devices, and records the keys of all present now. Without
 * subscribers it clears alerts_seen and reads nothing else; the first check after that only
 * records. An unassigned flight still in the air waits until it lands (its pilot is usually
 * set after the flight).
 */
export async function checkAlerts(tenant: Tenant, scheduledTime: number): Promise<void> {
  if (!tenant.expoAccessToken) return;
  if (Math.floor(scheduledTime / 60_000) % ALERT_CHECK_MINUTES !== 0) return;
  const now = Math.floor(scheduledTime / 1000);

  const devices = await subscribedDevices(tenant, 'alerts', null);
  if (devices.length === 0) {
    await tenant.db.prepare('DELETE FROM alerts_seen').run();
    return;
  }
  const [{ timezone }, { lists, airborne }, seenRows] = await Promise.all([
    loadSettings(tenant),
    alertLists(tenant),
    tenant.db.prepare('SELECT key FROM alerts_seen').all<{ key: string }>(),
  ]);
  const flightsById = new Map(lists.flights.map(f => [f.id, f as EffectiveFlight]));
  const current = new Map<string, Alert>();
  for (const alert of computeAlerts(timezone, now, lists)) {
    if (alert.kind === 'unassigned_flight' && airborne.has(alert.flight_id)) continue;
    // One bad alert skips itself, not every subscriber's run.
    let key: string;
    try { key = alertKey(alert, flightsById); } catch (err) { console.error('checkAlerts: skipping an alert:', err); continue; }
    current.set(key, alert);
  }
  const seen = new Set(seenRows.results.map(r => r.key));
  if (!seen.delete(BASELINE_KEY)) {
    await tenant.db.batch([
      tenant.db.prepare('DELETE FROM alerts_seen'),
      ...[BASELINE_KEY, ...current.keys()].map(key =>
        tenant.db.prepare('INSERT INTO alerts_seen (key, seen_at) VALUES (?, ?)').bind(key, now)),
    ]);
    return;
  }
  const appeared = [...current].filter(([key]) => !seen.has(key));
  const gone = [...seen].filter(key => !current.has(key));
  if (appeared.length === 0 && gone.length === 0) return;

  // Recorded before sending: a failed send isn't retried, as a tracker event's isn't.
  await tenant.db.batch([
    ...gone.map(key => tenant.db.prepare('DELETE FROM alerts_seen WHERE key = ?').bind(key)),
    ...appeared.map(([key]) => tenant.db.prepare('INSERT OR IGNORE INTO alerts_seen (key, seen_at) VALUES (?, ?)').bind(key, now)),
  ]);
  if (appeared.length === 0) return;
  await sendAppPushes(tenant, appeared.map(([, alert]) => {
    const { text, detail } = alertText(alert);
    return {
      push: {
        title: alertTitle(alert), body: detail ? text + '\n' + detail : text,
        data: { type: 'alert', host: tenant.host }, channelId: PUSH_CHANNELS.alerts,
      },
      devices,
    };
  }));
}
