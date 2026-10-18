// Session and invite handling through the real Worker (test/worker.mjs): hashed session
// tokens, idle expiry, single-use short-lived device links, atomic invite redemption, and
// validation of the invite / session / user-delete routes.

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
    assert.equal((await w.request('GET', '/api/me/sessions', undefined, withCookie(row.token))).status, 302);
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
    assert.equal((await w.request('GET', '/api/me/sessions', undefined, withCookie(raw))).status, 302);
    assert.equal(await w.first('SELECT 1 AS x FROM sessions WHERE token = ?', await sha256Hex(raw)), null);
  });
});

describe('idle timeout', () => {
  test('a session idle for 91 days is rejected and deleted', async () => {
    const raw = cookieOf(await join(await invite('Idle')));
    const hash = await sha256Hex(raw);
    await w.run('UPDATE sessions SET last_seen_at = ? WHERE token = ?', now() - 91 * 86400, hash);
    assert.equal((await w.request('GET', '/api/me/sessions', undefined, withCookie(raw))).status, 302);
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
    // The last-admin guard is defence in depth: the caller is always an admin other than the
    // target, so it can only trip if the counts are inconsistent. Deleting admin 1 is fine.
    assert.equal((await w.request('DELETE', '/api/users/1', undefined, withCookie('x-admin-two'))).status, 200);
    assert.equal((await w.request('DELETE', '/api/users/1', undefined, withCookie('x-admin-two'))).status, 404);
  });
  test('deletes an ordinary user', async () => {
    assert.equal((await w.request('DELETE', '/api/users/2', undefined, withCookie('x-admin-two'))).status, 200);
  });
});
