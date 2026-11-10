// Session and invite handling through the real Worker (test/worker.mjs): hashed session
// tokens, idle expiry, single-use short-lived device links, atomic invite redemption, the
// app's pairing, account deletion, and validation of the invite / session / user-delete routes.

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker, sha256Hex } from './worker.mjs';

let w;
before(async () => { w = await startWorker(); });
after(() => w?.dispose());

const now = () => Math.floor(Date.now() / 1000);
const cookieOf = (r) => /session=([0-9a-f]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1];
const withCookie = (raw) => ({ as: null, headers: { cookie: 'session=' + raw } });

async function invite(name = 'New Person', role = 'viewer') {
  const r = await w.request('POST', '/api/invites', { name, role });
  assert.equal(r.status, 200);
  return r.body.token;
}
async function join(token, opts = {}) {
  return w.request('POST', '/join/' + token, undefined, { as: null, ...opts });
}

describe('hashed session tokens', () => {
  test('invite login stores a hash; the cookie works; the hash does not', async () => {
    const r = await join(await invite('Hashed'));
    assert.equal(r.status, 302);
    const raw = cookieOf(r);
    assert.ok(raw);
    const row = await w.first('SELECT s.token, s.token_hashed FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.name = ?', 'Hashed');
    assert.notEqual(row.token, raw);
    assert.equal(row.token, await sha256Hex(raw));
    assert.equal(row.token_hashed, 1);
    assert.equal((await w.request('GET', '/api/me/sessions', undefined, withCookie(raw))).status, 200);
    assert.equal((await w.request('GET', '/api/me/sessions', undefined, withCookie(row.token))).status, 401);
  });

  test('a legacy plaintext row authenticates and is upgraded in place', async () => {
    await w.run("INSERT INTO sessions (user_id, token, token_hashed) VALUES (2, 'legacy-raw-token', 0)");
    const r = await w.request('GET', '/api/me/sessions', undefined, withCookie('legacy-raw-token'));
    assert.equal(r.status, 200);
    let row;
    for (let i = 0; i < 20; i++) {
      row = await w.first("SELECT token, token_hashed FROM sessions WHERE token_hashed = 1 AND token = ?", await sha256Hex('legacy-raw-token'));
      if (row) break;
      await new Promise(res => setTimeout(res, 50));
    }
    assert.ok(row, 'row upgraded to hashed');
    assert.equal(await w.first("SELECT 1 AS x FROM sessions WHERE token = 'legacy-raw-token'"), null);
    assert.equal((await w.request('GET', '/api/me/sessions', undefined, withCookie('legacy-raw-token'))).status, 200);
  });

  test('logout deletes the hashed session', async () => {
    const raw = cookieOf(await join(await invite('Leaver')));
    await w.request('POST', '/logout', undefined, withCookie(raw));
    assert.equal((await w.request('GET', '/api/me/sessions', undefined, withCookie(raw))).status, 401);
    assert.equal(await w.first('SELECT 1 AS x FROM sessions WHERE token = ?', await sha256Hex(raw)), null);
  });
});

describe('idle timeout', () => {
  test('a session idle for 91 days is rejected and deleted', async () => {
    const raw = cookieOf(await join(await invite('Idle')));
    const hash = await sha256Hex(raw);
    await w.run('UPDATE sessions SET last_seen_at = ? WHERE token = ?', now() - 91 * 86400, hash);
    assert.equal((await w.request('GET', '/api/me/sessions', undefined, withCookie(raw))).status, 401);
    assert.equal(await w.first('SELECT 1 AS x FROM sessions WHERE token = ?', hash), null);
  });

  test('last_seen_at is refreshed when stale (>1h) and left alone when fresh', async () => {
    const raw = cookieOf(await join(await invite('Toucher')));
    const hash = await sha256Hex(raw);
    await w.run('UPDATE sessions SET last_seen_at = ? WHERE token = ?', now() - 7200, hash);
    await w.request('GET', '/api/me/sessions', undefined, withCookie(raw));
    let seen;
    for (let i = 0; i < 20; i++) {
      seen = (await w.first('SELECT last_seen_at FROM sessions WHERE token = ?', hash)).last_seen_at;
      if (now() - seen < 60) break;
      await new Promise(res => setTimeout(res, 50));
    }
    assert.ok(now() - seen < 60);
    await w.run('UPDATE sessions SET last_seen_at = ? WHERE token = ?', now() - 600, hash);
    await w.request('GET', '/api/me/sessions', undefined, withCookie(raw));
    await new Promise(res => setTimeout(res, 150));
    assert.ok(now() - (await w.first('SELECT last_seen_at FROM sessions WHERE token = ?', hash)).last_seen_at >= 590);
  });
});

describe('device links', () => {
  test('single use, and the link lives 15 minutes', async () => {
    const r = await w.request('POST', '/api/me/device-link');
    assert.equal(r.status, 200);
    const token = r.body.url.replace('/join/', '');
    const row = await w.first('SELECT expires_at FROM invite_tokens WHERE token = ?', token);
    const ttl = row.expires_at - now();
    assert.ok(ttl > 14 * 60 && ttl <= 15 * 60, `ttl ${ttl}`);

    const first = await join(token);
    assert.equal(first.status, 302);
    const raw = cookieOf(first);
    assert.equal((await w.request('GET', '/api/me', undefined, withCookie(raw))).status, 200);
    const sessions = (await w.first('SELECT COUNT(*) AS n FROM sessions WHERE user_id = 1')).n;

    assert.equal((await join(token)).status, 410);
    assert.equal((await w.request('GET', '/join/' + token, undefined, { as: null })).status, 410);
    assert.equal((await w.first('SELECT COUNT(*) AS n FROM sessions WHERE user_id = 1')).n, sessions);
  });

  test('an expired link is refused', async () => {
    const token = (await w.request('POST', '/api/me/device-link')).body.url.replace('/join/', '');
    await w.run('UPDATE invite_tokens SET expires_at = ? WHERE token = ?', now() - 1, token);
    assert.equal((await join(token)).status, 410);
  });

  test('a device that already has a session is redirected without consuming the link', async () => {
    const token = (await w.request('POST', '/api/me/device-link')).body.url.replace('/join/', '');
    const r = await w.request('POST', '/join/' + token, undefined, { as: 'admin' });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/');
    assert.equal((await w.first('SELECT used FROM invite_tokens WHERE token = ?', token)).used, 0);
  });
});

describe('invite redemption', () => {
  test('cannot be redeemed twice; second attempt creates nothing', async () => {
    const token = await invite('Once');
    assert.equal((await join(token)).status, 302);
    const users = (await w.first('SELECT COUNT(*) AS n FROM users')).n;
    const sessions = (await w.first('SELECT COUNT(*) AS n FROM sessions')).n;
    assert.equal((await join(token)).status, 410);
    assert.equal((await w.first('SELECT COUNT(*) AS n FROM users')).n, users);
    assert.equal((await w.first('SELECT COUNT(*) AS n FROM sessions')).n, sessions);
  });

  test('concurrent redemptions produce exactly one account', async () => {
    const token = await invite('Racer');
    const rs = await Promise.all([join(token), join(token), join(token)]);
    assert.equal(rs.filter(r => r.status === 302).length, 1);
    assert.equal((await w.first("SELECT COUNT(*) AS n FROM users WHERE name = 'Racer'")).n, 1);
  });

  test('an expired invite is refused and not burned into an account', async () => {
    const token = await invite('Late');
    await w.run('UPDATE invite_tokens SET expires_at = ? WHERE token = ?', now() - 1, token);
    assert.equal((await join(token)).status, 410);
    assert.equal((await w.first("SELECT COUNT(*) AS n FROM users WHERE name = 'Late'")).n, 0);
  });
});

// The app's pairing redeems the same tokens as POST /join/:token, through the same function,
// but answers in JSON with the session token instead of a cookie and a redirect.
describe('app pairing (POST /api/app/pair)', () => {
  const pair = (body, opts = {}) => w.request('POST', '/api/app/pair', body, { as: null, ...opts });
  const deviceLink = async () => (await w.request('POST', '/api/me/device-link')).body.url.replace('/join/', '');
  const bearer = (token) => ({ as: null, headers: { authorization: 'Bearer ' + token } });

  test('a device link pairs once: the token is a bearer session named after the phone', async () => {
    const link = await deviceLink();
    const r = await pair({ token: link, device_name: '  Ada’s iPhone  ' });
    assert.equal(r.status, 200);
    assert.match(r.body.token, /^[0-9a-f]+$/);
    assert.deepEqual({ ...r.body.me, session_id: 0 }, { id: 1, name: 'Ada Admin', role: 'admin', device_name: 'Ada’s iPhone', session_id: 0 });
    const row = await w.first('SELECT id, token, token_hashed, device_name FROM sessions WHERE token = ?', await sha256Hex(r.body.token));
    assert.deepEqual([row.id, row.token_hashed, row.device_name], [r.body.me.session_id, 1, 'Ada’s iPhone']);
    const me = await w.request('GET', '/api/me', undefined, bearer(r.body.token));
    assert.deepEqual(me.body, r.body.me);

    const again = await pair({ token: link, device_name: 'Thief' });
    assert.deepEqual([again.status, again.body], [410, { error: 'This sign-in link has already been used.' }]);
    assert.equal(await w.first("SELECT 1 AS x FROM sessions WHERE device_name = 'Thief'"), null);
    // Spent by the app, it's spent for the web too, and the other way round.
    assert.equal((await join(link)).status, 410);
    const webFirst = await deviceLink();
    assert.equal((await join(webFirst)).status, 302);
    assert.equal((await pair({ token: webFirst })).status, 410);
  });

  test('an invite creates the account, once', async () => {
    const token = await invite('Paired Pat', 'viewer');
    const r = await pair({ token, device_name: 'Pixel 9' });
    assert.equal(r.status, 200);
    const user = await w.first("SELECT id, role FROM users WHERE name = 'Paired Pat'");
    assert.deepEqual([r.body.me.id, r.body.me.name, r.body.me.role], [user.id, 'Paired Pat', 'viewer']);
    assert.equal((await w.request('GET', '/api/bootstrap', undefined, bearer(r.body.token))).status, 200);
    const again = await pair({ token, device_name: 'Pixel 9' });
    assert.deepEqual([again.status, again.body], [410, { error: 'This invite link has already been used.' }]);
    assert.equal((await w.first("SELECT COUNT(*) AS n FROM users WHERE name = 'Paired Pat'")).n, 1);
  });

  test('a missing or blank device name falls back to the platform; a long one is cut to 60', async () => {
    const iphone = { 'user-agent': 'Wingbeat/1 CFNetwork Darwin (iPhone)' };
    assert.equal((await pair({ token: await deviceLink() }, { headers: iphone })).body.me.device_name, 'iPhone');
    assert.equal((await pair({ token: await deviceLink(), device_name: '   ' }, { headers: iphone })).body.me.device_name, 'iPhone');
    assert.equal((await pair({ token: await deviceLink(), device_name: null })).body.me.device_name, 'Device');
    assert.equal((await pair({ token: await deviceLink(), device_name: 'x'.repeat(80) })).body.me.device_name, 'x'.repeat(60));
    assert.equal((await pair({ token: await deviceLink(), device_name: 'x'.repeat(59) + '🛩🛩' })).body.me.device_name, 'x'.repeat(59) + '🛩');
    assert.equal((await pair({ token: await deviceLink(), device_name: 'x'.repeat(59) + ' y' })).body.me.device_name, 'x'.repeat(59));
  });

  test('refusals are JSON: unknown, expired (not burned into an account), malformed', async () => {
    assert.deepEqual(await pair({ token: 'nope' }).then(r => [r.status, r.body]), [404, { error: 'This link is invalid.' }]);
    const late = await invite('Late Pairer');
    await w.run('UPDATE invite_tokens SET expires_at = ? WHERE token = ?', now() - 1, late);
    assert.deepEqual(await pair({ token: late }).then(r => [r.status, r.body]),
      [410, { error: 'This link has expired. Ask an admin for a new one.' }]);
    assert.equal((await w.first("SELECT COUNT(*) AS n FROM users WHERE name = 'Late Pairer'")).n, 0);
    const bad = await pair({ device_name: 'x' });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /^token: /);
  });

  test('needs no session, and a stale bearer or a cookie doesn’t get in its way', async () => {
    assert.equal((await pair({ token: await deviceLink() }, bearer('revoked'))).status, 200);
    // A cookie doesn't turn it into the web's "already signed in" redirect.
    const r = await pair({ token: await deviceLink() }, { as: 'admin' });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
  });

  test('concurrent pairings with one invite produce exactly one account and one session', async () => {
    const token = await invite('Pair Racer');
    const rs = await Promise.all([1, 2, 3].map(() => pair({ token, device_name: 'Racer phone' })));
    assert.deepEqual(rs.map(r => r.status).sort(), [200, 410, 410]);
    assert.equal((await w.first("SELECT COUNT(*) AS n FROM users WHERE name = 'Pair Racer'")).n, 1);
    assert.equal((await w.first("SELECT COUNT(*) AS n FROM sessions WHERE device_name = 'Racer phone'")).n, 1);
  });
});

// Account deletion started by the user (Settings, web and app): the account and everything
// that signs it in go; the operator's records stay; the env admin and the last admin can't.
describe('DELETE /api/me', () => {
  const pairAs = async (name, role = 'viewer') =>
    (await w.request('POST', '/api/app/pair', { token: await invite(name, role), device_name: name + ' phone' }, { as: null })).body;
  const bearer = (token) => ({ as: null, headers: { authorization: 'Bearer ' + token } });
  const deleteMe = (token) => w.request('DELETE', '/api/me', undefined, bearer(token));
  const userCount = async (name) => (await w.first('SELECT COUNT(*) AS n FROM users WHERE name = ?', name)).n;

  test('deletes the account, every session and device link of it, and nothing of the operator’s', async () => {
    const { token, me } = await pairAs('Departing Dee');
    const webCookie = cookieOf(await join((await w.request('POST', '/api/me/device-link', undefined, bearer(token))).body.url.replace('/join/', '')));
    await w.request('POST', '/api/me/device-link', undefined, bearer(token));
    await w.run('INSERT INTO pilots (id, name) VALUES (40, ?)', 'Departing Dee');
    await w.run("INSERT INTO trackers (id, name, type, source_url) VALUES (40, 'Dee’s', 'spot', 'https://example.com/40')");
    const s = now() - 86400;
    await w.run('INSERT INTO flights (tracker_id, start_time, end_time, pilot_id) VALUES (40, ?, ?, 40)', s, s + 600);

    const r = await deleteMe(token);
    assert.deepEqual([r.status, r.body], [200, { ok: true }]);
    assert.match(r.headers.get('set-cookie'), /^session=; .*Max-Age=0/);
    assert.equal(await userCount('Departing Dee'), 0);
    assert.equal((await w.first('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', me.id)).n, 0);
    assert.equal((await w.first('SELECT COUNT(*) AS n FROM invite_tokens WHERE user_id = ?', me.id)).n, 0);
    assert.equal((await deleteMe(token)).status, 401);
    assert.equal((await w.request('GET', '/api/me', undefined, withCookie(webCookie))).status, 401);
    assert.equal((await w.first('SELECT COUNT(*) AS n FROM flights WHERE pilot_id = 40')).n, 1);
    assert.equal((await w.first('SELECT name FROM pilots WHERE id = 40')).name, 'Departing Dee');
  });

  test('refuses the shared env-configured account', async () => {
    await w.run("INSERT INTO users (id, name, role, is_env_admin) VALUES (41, 'Shared', 'admin', 1)");
    try {
      await w.run("INSERT INTO sessions (user_id, token, token_hashed) VALUES (41, 'shared-raw', 0)");
      const r = await deleteMe('shared-raw');
      assert.deepEqual([r.status, r.body], [400, { error: 'The shared account cannot be deleted' }]);
      assert.equal(await userCount('Shared'), 1);
    } finally {
      await w.run('DELETE FROM users WHERE id = 41');
    }
  });

  // The end state, not the atomicity: Miniflare may well run the two requests one after the
  // other. That comes from the guard being part of deleteUserAccount's DELETE statement.
  test('refuses the last admin, and two admins leaving at once leave one', async () => {
    const a = await pairAs('Admin A', 'admin');
    const b = await pairAs('Admin B', 'admin');
    const admins = await w.all("SELECT id FROM users WHERE role = 'admin' AND id NOT IN (?, ?)", a.me.id, b.me.id);
    await w.run("UPDATE users SET role = 'viewer' WHERE role = 'admin' AND id NOT IN (?, ?)", a.me.id, b.me.id);
    try {
      const rs = await Promise.all([deleteMe(a.token), deleteMe(b.token)]);
      assert.deepEqual(rs.map(r => r.status).sort(), [200, 409]);
      assert.equal(rs.find(r => r.status === 409).body.error, 'Cannot delete the last admin. Make another user an admin first.');
      assert.equal((await w.first("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")).n, 1);
    } finally {
      await w.run("DELETE FROM users WHERE name IN ('Admin A', 'Admin B')");
      for (const { id } of admins) await w.run("UPDATE users SET role = 'admin' WHERE id = ?", id);
    }
  });
});

describe('POST /api/invites validation', () => {
  const bad = [
    ['missing name', { role: 'viewer' }],
    ['blank name', { name: '   ', role: 'viewer' }],
    ['non-string name', { name: 5, role: 'viewer' }],
    ['long name', { name: 'x'.repeat(101), role: 'viewer' }],
    ['bad role', { name: 'A', role: 'root' }],
    ['hours 0', { name: 'A', role: 'viewer', expires_in_hours: 0 }],
    ['hours 721', { name: 'A', role: 'viewer', expires_in_hours: 721 }],
    ['hours string', { name: 'A', role: 'viewer', expires_in_hours: '5' }],
    ['hours null', { name: 'A', role: 'viewer', expires_in_hours: null }],
  ];
  for (const [label, body] of bad) {
    test(label, async () => assert.equal((await w.request('POST', '/api/invites', body)).status, 400));
  }
  test('invalid JSON is 400', async () => {
    const r = await w.request('POST', '/api/invites', undefined, { headers: { 'content-type': 'application/json' } });
    assert.equal(r.status, 400);
  });
  test('name is trimmed; default expiry is 7 days', async () => {
    const r = await w.request('POST', '/api/invites', { name: '  Trim Me  ', role: 'viewer' });
    assert.equal(r.status, 200);
    const row = await w.first('SELECT invited_name, expires_at FROM invite_tokens WHERE token = ?', r.body.token);
    assert.equal(row.invited_name, 'Trim Me');
    assert.ok(Math.abs(row.expires_at - now() - 7 * 86400) < 60);
  });
});

describe('PATCH /api/me/sessions/:id', () => {
  const sid = async () => (await w.first('SELECT id FROM sessions WHERE user_id = 2 ORDER BY id LIMIT 1')).id;
  test('renames, trims, clears', async () => {
    const id = await sid();
    assert.equal((await w.request('PATCH', '/api/me/sessions/' + id, { device_name: '  Phone ' }, { as: 'viewer' })).status, 200);
    assert.equal((await w.first('SELECT device_name FROM sessions WHERE id = ?', id)).device_name, 'Phone');
    assert.equal((await w.request('PATCH', '/api/me/sessions/' + id, { device_name: null }, { as: 'viewer' })).status, 200);
    assert.equal((await w.first('SELECT device_name FROM sessions WHERE id = ?', id)).device_name, null);
  });
  for (const [label, v] of [['number', 5], ['object', {}], ['too long', 'x'.repeat(61)], ['missing', undefined]]) {
    test('rejects ' + label, async () => {
      const r = await w.request('PATCH', '/api/me/sessions/' + await sid(), { device_name: v }, { as: 'viewer' });
      assert.equal(r.status, 400);
    });
  }
  test('invalid JSON is 400', async () => {
    const r = await w.request('PATCH', '/api/me/sessions/' + await sid(), undefined, { as: 'viewer', headers: { 'content-type': 'application/json' } });
    assert.equal(r.status, 400);
  });
});

describe('DELETE /api/users/:id guards', () => {
  test('cannot delete yourself', async () => {
    assert.equal((await w.request('DELETE', '/api/users/1')).status, 400);
  });
  test('cannot delete the shared (env admin) account', async () => {
    await w.run("INSERT INTO users (id, name, role, is_env_admin) VALUES (50, 'Shared', 'admin', 1)");
    assert.equal((await w.request('DELETE', '/api/users/50')).status, 400);
    assert.ok(await w.first('SELECT 1 AS x FROM users WHERE id = 50'));
  });
  test('an admin may delete another admin while two exist', async () => {
    await w.run("INSERT INTO users (id, name, role) VALUES (51, 'Admin Two', 'admin')");
    await w.run("INSERT INTO sessions (user_id, token, token_hashed) VALUES (51, 'x-admin-two', 0)");
    // The caller is an admin other than the target, so the last-admin guard trips here only
    // when two admins delete each other at once (the guard is in the DELETE statement, so one
    // is refused). Deleting admin 1 is fine.
    assert.equal((await w.request('DELETE', '/api/users/1', undefined, withCookie('x-admin-two'))).status, 200);
    assert.equal((await w.request('DELETE', '/api/users/1', undefined, withCookie('x-admin-two'))).status, 404);
  });
  test('deletes an ordinary user', async () => {
    assert.equal((await w.request('DELETE', '/api/users/2', undefined, withCookie('x-admin-two'))).status, 200);
  });
});
