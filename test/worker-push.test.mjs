// App push through Expo (src/app-push.ts): a cron tick's gap alert sent to the subscribed
// devices, Expo's tickets kept, and their receipts checked on a later tick. Expo is
// mocked with Miniflare's outboundService (test/worker.mjs); every other outbound fetch
// gets a 404.

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker } from './worker.mjs';

const expo = { sends: [], receiptRequests: [], tickets: () => [], receipts: {} };
async function outbound(request) {
  const url = new URL(request.url);
  if (url.host !== 'exp.host') return new Response('not mocked', { status: 404 });
  const body = await request.json();
  if (url.pathname === '/--/api/v2/push/send') {
    expo.sends.push({ auth: request.headers.get('authorization'), messages: body });
    return Response.json({ data: expo.tickets(body) });
  }
  expo.receiptRequests.push(body.ids);
  return Response.json({ data: expo.receipts });
}

/** A tracker in flight, silent for 10 min (past the 5-min gap threshold): the next tick alerts. */
async function silentTracker(w, id) {
  const now = Math.floor(Date.now() / 1000);
  await w.run("INSERT INTO trackers (id, name, type, source_url) VALUES (?, 'Silent', 'spot', ?)", id, 'https://example.com/s' + id);
  await w.run("INSERT INTO poll_state (tracker_id, last_polled, flight_status, last_point_time) VALUES (?, ?, 'in_flight', ?)", id, now, now - 600);
  await w.run('INSERT INTO points (garmin_time, lat, lon, velocity_kmh, tracker_id) VALUES (?, 58, -154, 150, ?)', now - 600, id);
}

describe('app push through Expo', () => {
  let w;
  before(async () => {
    w = await startWorker({ bindings: { EXPO_ACCESS_TOKEN: 'test-expo-token' }, outbound });
    // Sessions 1 (admin) and 2 (viewer) come from startWorker; 3 is the admin's second device.
    await w.run("INSERT INTO sessions (id, user_id, token) VALUES (3, 1, 'admin-phone-2')");
    await w.run(`INSERT INTO push_devices (session_id, kind, endpoint) VALUES
      (1, 'expo', 'ExponentPushToken[admin]'), (2, 'expo', 'ExponentPushToken[viewer]'), (3, 'expo', 'ExponentPushToken[gone]')`);
  });
  after(() => w?.dispose());

  test('a gap alert goes to subscribed devices only; tickets kept, DeviceNotRegistered deleted', async () => {
    await silentTracker(w, 1);
    // The admin's first device: gap on every tracker and on tracker 1 (one push, not two); the
    // second: gap on tracker 1. The viewer: takeoff only.
    await w.run(`INSERT INTO push_session_subscriptions (session_id, tracker_id, event) VALUES
      (1, NULL, 'gap'), (1, 1, 'gap'), (3, 1, 'gap'), (2, 1, 'takeoff')`);
    expo.tickets = (messages) => messages.map((m) => m.to === 'ExponentPushToken[gone]'
      ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
      : { status: 'ok', id: 'ticket-' + m.to });

    await w.scheduled();

    assert.equal(expo.sends.length, 1);
    const [{ auth, messages }] = expo.sends;
    assert.equal(auth, 'Bearer test-expo-token');
    assert.deepEqual(messages.map((m) => m.to).sort(), ['ExponentPushToken[admin]', 'ExponentPushToken[gone]']);
    for (const m of messages) {
      assert.equal(m.title, 'Silent: signal gap');
      assert.match(m.body, /^No location update for 10 min while in flight/);
      assert.ok(!m.body.includes('MapShare:') && !m.body.includes('Tracker:'), m.body);
      assert.deepEqual(m.data, { type: 'gap', tracker_id: 1, host: 'localhost', mapshare_url: 'https://example.com/s1' });
      assert.equal(m.channelId, 'signal-gaps');
      assert.equal(m.categoryId, 'tracker');
      assert.equal(m.interruptionLevel, 'time-sensitive');
    }
    assert.deepEqual(await w.all('SELECT ticket_id, device_id FROM push_tickets'), [{ ticket_id: 'ticket-ExponentPushToken[admin]', device_id: 1 }]);
    assert.deepEqual((await w.all('SELECT endpoint FROM push_devices ORDER BY id')).map((d) => d.endpoint),
      ['ExponentPushToken[admin]', 'ExponentPushToken[viewer]']);
    // Receipts aren't asked for until a ticket is 15 minutes old.
    assert.deepEqual(expo.receiptRequests, []);
  });

  test('receipts: ok sets last_ok_at, DeviceNotRegistered deletes the device, missing ones wait a day', async () => {
    const now = Math.floor(Date.now() / 1000);
    await w.run('UPDATE push_tickets SET created_at = ?', now - 1200);
    await w.run('INSERT INTO push_tickets (ticket_id, device_id, created_at) VALUES (?, 2, ?), (?, 1, ?), (?, 1, ?)',
      'ticket-viewer', now - 1200, 'ticket-pending', now - 1200, 'ticket-stale', now - 90_000);
    expo.receipts = {
      'ticket-ExponentPushToken[admin]': { status: 'ok' },
      'ticket-viewer': { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
    };

    await w.scheduled();

    assert.equal(expo.receiptRequests.length, 1);
    assert.equal(expo.receiptRequests[0].length, 4);
    assert.deepEqual(await w.all('SELECT endpoint, last_ok_at, last_error FROM push_devices'),
      [{ endpoint: 'ExponentPushToken[admin]', last_ok_at: now - 1200, last_error: null }]);
    assert.deepEqual(await w.all('SELECT ticket_id FROM push_tickets'), [{ ticket_id: 'ticket-pending' }]);
  });

  test('Expo refusing a send records the error on each device', async () => {
    await silentTracker(w, 2);
    await w.run("INSERT INTO push_session_subscriptions (session_id, tracker_id, event) VALUES (1, 2, 'gap')");
    const sends = expo.sends.length;
    // A ticket list that doesn't match the messages one for one.
    expo.tickets = () => [];
    await w.scheduled();
    assert.equal(expo.sends.length, sends + 1);
    assert.match((await w.first('SELECT last_error FROM push_devices WHERE id = 1')).last_error, /unexpected response/);
  });

  test('each device chooses its Time Sensitive events; one that hasn’t said gets gap', async () => {
    const register = (body) => w.request('POST', '/api/me/push-devices', { kind: 'expo', token: 'ExponentPushToken[admin]', ...body });
    assert.equal((await register({ time_sensitive: ['takeoff', 'takeoff'] })).status, 200);
    // Registering again without it (an older app) keeps the choice.
    assert.equal((await register({})).status, 200);
    assert.equal((await register({ time_sensitive: ['alerts'] })).status, 400);
    assert.deepEqual(await w.all("SELECT time_sensitive FROM push_devices WHERE endpoint = 'ExponentPushToken[admin]'"),
      [{ time_sensitive: '["takeoff"]' }]);
    await w.run("INSERT INTO push_devices (session_id, kind, endpoint) VALUES (3, 'expo', 'ExponentPushToken[admin-2]')");

    await silentTracker(w, 3);
    await w.run("INSERT INTO push_session_subscriptions (session_id, tracker_id, event) VALUES (3, 3, 'gap')");
    expo.tickets = (messages) => messages.map((m) => ({ status: 'ok', id: 'ticket-' + m.to + '-' + Math.random() }));
    const sends = expo.sends.length;
    await w.scheduled();
    const messages = expo.sends.slice(sends).flatMap((s) => s.messages).filter((m) => m.data.tracker_id === 3);
    assert.deepEqual(messages.map((m) => [m.to, m.interruptionLevel ?? null]).sort(), [
      ['ExponentPushToken[admin-2]', 'time-sensitive'],
      ['ExponentPushToken[admin]', null],
    ]);
  });

  test("a device's subscriptions are its own: the account's other device isn't pushed to", async () => {
    await silentTracker(w, 4);
    const sends = expo.sends.length;
    await w.scheduled();
    const messages = expo.sends.slice(sends).flatMap((s) => s.messages).filter((m) => m.data.tracker_id === 4);
    assert.deepEqual(messages.map((m) => m.to), ['ExponentPushToken[admin]']);
  });

  test("a phone paired again under a new session keeps one registration per user, so one push", async () => {
    const register = (cookie) => w.request('POST', '/api/me/push-devices', { kind: 'expo', token: 'ExponentPushToken[admin]' },
      { as: null, headers: { cookie } });
    // The admin's second session (3) takes the token over from session 1; the viewer on the
    // same phone (another user) keeps theirs.
    await w.run("INSERT INTO push_devices (session_id, kind, endpoint) VALUES (2, 'expo', 'ExponentPushToken[admin]')");
    assert.equal((await register('session=admin-phone-2')).status, 200);
    assert.deepEqual(await w.all("SELECT session_id FROM push_devices WHERE endpoint = 'ExponentPushToken[admin]' ORDER BY session_id"),
      [{ session_id: 2 }, { session_id: 3 }]);
    // Session 3 has its own subscriptions, so it doesn't take session 1's.
    const subs = (session) => w.all('SELECT tracker_id, event FROM push_session_subscriptions WHERE session_id = ? ORDER BY tracker_id', session);
    assert.deepEqual(await subs(3), [{ tracker_id: 1, event: 'gap' }, { tracker_id: 3, event: 'gap' }]);
    // A new one has none, and takes session 3's (not the viewer's).
    await w.run("INSERT INTO sessions (id, user_id, token) VALUES (4, 1, 'admin-phone-3')");
    assert.equal((await register('session=admin-phone-3')).status, 200);
    assert.deepEqual(await subs(4), await subs(3));
    assert.deepEqual(await w.all("SELECT session_id FROM push_devices WHERE endpoint = 'ExponentPushToken[admin]' ORDER BY session_id"),
      [{ session_id: 2 }, { session_id: 4 }]);
    // Registering again doesn't bring back what was turned off since.
    await w.run('DELETE FROM push_session_subscriptions WHERE session_id = 4');
    assert.equal((await register('session=admin-phone-3')).status, 200);
    assert.deepEqual(await subs(4), []);
  });
});

describe('without EXPO_ACCESS_TOKEN', () => {
  test('no app push is sent', async () => {
    const w = await startWorker({ outbound });
    try {
      await silentTracker(w, 1);
      await w.run("INSERT INTO push_devices (session_id, kind, endpoint) VALUES (1, 'expo', 'ExponentPushToken[x]')");
      await w.run("INSERT INTO push_session_subscriptions (session_id, tracker_id, event) VALUES (1, NULL, 'gap')");
      const sends = expo.sends.length;
      await w.scheduled();
      assert.equal(expo.sends.length, sends);
      // The alert itself still happened.
      assert.equal((await w.first('SELECT gap_alerted FROM poll_state WHERE tracker_id = 1')).gap_alerted, 1);
    } finally {
      await w.dispose();
    }
  });
});
