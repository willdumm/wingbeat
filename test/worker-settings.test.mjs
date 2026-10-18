// PATCH /api/settings validates what it stores, and the pages escape app_name wherever the
// Worker renders it (the <title> and the inline window.APP_SETTINGS script).

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker } from './worker.mjs';

let w;
before(async () => { w = await startWorker(); });
after(() => w?.dispose());

const patch = (body, as = 'admin') => w.request('PATCH', '/api/settings', body, { as });

describe('PATCH /api/settings validation', () => {
  test('app_name must be 1 to 60 characters once trimmed', async () => {
    assert.equal((await patch({ app_name: '' })).status, 400);
    assert.equal((await patch({ app_name: '   ' })).status, 400);
    assert.equal((await patch({ app_name: 'x'.repeat(61) })).status, 400);
    assert.equal((await patch({ app_name: '  Hawk Air  ' })).status, 200);
    assert.equal((await w.first("SELECT value FROM settings WHERE key = 'app_name'")).value, 'Hawk Air');
  });
  test('timezone must be an IANA zone', async () => {
    assert.equal((await patch({ timezone: 'Not/AZone' })).status, 400);
    assert.equal((await patch({ timezone: 'America/Denver' })).status, 200);
  });
  test('numbers must be numbers in range; bad JSON is a 400', async () => {
    assert.equal((await patch({ map_default_lat: 91 })).status, 400);
    assert.equal((await patch({ map_default_zoom: 'abc' })).status, 400);
    assert.equal((await patch({ gap_alert_minutes: -1 })).status, 400);
    assert.equal((await patch({ map_default_lat: 40.5, map_default_lng: -105, map_default_zoom: 8 })).status, 200);
    const r = await w.request('PATCH', '/api/settings', undefined, { as: 'admin', headers: { 'content-type': 'application/json' } });
    assert.equal(r.status, 400);
  });
  test('a viewer cannot change settings', async () => {
    assert.ok([401, 403].includes((await patch({ app_name: 'Nope' }, 'viewer')).status));
  });
});

describe('pages escape app_name', () => {
  const NAME = `</title></script><img src=x onerror=alert(1)> & "q" 'a'`;
  for (const pagePath of ['/', '/analytics']) {
    test(`GET ${pagePath}`, async () => {
      assert.equal((await patch({ app_name: NAME })).status, 200);
      const r = await w.request('GET', pagePath);
      assert.equal(r.status, 200);
      assert.ok(!r.body.includes('<img src=x'), 'raw tag in page');
      assert.ok(!r.body.includes('</title></script>'), 'raw closing tags in page');
      const m = /window\.APP_SETTINGS=(\{.*?\});<\/script>/.exec(r.body);
      assert.ok(m, 'APP_SETTINGS script present');
      assert.equal(JSON.parse(m[1]).appName, NAME);
    });
  }
});
