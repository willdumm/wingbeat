// Auth of the operator-only /api/admin/* routes, through the real Worker (test/worker.mjs):
// they take the POLLER_SECRET bearer token and never a session cookie, however the path is
// spelled (percent-encoding made the router dispatch to an admin handler that the auth
// middleware, matching on the raw path, hadn't recognized), the secret must be configured,
// and their query/body parameters are validated.

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker } from './worker.mjs';

const SECRET = 'test-secret-0123456789';
const BEARER = { headers: { authorization: `Bearer ${SECRET}` }, as: null };

let w;
before(async () => {
  w = await startWorker({ bindings: { POLLER_SECRET: SECRET } });
  await w.db.batch([
    w.db.prepare("INSERT INTO trackers (id, name, type, source_url) VALUES (1, 'One', 'spot', 'https://example.com/1')"),
    w.db.prepare("INSERT INTO points (tracker_id, garmin_time, lat, lon) VALUES (1, 1780000000, 40, -100)"),
  ]);
});
after(() => w?.dispose());

const invites = async () => (await w.first('SELECT COUNT(*) AS n FROM invite_tokens')).n;
const points = async () => (await w.first('SELECT COUNT(*) AS n FROM points')).n;

describe('session cookies never reach admin routes', () => {
  const bootstrapPaths = [
    '/api/admin/bootstrap',
    '/api/%61dmin/bootstrap',
    '/api/%61%64min/bootstrap',
    '/api/admin/%62ootstrap',
    '/api/%2561dmin/bootstrap',
    '/api/admin%2Fbootstrap',
    '/api/admin//bootstrap',
    '/api/admin/bootstrap/',
    '/api/Admin/bootstrap',
  ];
  for (const as of ['viewer', 'admin']) {
    for (const p of bootstrapPaths) {
      test(`${as} cookie: POST ${p}`, async () => {
        const before = await invites();
        const r = await w.request('POST', p, {}, { as });
        // Either the admin gate (401) or no route at all (404/redirect); never the handler.
        assert.ok([401, 404, 302].includes(r.status), `status ${r.status}`);
        assert.notEqual(r.status, 200);
        assert.equal(await invites(), before);
      });
    }
    test(`${as} cookie: POST /api/%61%64min/wipe-points leaves points`, async () => {
      const r = await w.request('POST', '/api/%61%64min/wipe-points', undefined, { as });
      assert.equal(r.status, 401);
      assert.equal(await points(), 1);
    });
  }

  test('an encoded admin path with a cookie and a wrong bearer is 401', async () => {
    const r = await w.request('POST', '/api/%61dmin/bootstrap', {}, { as: 'admin', headers: { authorization: 'Bearer nope' } });
    assert.equal(r.status, 401);
    assert.equal(await invites(), 0);
  });

  test('an encoded admin path takes the bearer like the plain one', async () => {
    const r = await w.request('POST', '/api/%61dmin/bootstrap', {}, BEARER);
    assert.equal(r.status, 200);
    assert.equal(await invites(), 1);
    await w.run('DELETE FROM invite_tokens');
  });
});

describe('bearer token', () => {
  test('correct bearer works without a cookie', async () => {
    const r = await w.request('POST', '/api/admin/bootstrap', {}, BEARER);
    assert.equal(r.status, 200);
    assert.match(r.body.url, /^\/join\//);
    await w.run('DELETE FROM invite_tokens');
  });

  for (const [label, auth] of [
    ['wrong bearer', 'Bearer wrong-secret-0123456789'],
    ['a prefix of the secret', `Bearer ${SECRET.slice(0, -1)}`],
    ['the secret without the scheme', SECRET],
    ['Bearer undefined', 'Bearer undefined'],
    ['empty header', ''],
  ]) {
    test(`${label} is 401`, async () => {
      const r = await w.request('POST', '/api/admin/bootstrap', {}, { as: null, headers: { authorization: auth } });
      assert.equal(r.status, 401);
      assert.equal(await invites(), 0);
    });
  }

  test('no credentials is 401', async () => {
    assert.equal((await w.request('POST', '/api/admin/bootstrap', {}, { as: null })).status, 401);
  });
});

describe('?tracker= validation', () => {
  for (const bad of ['abc', '1abc', '', '-1', '1.5', '1e3']) {
    for (const route of ['wipe-points', 'resegment', 'poll', 'geocode-pending', 'geocode-live']) {
      test(`${route}?tracker=${bad} is 400`, async () => {
        const r = await w.request('POST', `/api/admin/${route}?tracker=${encodeURIComponent(bad)}`, undefined, BEARER);
        assert.equal(r.status, 400);
        assert.equal(await points(), 1);
      });
    }
    test(`backfill?tracker=${bad} is 400`, async () => {
      const r = await w.request('POST', `/api/admin/backfill?d1=2026-01-01&tracker=${encodeURIComponent(bad)}`, undefined, BEARER);
      assert.equal(r.status, 400);
    });
  }

  test('a valid tracker wipes only that tracker', async () => {
    await w.db.batch([
      w.db.prepare("INSERT INTO trackers (id, name, type, source_url) VALUES (2, 'Two', 'spot', 'https://example.com/2')"),
      w.db.prepare("INSERT INTO points (tracker_id, garmin_time, lat, lon) VALUES (2, 1780000100, 41, -101)"),
    ]);
    const r = await w.request('POST', '/api/admin/wipe-points?tracker=2', undefined, BEARER);
    assert.equal(r.status, 200);
    assert.equal(await points(), 1);
    assert.equal((await w.first('SELECT tracker_id FROM points')).tracker_id, 1);
  });
});

describe('POST /api/admin/bootstrap input', () => {
  const post = body => w.request('POST', '/api/admin/bootstrap', body, BEARER);

  test('defaults: name Admin, 24 hours', async () => {
    const now = Math.floor(Date.now() / 1000);
    const r = await post({});
    assert.equal(r.status, 200);
    const row = await w.first('SELECT * FROM invite_tokens WHERE token = ?', r.body.token);
    assert.equal(row.invited_name, 'Admin');
    assert.ok(Math.abs(row.expires_at - (now + 24 * 3600)) < 60);
  });

  test('name is trimmed; hours are honoured', async () => {
    const r = await post({ name: '  Pat  ', expires_in_hours: 2 });
    assert.equal(r.status, 200);
    const row = await w.first('SELECT * FROM invite_tokens WHERE token = ?', r.body.token);
    assert.equal(row.invited_name, 'Pat');
  });

  const bad = [
    { name: '' }, { name: '   ' }, { name: 'x'.repeat(101) }, { name: 5 }, { name: null }, { name: ['a'] },
    { expires_in_hours: 0 }, { expires_in_hours: 0.5 }, { expires_in_hours: 169 }, { expires_in_hours: -5 },
    { expires_in_hours: '24' }, { expires_in_hours: null }, { expires_in_hours: 1e308 },
  ];
  for (const body of bad) {
    test(`rejects ${JSON.stringify(body)}`, async () => {
      const before = await invites();
      assert.equal((await post(body)).status, 400);
      assert.equal(await invites(), before);
    });
  }
});

describe('POLLER_SECRET not configured', () => {
  for (const [label, value] of [['unset', undefined], ['empty', ''], ['too short', 'short-secret']]) {
    test(`${label}: admin API fails closed`, async () => {
      const w2 = await startWorker({ bindings: { POLLER_SECRET: value } });
      try {
        const guesses = [
          { as: null, headers: { authorization: `Bearer ${value}` } },
          { as: null, headers: { authorization: 'Bearer undefined' } },
          { as: null, headers: { authorization: 'Bearer ' } },
          { as: 'admin' },
        ];
        for (const opts of guesses) {
          for (const p of ['/api/admin/bootstrap', '/api/%61dmin/bootstrap']) {
            const r = await w2.request('POST', p, {}, opts);
            assert.equal(r.status, 503);
          }
        }
        assert.equal((await w2.first('SELECT COUNT(*) AS n FROM invite_tokens')).n, 0);
      } finally {
        await w2.dispose();
      }
    });
  }
});
