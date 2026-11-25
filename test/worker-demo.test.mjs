// The demo tenant (docs/mobile-app-plan.md, "Store review and privacy requirements"): on a
// tenant listed in DEMO_BINDINGS and seeded by scripts/demo-seed.mjs, the cron moves the
// `demo:<n>` trackers and the demo code signs in, on the web and from the app. Off the demo
// tenant, the same rows do neither.

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWorker, splitSql, sha256Hex } from './worker.mjs';
import { importCore } from './core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { DEMO_CODE } = await importCore('app-connect');
const SEED = splitSql(execFileSync(process.execPath, [path.join(ROOT, 'scripts/demo-seed.mjs'), 'sql'], { encoding: 'utf8' }));

// Geocoding falls back to Overpass for a place the named points miss; nothing goes out.
const outbound = () => new Response('not mocked', { status: 503 });

async function seededWorker(bindings) {
  const w = await startWorker({ bindings, outbound });
  await w.db.batch(SEED.map((s) => w.db.prepare(s)));
  return w;
}

let demo, real;
before(async () => {
  demo = await seededWorker({ DEMO_BINDINGS: '["DB"]' });
  real = await seededWorker({});
});
after(async () => {
  await demo?.dispose();
  await real?.dispose();
});

const signIn = (w, code, ret = '/') => w.request('POST', '/demo/sign-in', new URLSearchParams({ code, return: ret }).toString(),
  { as: null, raw: true, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
const pair = (w, token) => w.request('POST', '/api/app/pair', { token, device_name: 'Reviewer iPhone' }, { as: null });
const sessionCookie = (r) => /session=([^;]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1];

describe('the cron', () => {
  test('moves the demo trackers on a demo tenant: points, flights and shift pilots', async () => {
    await demo.run('UPDATE trackers SET active = 1');
    const polledAt = Math.floor(Date.now() / 1000);
    await demo.scheduled();
    const perTracker = await demo.all('SELECT tracker_id, COUNT(*) AS n, COUNT(DISTINCT pilot_id) AS pilots FROM points GROUP BY tracker_id ORDER BY tracker_id');
    assert.deepEqual(perTracker.map((r) => r.tracker_id), [1, 2, 3]);
    // Two days back, a fix every 2 minutes or less.
    for (const r of perTracker) assert.ok(r.n > 1300 && r.pilots >= 3, JSON.stringify(r));
    const flights = await demo.all('SELECT tracker_id, aircraft_tail, pilot_id, start_time, end_time FROM flights ORDER BY start_time');
    assert.ok(flights.length > 3 * 2 * 24, `${flights.length} flights`);
    for (const f of flights) {
      assert.equal(f.aircraft_tail, `N${f.tracker_id}00DM`);
      // The pilot is one of the tracker's four (demo-seed.mjs: 4i+1 … 4i+4).
      assert.ok(f.pilot_id > 4 * (f.tracker_id - 1) && f.pilot_id <= 4 * f.tracker_id, JSON.stringify(f));
      // A 40-minute leg, but for the ones the poll's window (the last two days) cuts.
      if (f.start_time < polledAt - 2 * 86400 + 3600 || f.end_time > polledAt - 3600) continue;
      const minutes = (f.end_time - f.start_time) / 60;
      assert.ok(minutes > 30 && minutes < 45, JSON.stringify(f));
    }
  });

  test('leaves the same trackers alone on a real tenant', async () => {
    await real.run('UPDATE trackers SET active = 1');
    await real.scheduled();
    assert.equal((await real.first('SELECT COUNT(*) AS n FROM points')).n, 0);
    assert.equal((await real.first('SELECT COUNT(*) AS n FROM flights')).n, 0);
  });
});

describe('the demo code', () => {
  test('signs a browser in as the demo user, and back to the app connect page or a flight', async () => {
    const r = await signIn(demo, DEMO_CODE.toUpperCase() + ' ');
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/');
    const token = sessionCookie(r);
    const user = await demo.first('SELECT u.name, u.role, u.pilot_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', await sha256Hex(token));
    assert.deepEqual({ ...user }, { name: 'Jordan Lee', role: 'admin', pilot_id: 2 });

    const connect = '/app/connect?challenge=x&state=y';
    assert.equal((await signIn(demo, DEMO_CODE, connect)).headers.get('location'), connect);
    assert.equal((await signIn(demo, DEMO_CODE, '/flights/3/1764000000')).headers.get('location'), '/flights/3/1764000000');
    // Only home, the app's connect page or a flight: anywhere else goes home.
    for (const ret of ['https://evil.example/', '//evil.example/', '/app/connectx', '/flights/x', '//evil.example/flights/3/4']) {
      assert.equal((await signIn(demo, DEMO_CODE, ret)).headers.get('location'), '/', ret);
    }
  });

  test('a wrong code is refused with the form again', async () => {
    const before = (await demo.first('SELECT COUNT(*) AS n FROM sessions')).n;
    const r = await signIn(demo, 'kodiak2');
    assert.equal(r.status, 401);
    assert.match(r.body, /That isn’t the demo code/);
    assert.equal(sessionCookie(r), undefined);
    assert.equal((await demo.first('SELECT COUNT(*) AS n FROM sessions')).n, before);
  });

  test('the signed-out pages offer the code on a demo tenant only', async () => {
    assert.match((await demo.request('GET', '/login', undefined, { as: null })).body, /action="\/demo\/sign-in"/);
    assert.doesNotMatch((await real.request('GET', '/login', undefined, { as: null })).body, /demo\/sign-in/);
  });

  test('pairs the app, every time', async () => {
    for (let k = 0; k < 2; k++) {
      const r = await pair(demo, DEMO_CODE);
      assert.equal(r.status, 200);
      assert.deepEqual([r.body.me.name, r.body.me.role, r.body.me.pilot_id, r.body.me.device_name], ['Jordan Lee', 'admin', 2, 'Reviewer iPhone']);
      const me = await demo.request('GET', '/api/me', undefined, { as: null, headers: { authorization: 'Bearer ' + r.body.token } });
      assert.equal(me.status, 200);
    }
    assert.equal((await pair(demo, 'nope')).status, 404);
  });

  test('does nothing on a real tenant, though its settings have one', async () => {
    assert.equal((await signIn(real, DEMO_CODE)).status, 404);
    assert.equal((await pair(real, DEMO_CODE)).status, 404);
    assert.equal((await real.first("SELECT COUNT(*) AS n FROM sessions WHERE device_name = 'Reviewer iPhone'")).n, 0);
  });
});

describe('deleting my account', () => {
  const asBearer = (token) => ({ as: null, headers: { authorization: 'Bearer ' + token } });

  test('on a demo tenant signs this device out and keeps the shared demo user', async () => {
    const mine = (await pair(demo, DEMO_CODE)).body.token;
    const other = (await pair(demo, DEMO_CODE)).body.token;
    const r = await demo.request('DELETE', '/api/me', undefined, asBearer(mine));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
    assert.equal((await demo.request('GET', '/api/me', undefined, asBearer(mine))).status, 401);
    // Another reviewer's session, the demo user and the demo code still work.
    assert.equal((await demo.request('GET', '/api/me', undefined, asBearer(other))).status, 200);
    assert.equal((await demo.first("SELECT COUNT(*) AS n FROM users WHERE name = 'Jordan Lee'")).n, 1);
    assert.equal((await pair(demo, DEMO_CODE)).status, 200);
  });
});

describe('pruning', () => {
  const DAY = 86400;
  // On the hour, when the cron prunes.
  const at = new Date(Math.floor(Date.now() / 3600_000) * 3600_000);
  const now = Math.floor(at.getTime() / 1000);

  // Rows from 40 days ago and from 10 days ago, ids from 900000 so they don't meet the feed's.
  async function addHistory(w) {
    const demoUser = Number((await w.first(`SELECT value FROM settings WHERE key = 'demo_user_id'`)).value);
    const otherUser = (await w.first(`INSERT INTO users (name, role) VALUES ('Other', 'viewer') RETURNING id`)).id;
    const stmts = [];
    for (const [id, start] of [[900001, now - 40 * DAY], [900002, now - 10 * DAY]]) {
      stmts.push(`INSERT INTO flights (id, tracker_id, start_time, end_time, point_count) VALUES (${id}, 1, ${start}, ${start + 3600}, 1)`);
      stmts.push(`INSERT INTO points (id, garmin_time, lat, lon, tracker_id) VALUES (${id}, ${start + 60}, 57.75, -152.49, 1)`);
      stmts.push(`INSERT INTO point_flights (point_id, flight_id) VALUES (${id}, ${id})`);
    }
    // A point on the ground, in no flight.
    stmts.push(`INSERT INTO points (id, garmin_time, lat, lon, tracker_id) VALUES (900003, ${now - 40 * DAY + 7200}, 57.75, -152.49, 1)`);
    stmts.push(`INSERT INTO sessions (user_id, token, device_name, last_seen_at) VALUES (${demoUser}, 'old-demo', 'old', ${now - 40 * DAY})`);
    stmts.push(`INSERT INTO sessions (user_id, token, device_name, last_seen_at) VALUES (${demoUser}, 'new-demo', 'new', ${now - 10 * DAY})`);
    stmts.push(`INSERT INTO sessions (user_id, token, device_name, last_seen_at) VALUES (${otherUser}, 'old-other', 'other', ${now - 40 * DAY})`);
    for (const s of stmts) await w.run(s);
  }
  const left = async (w) => ({
    flights: (await w.all('SELECT id FROM flights WHERE id >= 900000 ORDER BY id')).map((r) => r.id),
    points: (await w.all('SELECT id FROM points WHERE id >= 900000 ORDER BY id')).map((r) => r.id),
    links: (await w.all('SELECT point_id FROM point_flights WHERE point_id >= 900000 ORDER BY point_id')).map((r) => r.point_id),
    sessions: (await w.all(`SELECT token FROM sessions WHERE token IN ('old-demo', 'new-demo', 'old-other') ORDER BY token`)).map((r) => r.token),
  });

  test('on a demo tenant drops the history before the last month and its idle demo sessions', async () => {
    await addHistory(demo);
    await demo.scheduled({ scheduledTime: at });
    assert.deepEqual(await left(demo), {
      flights: [900002], points: [900002], links: [900002], sessions: ['new-demo', 'old-other'],
    });
  });

  test('never on a real tenant', async () => {
    await addHistory(real);
    await real.scheduled({ scheduledTime: at });
    assert.deepEqual(await left(real), {
      flights: [900001, 900002], points: [900001, 900002, 900003], links: [900001, 900002],
      sessions: ['new-demo', 'old-demo', 'old-other'],
    });
  });
});
