// @wingbeat/core/flight-store with its storage and API client passed in (the web's own
// wiring, localStorage and fetch, is tested in flight-store-sync.test.mjs), and
// @wingbeat/core/api/client: the cached blob's key and shape, async storage (the app's),
// and what a response that doesn't match its schema does.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore } from './core.mjs';

const { createFlightStore, FLIGHT_STORE_KEY } = await importCore('flight-store');
const { createApiClient, ApiShapeError, ApiHttpError, ApiTimeoutError, DEFAULT_TIMEOUT_MS } = await importCore('api/client');
const { FlightCorrectionsResponse } = await importCore('api/flights');
const { OkResponse } = await importCore('api/corrections');

const flight = (id, start, extra = {}) => ({
  id, tracker_id: 1, start_time: start, end_time: start + 600, modified_at: start, aircraft_tail: null,
  pilot_id: null, pilot_name: null, origin_label: null, destination_label: null,
  start_lat: null, start_lon: null, end_lat: null, end_lon: null, points: [{ t: start, lat: 58, lon: -154, v: 10, e: null, c: null }], ...extra,
});
const complete = (flights) => ({ last_polled: 5, live_label: null, geocode_pending: false, flights, last_modified_at: flights.at(-1)?.modified_at ?? null });
const noCorrections = { entries: [], deleted: [], last_history_id: 3 };

/** A client answering each path from routes (path prefix → body), recording the paths. */
function stubClient(routes) {
  const paths = [];
  return {
    paths,
    async get(path) {
      paths.push(path);
      const hit = Object.entries(routes).find(([prefix]) => path.startsWith(prefix));
      return structuredClone(hit[1]);
    },
  };
}

describe('createFlightStore', () => {
  test('saves the web’s blob, under ft_flights_v2, in exactly its shape', async () => {
    const saved = new Map();
    const store = createFlightStore({
      storage: { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) },
      client: stubClient({ '/api/flights/complete': complete([flight(1, 1000)]), '/api/flight-corrections': noCorrections }),
      flightThresholdKmh: 37,
    });
    assert.equal(FLIGHT_STORE_KEY, 'ft_flights_v2');
    store.init();
    await store.refresh([1]);
    const blob = JSON.parse(saved.get('ft_flights_v2'));
    assert.deepEqual(Object.keys(blob).sort(), ['entries', 'entries_last_history_id', 'flights', 'last_modified_at_by_tracker']);
    assert.deepEqual(blob.last_modified_at_by_tracker, { 1: 1000 });
    assert.equal(blob.entries_last_history_id, 3);
    assert.deepEqual(blob.flights.map(f => f.id), [1]);
  });

  test('sync storage loads within init(), so the store is readable right after', () => {
    const blob = { last_modified_at_by_tracker: { 1: 1000 }, flights: [flight(1, 1000)], entries: [], entries_last_history_id: 7 };
    const store = createFlightStore({
      storage: { getItem: () => JSON.stringify(blob), setItem() {} },
      client: stubClient({}), flightThresholdKmh: 37,
    });
    assert.equal(store.init(), undefined);
    assert.equal(store.historyId(), 7);
    assert.deepEqual(store.getAll().map(f => f.id), [1]);
  });

  test('async storage (the app’s): init() returns a promise, refresh continues from its cursors', async () => {
    const blob = { last_modified_at_by_tracker: { 1: 1000 }, flights: [flight(1, 1000)], entries: [], entries_last_history_id: 7 };
    let written = null;
    const client = stubClient({ '/api/flights/complete': complete([]), '/api/flight-corrections': { ...noCorrections, last_history_id: 9 } });
    const store = createFlightStore({
      storage: { getItem: async () => JSON.stringify(blob), setItem: async (k, v) => { written = [k, v]; } },
      client, flightThresholdKmh: 37,
    });
    await store.init();
    assert.equal(store.historyId(), 7);
    await store.refresh([1]);
    assert.deepEqual(client.paths.sort(), ['/api/flight-corrections?since=7', '/api/flights/complete?tracker=1&since=1000']);
    assert.equal(JSON.parse(written[1]).entries_last_history_id, 9);
  });

  test('a repaired old blob (no cursor) and a broken one', () => {
    const old = createFlightStore({
      storage: { getItem: () => JSON.stringify({ last_modified_at_by_tracker: {}, flights: [], entries_version: 4 }), setItem() {} },
      client: stubClient({}), flightThresholdKmh: 37,
    });
    old.init();
    assert.deepEqual(old.snapshot(), { last_modified_at_by_tracker: {}, flights: [], entries: [], entries_last_history_id: 0 });
    const broken = createFlightStore({ storage: { getItem: () => '{nope', setItem() {} }, client: stubClient({}), flightThresholdKmh: 37 });
    broken.init();
    assert.equal(broken.historyId(), 0);
  });

  test('getCompleted leaves out a tracker’s newest flight while its last point is at flight speed', async () => {
    const store = createFlightStore({
      storage: { getItem: () => null, setItem() {} },
      client: stubClient({
        '/api/flights/complete': complete([flight(1, 1000), flight(2, 5000, { points: [{ t: 5000, lat: 58, lon: -154, v: 120, e: null, c: null }] })]),
        '/api/flight-corrections': noCorrections,
      }),
      flightThresholdKmh: 37,
    });
    store.init();
    await store.refresh([1]);
    assert.deepEqual(store.getAll().map(f => f.id), [1, 2]);
    assert.deepEqual(store.getCompleted().map(f => f.id), [1]);
  });
});

describe('createFlightStore: a damaged or stale cached copy', () => {
  const stored = (raw, routes = { '/api/flights/complete': complete([]), '/api/flight-corrections': noCorrections }) => {
    const client = stubClient(routes);
    const store = createFlightStore({ storage: { getItem: () => raw, setItem() {} }, client, flightThresholdKmh: 50 });
    store.init();
    return { store, client };
  };
  const good = (extra) => JSON.stringify({ last_modified_at_by_tracker: { 1: 700 }, flights: [flight(1, 1000)], entries: [], entries_last_history_id: 9, ...extra });

  for (const raw of ['null', '[]', '5', '"x"', '{}', '{"flights":null}', 'not json']) {
    test('reads start empty from ' + raw, async () => {
      const { store, client } = stored(raw);
      assert.deepEqual(store.getAll(), []);
      assert.deepEqual(store.getRaw(), []);
      await store.refresh([1]);
      assert.deepEqual(client.paths.sort(), ['/api/flight-corrections?since=0', '/api/flights/complete?tracker=1&since=0']);
    });
  }

  test('a blob with no flights gives up its cursors, so the next refresh fetches them all', async () => {
    const { store, client } = stored(good({ flights: undefined }));
    assert.deepEqual(store.getAll(), []);
    await store.refresh([1]);
    assert.ok(client.paths.includes('/api/flights/complete?tracker=1&since=0'));
    assert.ok(client.paths.includes('/api/flight-corrections?since=9'), 'the corrections keep theirs');
  });

  test('a blob with no corrections gives up their cursor, and keeps the flights', async () => {
    const { store, client } = stored(good({ entries: undefined }));
    assert.equal(store.getAll().length, 1);
    await store.refresh([1]);
    assert.ok(client.paths.includes('/api/flight-corrections?since=0'));
    assert.ok(client.paths.includes('/api/flights/complete?tracker=1&since=700'), 'the flights keep theirs');
  });

  test('a blob with no flight cursors keeps its flights and fetches them again', async () => {
    const { store, client } = stored(good({ last_modified_at_by_tracker: undefined }));
    assert.equal(store.getAll().length, 1);
    await store.refresh([1]);
    assert.ok(client.paths.includes('/api/flights/complete?tracker=1&since=0'));
  });

  test('a refresh that starts before an async load resolves waits for it, and starts from its cursors', async () => {
    let resolveLoad;
    const client = stubClient({ '/api/flights/complete': complete([flight(2, 3000)]), '/api/flight-corrections': noCorrections });
    const store = createFlightStore({
      storage: { getItem: () => new Promise(r => { resolveLoad = r; }), setItem: async () => {} }, client, flightThresholdKmh: 50,
    });
    const init = store.init();
    const refreshed = store.refresh([1]);
    await new Promise(r => setTimeout(r, 0));
    assert.deepEqual(client.paths, [], 'nothing fetched before the load');
    resolveLoad(good());
    await init;
    await refreshed;
    assert.ok(client.paths.includes('/api/flights/complete?tracker=1&since=700'));
    assert.deepEqual(store.getRaw().map(f => f.id), [1, 2], 'the stored flight and the new one');
  });

  test('a response from before another tab’s newer copy doesn’t replace its records', async () => {
    let saved = good({ flights: [flight(1, 1000, { aircraft_tail: 'OLD' })] });
    let reload;
    let answer;
    const client = {
      get: (path) => path.startsWith('/api/flights/complete')
        ? new Promise(r => { answer = () => r(structuredClone(complete([flight(1, 1000, { aircraft_tail: 'STALE', modified_at: 800 })]))); })
        : Promise.resolve(structuredClone(noCorrections)),
    };
    const store = createFlightStore({
      storage: { getItem: () => saved, setItem() {} }, client, flightThresholdKmh: 50,
      watchExternalChanges: (cb) => { reload = cb; },
    });
    store.init();
    const refreshed = store.refresh([1]);
    await new Promise(r => setTimeout(r, 0));
    saved = good({ last_modified_at_by_tracker: { 1: 900 }, flights: [flight(1, 1000, { aircraft_tail: 'NEWER', modified_at: 900 })] });
    reload();
    answer();
    await refreshed;
    assert.equal(store.getRaw()[0].aircraft_tail, 'NEWER');
    assert.equal(store.snapshot().last_modified_at_by_tracker[1], 900);
  });
});

describe('createApiClient: timeouts', () => {
  const never = () => new Promise(() => {});
  const client = (fetch, timeoutMs = 5) => createApiClient({ fetch: () => fetch, timeoutMs });

  test('a fetch that never settles rejects with ApiTimeoutError, and is aborted', async () => {
    let signal;
    const c = client((_, init) => { signal = init.signal; return never(); });
    await assert.rejects(c.get('/api/x', OkResponse), (e) => e instanceof ApiTimeoutError && e.path === '/api/x' && e.timeoutMs === 5);
    assert.equal(signal.aborted, true);
    await assert.rejects(c.write('POST', '/api/x', {}, OkResponse), ApiTimeoutError);
  });

  test('so does a response whose body never arrives', async () => {
    const c = client(async () => ({ ok: true, status: 200, json: never }));
    await assert.rejects(c.get('/api/x', OkResponse), ApiTimeoutError);
  });

  test('an answer in time is unaffected, and leaves no timer running', async () => {
    const c = client(async (_, init) => { assert.equal(init.signal.aborted, false); return new Response('{"ok":true}'); }, 60_000);
    assert.deepEqual(await c.get('/api/x', OkResponse), { ok: true });
    await assert.rejects(client(async () => new Response('{"error":"no"}', { status: 400 }), 60_000).get('/api/x', OkResponse), ApiHttpError);
  });

  test('the default is long enough for a slow full sync', () => assert.equal(DEFAULT_TIMEOUT_MS, 120_000));

  test('a hung request fails its refresh, and the next one runs', async () => {
    let calls = 0;
    const fetch = async (url) => {
      if (calls++ < 2) return never();   // the first refresh's flights and corrections
      return new Response(JSON.stringify(url.includes('corrections') ? noCorrections : complete([flight(1, 1000)])));
    };
    const store = createFlightStore({ storage: { getItem: () => null, setItem() {} }, client: client(fetch), flightThresholdKmh: 50 });
    store.init();
    const first = store.refresh([1]);
    const queued = store.refresh([1]);
    await assert.rejects(first, ApiTimeoutError);
    assert.equal((await queued).changed, true);
    assert.equal(store.getRaw().length, 1);
  });
});

describe('createApiClient', () => {
  const respond = (body, status = 200) => async () => ({ ok: status < 300, status, json: async () => body });
  const good = { entries: [], deleted: [], last_history_id: 1 };
  const bad = { entries: [{ id: 'x' }], deleted: [], last_history_id: 1 };

  test('a matching response is returned, unknown keys kept', async () => {
    const client = createApiClient({ fetch: () => respond({ ...good, extra: 1 }) });
    assert.deepEqual(await client.get('/api/flight-corrections', FlightCorrectionsResponse), { ...good, extra: 1 });
  });

  test('strict (the app): a mismatch is an ApiShapeError', async () => {
    const client = createApiClient({ fetch: () => respond(bad) });
    await assert.rejects(client.get('/api/flight-corrections', FlightCorrectionsResponse), ApiShapeError);
  });

  test('warn (the web): a mismatch is logged and the data used anyway', async () => {
    const warned = [];
    const client = createApiClient({ fetch: () => respond(bad), mismatch: 'warn', warn: (m) => warned.push(m) });
    assert.deepEqual(await client.get('/api/flight-corrections', FlightCorrectionsResponse), bad);
    assert.deepEqual(warned, ['[wingbeat api] unexpected response from /api/flight-corrections']);
  });

  test('an HTTP error, and the bearer token the app sends', async () => {
    await assert.rejects(createApiClient({ fetch: () => respond({}, 500) }).get('/x', FlightCorrectionsResponse),
      (e) => e instanceof ApiHttpError && e.message === 'HTTP 500');
    let seen;
    const client = createApiClient({
      baseUrl: 'https://op.example', auth: { kind: 'bearer', token: 't0k' },
      fetch: () => async (url, init) => { seen = [url, init.headers.Authorization]; return { ok: true, status: 200, json: async () => good }; },
    });
    await client.get('/api/flight-corrections', FlightCorrectionsResponse);
    assert.deepEqual(seen, ['https://op.example/api/flight-corrections', 'Bearer t0k']);
  });

  test('a write sends its body as JSON (none for a delete), with the bearer token', async () => {
    const seen = [];
    const fetch = async (url, { signal, ...init }) => { seen.push([url, init]); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
    const client = createApiClient({ auth: { kind: 'bearer', token: 't0k' }, fetch: () => fetch });
    assert.deepEqual(await client.write('PUT', '/api/duty-methods', { method: 'b' }, OkResponse), { ok: true });
    await client.write('DELETE', '/api/duty-methods/2026-01-01', undefined, OkResponse);
    assert.deepEqual(seen, [
      ['/api/duty-methods', { method: 'PUT', headers: { Authorization: 'Bearer t0k', 'Content-Type': 'application/json' }, body: '{"method":"b"}' }],
      ['/api/duty-methods/2026-01-01', { method: 'DELETE', headers: { Authorization: 'Bearer t0k' }, body: undefined }],
    ]);
  });

  test('a refused write throws with the server’s message, and a 409 with its conflict', async () => {
    const conflict = { id: 9, at: 100, user_id: 2, user_name: 'Bea' };
    const client = (body, status) => createApiClient({ fetch: () => respond(body, status) });
    await assert.rejects(client({ error: 'Pilot not found' }, 404).write('PUT', '/x', {}, OkResponse),
      (e) => e instanceof ApiHttpError && e.message === 'Pilot not found' && e.status === 404 && e.conflict === undefined);
    await assert.rejects(client({ error: 'Changed by Bea', conflict }, 409).write('PUT', '/x', {}, OkResponse),
      (e) => e.message === 'Changed by Bea' && e.conflict === conflict);
    // No JSON error body: the status.
    const noJson = createApiClient({ fetch: () => async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } }) });
    await assert.rejects(noJson.write('POST', '/x', {}, OkResponse), (e) => e.message === 'HTTP 502');
  });
});
