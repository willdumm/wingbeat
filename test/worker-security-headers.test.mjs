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
  test('the dashboard and analytics pages load the core bundle in a script with the nonce', async () => {
    for (const p of ['/', '/analytics']) {
      const r = await w.request('GET', p);
      const nonce = /script-src 'nonce-([^']+)'/.exec(r.headers.get('content-security-policy'))[1];
      const scripts = [...r.body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
      const core = scripts.filter(m => /\bsrc="\/core-bundle\.\w+\.js"/.test(m[1]));
      assert.equal(core.length, 1, p);
      assert.ok(core[0][1].includes(`nonce="${nonce}"`), p);
      // Just ahead of the page script (the last one), which calls the globals it defines.
      assert.equal(scripts.indexOf(core[0]), scripts.length - 2, p);
      assert.ok(!r.body.includes('@wingbeat/core browser bundle'), p + ': not inlined as well');
    }
  });
  test('the core bundle is served signed out, as JavaScript, cached for good, at a path only it has', async () => {
    const page = await w.request('GET', '/');
    const src = /<script\b[^>]*\bsrc="(\/core-bundle\.\w+\.js)"/.exec(page.body)[1];
    const r = await w.request('GET', src, undefined, { as: null });
    assert.equal(r.status, 200);
    assertBaseline(r.headers);
    assert.match(r.headers.get('content-type'), /^text\/javascript/);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.ok(r.body.startsWith('/* @wingbeat/core browser bundle'));
    // Another version's path is no route: an immutable response there would pin the wrong code.
    const other = await w.request('GET', '/core-bundle.0.js', undefined, { as: null });
    assert.notEqual(other.status, 200);
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

describe('search engines are kept out', () => {
  test('robots.txt disallows everything and is served signed out', async () => {
    const r = await w.request('GET', '/robots.txt', undefined, { as: null });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/plain/);
    assert.equal(r.body, 'User-agent: *\nDisallow: /\n');
  });
  test('every response carries X-Robots-Tag, the login page and the auth redirect included', async () => {
    for (const [path, as, status] of [['/login', null, 200], ['/', null, 302], ['/', 'admin', 200], ['/robots.txt', null, 200]]) {
      const r = await w.request('GET', path, undefined, { as });
      assert.equal(r.status, status, `${path} as ${as}`);
      assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow', `${path} as ${as}`);
    }
  });
  test('the login page also has a robots meta tag', async () => {
    const r = await w.request('GET', '/login', undefined, { as: null });
    assert.match(r.body, /<meta name="robots" content="noindex, nofollow" \/>/);
  });
});
