// The shared outbound-URL validator and safeFetch (src/safe-fetch.ts), with global fetch stubbed.

import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = await build({
  entryPoints: [path.join(ROOT, 'src/safe-fetch.ts')], bundle: true, platform: 'node', format: 'esm', write: false,
});
const { checkPublicHttpsUrl, safeFetch, SafeFetchError } = await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

describe('checkPublicHttpsUrl', () => {
  test('accepts a public https URL', () => {
    const r = checkPublicHttpsUrl('https://share.garmin.com/Feed/Share/x');
    assert.equal(r.ok, true);
    assert.equal(r.url.hostname, 'share.garmin.com');
    assert.equal(checkPublicHttpsUrl('https://share.garmin.com:443/Feed/Share/x').ok, true);
  });
  const bad = {
    'http:': 'http://share.garmin.com/Feed/Share/x',
    'ftp:': 'ftp://share.garmin.com/x',
    'javascript:': 'javascript:alert(1)',
    'userinfo': 'https://user:pass@share.garmin.com/x',
    'username only': 'https://user@share.garmin.com/x',
    'IPv4': 'https://203.0.113.5/x',
    'IPv4 hex': 'https://0x7f.1/x',
    'IPv4 decimal': 'https://2130706433/x',
    'IPv6': 'https://[2001:db8::1]/x',
    'IPv6 loopback': 'https://[::1]/x',
    'localhost': 'https://localhost/x',
    'sub.localhost': 'https://a.localhost/x',
    'single label': 'https://intranet/x',
    '.internal': 'https://svc.internal/x',
    'non-443 port': 'https://share.garmin.com:8443/x',
    'garbage': 'not a url',
    'empty': '',
  };
  for (const [name, url] of Object.entries(bad)) {
    test(`rejects ${name}`, () => assert.equal(checkPublicHttpsUrl(url).ok, false, url));
  }
  test('rejects non-strings', () => assert.equal(checkPublicHttpsUrl(undefined).ok, false));
  test("rejects the worker's own host (case-insensitive, port ignored)", () => {
    assert.equal(checkPublicHttpsUrl('https://app.example.org/x', { ownHost: 'app.example.org' }).ok, false);
    assert.equal(checkPublicHttpsUrl('https://APP.example.org/x', { ownHost: 'app.example.org:8787' }).ok, false);
    assert.equal(checkPublicHttpsUrl('https://other.example.org/x', { ownHost: 'app.example.org' }).ok, true);
  });
});

describe('safeFetch', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });
  const opts = { timeoutMs: 1000, maxBytes: 100 };
  const redirect = (loc, status = 302) => new Response(null, { status, headers: { Location: loc } });

  test('returns the body and requests with redirect: manual', async () => {
    let init;
    globalThis.fetch = async (_u, i) => { init = i; return new Response('hello'); };
    const r = await safeFetch('https://a.example.net/x', opts);
    assert.deepEqual([r.ok, r.status, r.text], [true, 200, 'hello']);
    assert.equal(init.redirect, 'manual');
  });

  test('returns a non-2xx status without a body', async () => {
    globalThis.fetch = async () => new Response('nope', { status: 404, statusText: 'Not Found' });
    const r = await safeFetch('https://a.example.net/x', opts);
    assert.deepEqual([r.ok, r.status, r.text], [false, 404, '']);
  });

  test('rejects a bad URL without fetching', async () => {
    let called = false;
    globalThis.fetch = async () => { called = true; return new Response(''); };
    await assert.rejects(safeFetch('http://a.example.net/x', opts), SafeFetchError);
    assert.equal(called, false);
  });

  test('follows redirects, re-validating each hop and dropping Authorization across origins', async () => {
    const seen = [];
    globalThis.fetch = async (u, i) => {
      seen.push([u, i.headers.Authorization]);
      if (u === 'https://a.example.net/x') return redirect('/y');           // same origin
      if (u === 'https://a.example.net/y') return redirect('https://b.example.net/z');
      return new Response('done');
    };
    const r = await safeFetch('https://a.example.net/x', { ...opts, headers: { Authorization: 'Basic abc' } });
    assert.equal(r.text, 'done');
    assert.deepEqual(seen, [
      ['https://a.example.net/x', 'Basic abc'],
      ['https://a.example.net/y', 'Basic abc'],
      ['https://b.example.net/z', undefined],
    ]);
  });

  test('refuses a redirect to a disallowed URL', async () => {
    for (const loc of ['http://b.example.net/', 'https://127.0.0.1/', 'https://localhost/', 'https://b.example.net:8443/']) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return calls === 1 ? redirect(loc) : new Response('leaked'); };
      await assert.rejects(safeFetch('https://a.example.net/x', opts), SafeFetchError, loc);
      assert.equal(calls, 1);
    }
  });

  test('refuses a redirect to the own host', async () => {
    globalThis.fetch = async () => redirect('https://app.example.net/');
    await assert.rejects(safeFetch('https://a.example.net/x', { ...opts, ownHost: 'app.example.net' }), SafeFetchError);
  });

  test('gives up after maxRedirects', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return redirect('https://a.example.net/loop'); };
    await assert.rejects(safeFetch('https://a.example.net/x', opts), /Too many redirects/);
    assert.equal(calls, 4); // the original request plus 3 hops
  });

  test('enforces the size cap', async () => {
    globalThis.fetch = async () => new Response('x'.repeat(101));
    await assert.rejects(safeFetch('https://a.example.net/x', opts), /larger than/);
    globalThis.fetch = async () => new Response('x'.repeat(100));
    assert.equal((await safeFetch('https://a.example.net/x', opts)).text.length, 100);
  });

  test('times out on a hung request', async () => {
    globalThis.fetch = (_u, i) => new Promise((_res, rej) => i.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    const keepAlive = setInterval(() => {}, 10);
    try {
      await assert.rejects(safeFetch('https://a.example.net/x', { ...opts, timeoutMs: 30 }), /Timed out/);
    } finally { clearInterval(keepAlive); }
  });

  test('times out on a body that stalls', async () => {
    globalThis.fetch = async (_u, i) => new Response(new ReadableStream({
      start(c) { c.enqueue(new TextEncoder().encode('hi')); i.signal.addEventListener('abort', () => c.error(new Error('aborted'))); },
    }));
    // AbortSignal.timeout's timer is unref'd in node, so keep the loop alive meanwhile.
    const keepAlive = setInterval(() => {}, 10);
    try {
      await assert.rejects(safeFetch('https://a.example.net/x', { ...opts, timeoutMs: 30 }), /Timed out/);
    } finally { clearInterval(keepAlive); }
  });
});
