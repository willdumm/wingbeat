// Alert notifications (src/alert-push.ts): the cron's alerts are the page's (the same
// fixture through the flight store and the bootstrap, as the dashboard computes them, and
// through the Worker's D1 lists), and each one is pushed once, when it first appears. Expo is
// mocked with Miniflare's outboundService (test/worker.mjs).

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker } from './worker.mjs';
import { importCore } from './core.mjs';

const { alertText, alertTitle, computeAlerts } = await importCore('alerts');
const { createFlightStore } = await importCore('flight-store');
const { createApiClient } = await importCore('api/client');
const { SPEED_THRESHOLD_KMH } = await importCore('regions');

const sends = [];
async function outbound(request) {
  const url = new URL(request.url);
  if (url.host !== 'exp.host' || url.pathname !== '/--/api/v2/push/send') return new Response('not mocked', { status: 404 });
  const messages = await request.json();
  sends.push(...messages);
  return Response.json({ data: messages.map((m, i) => ({ status: 'ok', id: 'ticket-' + sends.length + '-' + i })) });
}

// A cron tick on an alert-check minute (every 5th), `minutes` after the first one.
const T0 = Math.floor(Date.now() / 300_000) * 300_000;
const NOW = T0 / 1000;
const tick = (minutes = 0) => new Date(T0 + minutes * 60_000);
const H = 3600, D = 86400;

let nextPoint = 1;
/** A tracked flight with its start and end points (GET /api/flights/complete joins both). */
async function seedFlight(w, { id, start, hours, tail = 'N1', pilot = null }) {
  const end = start + hours * H;
  const [p1, p2] = [nextPoint++, nextPoint++];
  await w.run('INSERT INTO points (id, garmin_time, lat, lon, velocity_kmh, tracker_id) VALUES (?, ?, 58, -154, 0, 1), (?, ?, 58, -153, 0, 1)', p1, start, p2, end);
  await w.run('INSERT INTO flights (id, tracker_id, start_time, end_time, point_count, aircraft_tail, pilot_id, modified_at) VALUES (?, 1, ?, ?, 2, ?, ?, ?)',
    id, start, end, tail, pilot, NOW - D);
  await w.run('INSERT INTO point_flights (point_id, flight_id) VALUES (?, ?), (?, ?)', p1, id, p2, id);
}

/** The flight again under a new id, as the poller's segmentation rewrites one. */
async function rewriteFlight(w, from, to) {
  await w.run(`INSERT INTO flights (id, tracker_id, start_time, end_time, point_count, aircraft_tail, pilot_id, modified_at)
    SELECT ?, tracker_id, start_time, end_time, point_count, aircraft_tail, pilot_id, modified_at FROM flights WHERE id = ?`, to, from);
  await w.run('UPDATE point_flights SET flight_id = ? WHERE flight_id = ?', to, from);
  await w.run('DELETE FROM flights WHERE id = ?', from);
}

/** The alerts as the dashboard computes them: the flight store's effective flights and the bootstrap's lists. */
async function pageAlerts(w) {
  const client = createApiClient({ baseUrl: 'http://localhost', fetch: () => w.adminFetch });
  const storage = new Map();
  const store = createFlightStore({
    storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => { storage.set(k, v); } },
    client,
    flightThresholdKmh: SPEED_THRESHOLD_KMH,
  });
  store.init();
  const bootstrap = await (await w.adminFetch('http://localhost/api/bootstrap')).json();
  store.setPilots(bootstrap.pilots);
  await store.refresh(bootstrap.trackers.filter(t => t.active && !t.deleted).map(t => t.id));
  return computeAlerts(bootstrap.instance.timezone, NOW, {
    flights: store.getAll(), aircraft: bootstrap.aircraft, pilots: bootstrap.pilots, trackers: bootstrap.trackers,
  });
}

const pushOf = (alert) => {
  const { text, detail } = alertText(alert);
  return { title: alertTitle(alert), body: detail ? text + '\n' + detail : text };
};
const sent = (from = 0) => sends.slice(from).map(m => ({ title: m.title, body: m.body }));

describe('alert notifications', () => {
  let w;
  before(async () => {
    w = await startWorker({ bindings: { EXPO_ACCESS_TOKEN: 'test-expo-token' }, outbound });
    await w.run("UPDATE settings SET value = 'America/Anchorage' WHERE key = 'timezone'");
    await w.run("INSERT INTO trackers (id, name, type, source_url) VALUES (1, 'Cub', 'spot', 'https://example.com/1')");
    // Polled in the future, so the ticks don't poll it (nor see a signal gap).
    await w.run('INSERT INTO poll_state (tracker_id, last_polled, last_point_time) VALUES (1, ?, ?)', NOW + D, NOW + D);
    await w.run("INSERT INTO pilots (id, name) VALUES (1, 'Pat'), (2, 'Quinn')");
    // N1: Hobbs 100 ten days ago, so the oil change (due at 105) is overdue after the
    // flights since; the annual is overdue (a calendar item comes due at its month's end, so
    // 400 days back is overdue on any date); the prop needs a tach reading.
    const schedule = [
      { id: 'oil', name: 'Oil change', schedule_type: 'hobbs', interval_hours: 50, last_done_value: 55 },
      { id: 'annual', name: 'Annual', schedule_type: 'calendar', interval_months: 12, last_done_at: NOW - 400 * D },
      { id: 'prop', name: 'Prop', schedule_type: 'tach', interval_hours: 100, last_done_value: 0 },
    ];
    await w.run("INSERT INTO aircraft (tail_number, name, hobbs_time, hobbs_recorded_at, maintenance_schedule) VALUES ('N1', 'Cub', 100, ?, ?)",
      NOW - 10 * D, JSON.stringify(schedule));
    // Flight 1 has no pilot; flight 2's lack of one doesn't count, as it's removed.
    await seedFlight(w, { id: 1, start: NOW - 2 * D, hours: 1 });
    await seedFlight(w, { id: 2, start: NOW - 3 * D, hours: 1 });
    await w.run('INSERT INTO flight_corrections (tracker_id, flight_start_time, excluded) VALUES (1, ?, 1)', NOW - 3 * D);
    // A manual flight puts Pat at 7.5 of the 8 hours in 24.
    await w.run("INSERT INTO flight_corrections (start_time, end_time, pilot_id, aircraft_tail) VALUES (?, ?, 1, 'N1')", NOW - 9 * H, NOW - 1.5 * H);
    await w.run("INSERT INTO push_devices (session_id, kind, endpoint) VALUES (2, 'expo', 'ExponentPushToken[viewer]')");
    await w.run("INSERT INTO push_subscriptions (user_id, tracker_id, event) VALUES (2, NULL, 'alerts')");
    // An instance whose alerts were already checked, with none present then.
    await w.run("INSERT INTO alerts_seen (key, seen_at) VALUES ('baseline', ?)", NOW - D);
  });
  after(() => w?.dispose());

  test('the cron pushes the alerts the page computes, each one once', async () => {
    const page = await pageAlerts(w);
    assert.deepEqual(page.map(a => a.kind).sort(), ['maintenance', 'maintenance', 'pilot_duty', 'timer_not_recorded', 'unassigned_flight']);

    await w.scheduled({ scheduledTime: tick() });
    assert.deepEqual(sent().sort((a, b) => a.body.localeCompare(b.body)), page.map(pushOf).sort((a, b) => a.body.localeCompare(b.body)));
    for (const m of sends) {
      assert.equal(m.to, 'ExponentPushToken[viewer]');
      assert.deepEqual(m.data, { type: 'alert', host: 'localhost' });
      assert.equal(m.interruptionLevel, undefined);
    }
    assert.ok(sent().some(m => m.title === 'Unassigned flight' && /· N1 · no pilot\n\d\d:\d\d AKST$/.test(m.body)), JSON.stringify(sent()));

    // The same alerts at the next check: nothing new.
    await w.scheduled({ scheduledTime: tick(5) });
    assert.equal(sends.length, 5);
  });

  test('between checks nothing is pushed; an alert that goes and comes back notifies again', async () => {
    const before = sends.length;
    await w.run('UPDATE flights SET pilot_id = 2 WHERE id = 1');
    await w.scheduled({ scheduledTime: tick(10) });
    assert.equal(sends.length, before);
    assert.equal((await w.all("SELECT key FROM alerts_seen WHERE key LIKE 'flight/%'")).length, 0);

    await w.run('UPDATE flights SET pilot_id = NULL WHERE id = 1');
    // Not an alert-check minute.
    await w.scheduled({ scheduledTime: tick(11) });
    assert.equal(sends.length, before);
    await w.scheduled({ scheduledTime: tick(15) });
    assert.deepEqual(sent(before).map(m => m.title), ['Unassigned flight']);
    assert.deepEqual(await w.all("SELECT key FROM alerts_seen WHERE key LIKE 'flight/%'"), [{ key: 'flight/1/' + (NOW - 2 * D) }]);
  });

  test('an unassigned flight still in the air waits until it lands; a new id for the same flight isn’t new', async () => {
    const before = sends.length;
    await seedFlight(w, { id: 3, start: NOW - 1800, hours: 0.25 });
    await w.run("UPDATE poll_state SET flight_status = 'in_flight'");
    await w.scheduled({ scheduledTime: tick(20) });
    assert.equal(sends.length, before);

    // Landed, and the poller rewrote the flight under a new id.
    await w.run("UPDATE poll_state SET flight_status = 'grounded'");
    await rewriteFlight(w, 3, 4);
    await w.scheduled({ scheduledTime: tick(25) });
    assert.deepEqual(sent(before).map(m => m.title), ['Unassigned flight']);
    await rewriteFlight(w, 4, 5);
    await w.scheduled({ scheduledTime: tick(30) });
    assert.equal(sends.length, before + 1);
  });

  test('without subscribers nothing is kept; the first check with one records without pushing', async () => {
    const before = sends.length;
    await w.run("DELETE FROM push_subscriptions WHERE event = 'alerts'");
    await w.scheduled({ scheduledTime: tick(35) });
    assert.deepEqual(await w.all('SELECT key FROM alerts_seen'), []);

    await w.run("INSERT INTO push_subscriptions (user_id, tracker_id, event) VALUES (2, NULL, 'alerts')");
    await w.scheduled({ scheduledTime: tick(40) });
    assert.equal(sends.length, before);
    const keys = (await w.all('SELECT key FROM alerts_seen')).map(r => r.key);
    assert.ok(keys.includes('baseline') && keys.length > 1, JSON.stringify(keys));
    await w.scheduled({ scheduledTime: tick(45) });
    assert.equal(sends.length, before);
  });
});
