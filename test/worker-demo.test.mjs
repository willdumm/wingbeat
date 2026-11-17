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
  test('signs a browser in as the demo user, and back to the app connect page', async () => {
    const r = await signIn(demo, DEMO_CODE.toUpperCase() + ' ');
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/');
    const token = sessionCookie(r);
    const user = await demo.first('SELECT u.name, u.role, u.pilot_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', await sha256Hex(token));
    assert.deepEqual({ ...user }, { name: 'Jordan Lee', role: 'admin', pilot_id: 2 });

    const connect = '/app/connect?challenge=x&state=y';
    assert.equal((await signIn(demo, DEMO_CODE, connect)).headers.get('location'), connect);
    // Only home or the app's connect page: anywhere else goes home.
    for (const ret of ['https://evil.example/', '//evil.example/', '/app/connectx']) {
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
