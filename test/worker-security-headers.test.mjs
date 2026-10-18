// Security headers (middleware at the top of src/index.ts): present on HTML pages and JSON
// routes, a per-request nonce CSP on HTML only, and authenticated JSON cached as `private`.

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startWorker } from './worker.mjs';

let w;
before(async () => { w = await startWorker(); });
after(() => w?.dispose());

function assertBaseline(h) {
  assert.equal(h.get('x-content-type-options'), 'nosniff');
  assert.equal(h.get('x-frame-options'), 'DENY');
  assert.equal(h.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(h.get('permissions-policy'), /camera=\(\)/);
}

describe('security headers', () => {
  test('HTML pages carry a nonce CSP and every script tag uses the nonce', async () => {
    for (const p of ['/', '/analytics', '/login']) {
      const r = await w.request('GET', p);
      assert.equal(r.status, 200, p);
      assertBaseline(r.headers);
      const csp = r.headers.get('content-security-policy');
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
      assert.ok(nonce, p);
      const tags = [...r.body.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
      for (const tag of tags) assert.ok(tag.includes(`nonce="${nonce}"`), `${p}: ${tag}`);
      if (p !== '/login') assert.ok(tags.length > 5);
    }
  });
  test('the nonce differs per request', async () => {
    const n = async () => /nonce-([^']+)'/.exec((await w.request('GET', '/analytics')).headers.get('content-security-policy'))[1];
    assert.notEqual(await n(), await n());
  });
  test('HSTS only over https (the test requests are http)', async () => {
    assert.equal((await w.request('GET', '/')).headers.get('strict-transport-security'), null);
  });
  test('JSON routes carry the baseline headers but no CSP; authenticated JSON is private', async () => {
    await w.run("INSERT INTO trackers (id, name, type, source_url) VALUES (1, 'One', 'spot', 'https://example.com/1')");
    const r = await w.request('GET', '/api/flights');
    assert.equal(r.status, 200);
    assertBaseline(r.headers);
    assert.equal(r.headers.get('content-security-policy'), null);
    assert.match(r.headers.get('cache-control'), /^private, max-age=\d+/);
  });
  test('error and redirect responses are covered too', async () => {
    const r = await w.request('GET', '/', undefined, { as: null });
    assert.equal(r.status, 302);
    assertBaseline(r.headers);
  });
});
