// Tracker feed URLs: admin-only source_url, derived mapshare_url, URL validation on
// create/update/test-feed, stored credentials bound to the feed's origin, https-only webhooks.

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker } from './worker.mjs';

let w;
before(async () => { w = await startWorker(); });
after(() => w?.dispose());

const FEED = 'https://share.garmin.com/Feed/Share/secretname';
const creds = (id) => w.first('SELECT credentials FROM trackers WHERE id = ?', id).then(r => r.credentials);

describe('source_url is admin-only', () => {
  before(async () => {
    await w.run("INSERT INTO trackers (id, name, type, source_url) VALUES (1, 'Cub', 'inreach', ?)", FEED);
    await w.run("INSERT INTO trackers (id, name, type, source_url) VALUES (2, 'Other', 'spot', 'https://example.org/feed?key=k')");
  });

  test('viewer: no source_url anywhere, derived mapshare_url present', async () => {
    for (const p of ['/api/trackers', '/api/bootstrap']) {
      const r = await w.request('GET', p, undefined, { as: 'viewer' });
      assert.equal(r.status, 200);
      const trackers = r.body.trackers;
      assert.equal(trackers.length, 2);
      for (const t of trackers) assert.ok(!('source_url' in t), `${p} leaks source_url`);
      assert.equal(trackers[0].mapshare_url, 'https://share.garmin.com/secretname');
      assert.equal(trackers[1].mapshare_url, null);
      assert.ok(!JSON.stringify(r.body).includes('secretname/'), 'no feed path');
      assert.ok(!JSON.stringify(r.body).includes('key=k'));
    }
  });

  test('admin still gets source_url and mapshare_url', async () => {
    for (const p of ['/api/trackers', '/api/bootstrap']) {
      const t = (await w.request('GET', p)).body.trackers[0];
      assert.equal(t.source_url, FEED);
      assert.equal(t.mapshare_url, 'https://share.garmin.com/secretname');
    }
  });
});

describe('source_url validation', () => {
  const bad = ['http://share.garmin.com/Feed/Share/x', 'https://u:p@share.garmin.com/x', 'https://127.0.0.1/x',
    'https://localhost/x', 'https://share.garmin.com:8443/x', 'https://localhost.localdomain.local/x', 'nope'];

  test('POST rejects bad URLs and inserts nothing', async () => {
    const before = (await w.first('SELECT COUNT(*) n FROM trackers')).n;
    for (const source_url of [...bad, 'https://localhost/own']) {
      const r = await w.request('POST', '/api/trackers', { name: 'X', type: 'inreach', source_url });
      assert.equal(r.status, 400, source_url);
      assert.match(r.body.error, /source_url/);
    }
    assert.equal((await w.first('SELECT COUNT(*) n FROM trackers')).n, before);
  });

  test('POST accepts a good URL and returns mapshare_url', async () => {
    const r = await w.request('POST', '/api/trackers', { name: 'New', type: 'inreach', source_url: 'https://share.garmin.com/Feed/Share/new' });
    assert.equal(r.status, 200);
    assert.equal(r.body.mapshare_url, 'https://share.garmin.com/new');
  });

  test('PUT rejects bad URLs and leaves the row alone', async () => {
    for (const source_url of bad) {
      const r = await w.request('PUT', '/api/trackers/1', { source_url });
      assert.equal(r.status, 400, source_url);
    }
    assert.equal((await w.first('SELECT source_url FROM trackers WHERE id = 1')).source_url, FEED);
  });

  test('test-feed rejects bad URLs with 400 before fetching', async () => {
    for (const source_url of bad) {
      const r = await w.request('POST', '/api/trackers/test-feed', { source_url });
      assert.equal(r.status, 400, source_url);
    }
  });

  test('viewers cannot use these routes', async () => {
    assert.equal((await w.request('POST', '/api/trackers/test-feed', { source_url: FEED }, { as: 'viewer' })).status, 403);
  });
});

describe('stored credentials are bound to the feed origin', () => {
  before(async () => {
    await w.run("INSERT INTO trackers (id, name, type, source_url, credentials) VALUES (10, 'Locked', 'inreach', ?, '{\"password\":\"pw\"}')", FEED);
  });
  const reset = () => w.run("UPDATE trackers SET source_url = ?, credentials = '{\"password\":\"pw\"}' WHERE id = 10", FEED);

  test('same-origin change keeps the credentials', async () => {
    await reset();
    const r = await w.request('PUT', '/api/trackers/10', { source_url: 'https://share.garmin.com/Feed/Share/renamed' });
    assert.equal(r.status, 200);
    assert.equal(r.body.credentials_cleared, undefined);
    assert.equal(await creds(10), '{"password":"pw"}');
  });

  test('origin change without a password clears them', async () => {
    await reset();
    const r = await w.request('PUT', '/api/trackers/10', { source_url: 'https://feeds.example.net/Feed/Share/x' });
    assert.equal(r.status, 200);
    assert.equal(r.body.credentials_cleared, true);
    assert.equal(await creds(10), null);
  });

  test('origin change with a new password stores the new one', async () => {
    await reset();
    const r = await w.request('PUT', '/api/trackers/10', { source_url: 'https://feeds.example.net/x', credentials: { password: 'new' } });
    assert.equal(r.status, 200);
    assert.equal(await creds(10), '{"password":"new"}');
  });

  test('a name-only edit keeps them', async () => {
    await reset();
    await w.request('PUT', '/api/trackers/10', { name: 'Renamed' });
    assert.equal(await creds(10), '{"password":"pw"}');
  });
});

describe('webhook URLs', () => {
  test('POST requires https', async () => {
    for (const url of ['http://hooks.example.net/x', 'https://127.0.0.1/x', 'https://u:p@hooks.example.net/x', 'nope']) {
      const r = await w.request('POST', '/api/webhooks', { type: 'webhook', url });
      assert.equal(r.status, 400, url);
    }
    const ok = await w.request('POST', '/api/webhooks', { type: 'webhook', url: 'https://hooks.example.net/x' });
    assert.equal(ok.status, 201);
  });

  test('PUT requires https for a changed url, but an untouched legacy http hook can still be edited', async () => {
    await w.run("INSERT INTO webhooks (id, type, url, events) VALUES (50, 'webhook', 'http://legacy.example.net/x', '[\"takeoff\"]')");
    assert.equal((await w.request('PUT', '/api/webhooks/50', { url: 'http://still-bad.example.net/' })).status, 400);
    assert.equal((await w.request('PUT', '/api/webhooks/50', { label: 'Renamed' })).status, 200);
    assert.equal((await w.request('PUT', '/api/webhooks/50', { url: 'https://good.example.net/' })).status, 200);
  });
});
