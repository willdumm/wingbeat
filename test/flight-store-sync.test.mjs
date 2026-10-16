// The flight store's refresh (flightStore.refresh() → _fsFetchMerge() in flight-store.ts):
// merging a corrections response into the cached copy, dropping one that another tab's
// save overtook, the cursor the flight form saves with (historyId()), and queueing a
// refresh asked for while one is in flight.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadEngine, plain } from './harness.mjs';

const STORAGE_KEY = 'ft_flights_v2';

// A fetch stub whose requests wait until the test answers them: calls[i].respond(body).
function deferredFetch() {
  const calls = [];
  const fetch = (url) => new Promise(resolve => {
    calls.push({ url, respond: (body) => resolve({ ok: true, status: 200, json: async () => body }) });
  });
  return { calls, fetch };
}

// A tracker's GET /api/flights/complete?since= response with nothing new.
const noFlights = { flights: [], last_modified_at: 0, last_polled: null, live_label: null, geocode_pending: false };

// A flight_corrections row (a tracked flight's).
const entry = (id, fst, fields = {}) => ({
  id, tracker_id: 1, flight_start_time: fst, start_time: null, end_time: null, origin_label: null,
  destination_label: null, remark: null, part91: 0, unpaid: 0, excluded: 0, pilot_id: null, aircraft_tail: null, ...fields,
});

const cached = (entries, entriesLastHistoryId) =>
  JSON.stringify({ last_modified_at_by_tracker: {}, flights: [], entries, entries_last_history_id: entriesLastHistoryId });

/** An engine whose store starts from the cached copy (entries, cursor). */
function storeWith(entries, cursor) {
  const { calls, fetch } = deferredFetch();
  const engine = loadEngine({ fetch });
  engine.storage.set(STORAGE_KEY, cached(entries, cursor));
  engine.flightStore.init();
  const mem = () => plain(vm.runInContext('_mem', engine.context));
  const saved = () => JSON.parse(engine.storage.get(STORAGE_KEY));
  return { engine, calls, mem, saved };
}

// Lets the store's awaits run (the fetch stub's json(), Promise.all, then the merge).
const settle = () => new Promise(resolve => setImmediate(resolve));

const isCorrections = (c) => c.url.startsWith('/api/flight-corrections');
const sinceOf = (c) => Number(new URL(c.url, 'http://x').searchParams.get('since'));

describe('flightStore.refresh: corrections', () => {
  test('a delta is merged and advances the cursor', async () => {
    const { engine, calls, mem, saved } = storeWith([entry(1, 100, { remark: 'A' })], 5);
    const done = engine.flightStore.refresh([1]);
    await settle();
    const corr = calls.find(isCorrections);
    assert.equal(sinceOf(corr), 5);
    calls.find(c => !isCorrections(c)).respond(noFlights);
    corr.respond({ entries: [entry(2, 200, { part91: 1 })], deleted: ['1/100'], last_history_id: 9 });
    const result = await done;
    assert.equal(result.changed, true);
    assert.deepEqual(mem().entries.map(e => e.id), [2]);
    assert.equal(mem().entries_last_history_id, 9);
    assert.equal(saved().entries_last_history_id, 9);
  });

  test("a delta is dropped when another tab's save moved the cursor during the fetch", async () => {
    const { engine, calls, mem } = storeWith([entry(1, 100, { remark: 'A' })], 5);
    const done = engine.flightStore.refresh([1]);
    await settle();
    // Another tab saved a newer copy (cursor 8) while this fetch (since 5) was out: the
    // storage listener reloads it.
    const other = cached([entry(1, 100, { remark: 'B' }), entry(3, 300)], 8);
    engine.storage.set(STORAGE_KEY, other);
    engine.dispatch('storage', { key: STORAGE_KEY });
    calls.find(c => !isCorrections(c)).respond(noFlights);
    calls.find(isCorrections).respond({ entries: [entry(1, 100, { remark: 'stale' })], deleted: ['1/300'], last_history_id: 6 });
    await done;
    assert.deepEqual(mem().entries.map(e => [e.id, e.remark]), [[1, 'B'], [3, null]]);
    assert.equal(mem().entries_last_history_id, 8);

    // The next refresh continues from the other tab's cursor.
    const again = engine.flightStore.refresh([1]);
    await settle();
    assert.equal(sinceOf(calls.filter(isCorrections)[1]), 8);
    for (const c of calls.slice(2)) c.respond(isCorrections(c) ? { entries: [], deleted: [], last_history_id: 8 } : noFlights);
    await again;
  });

  test('a full response replaces the cached rows, even with an older cursor', async () => {
    const { engine, calls, mem, saved } = storeWith([entry(1, 100), entry(2, 200)], 50);
    const done = engine.flightStore.refresh([1]);
    await settle();
    calls.find(c => !isCorrections(c)).respond(noFlights);
    // A recreated database: its history ids restart.
    calls.find(isCorrections).respond({ entries: [entry(7, 700, { excluded: 1 })], deleted: [], last_history_id: 3, full: true });
    const result = await done;
    assert.equal(result.changed, true);
    assert.deepEqual(mem().entries, [entry(7, 700, { excluded: 1 })]);
    assert.equal(mem().entries_last_history_id, 3);
    assert.deepEqual(saved().entries.map(e => e.id), [7]);
  });

  test("historyId() is the cursor; one moved by another entity's change is saved without notifying", async () => {
    const { engine, calls, saved } = storeWith([entry(1, 100)], 5);
    assert.equal(engine.flightStore.historyId(), 5);
    let notified = 0;
    engine.flightStore.onChange(() => notified++);
    const done = engine.flightStore.refresh([1]);
    await settle();
    calls.find(c => !isCorrections(c)).respond(noFlights);
    // A duty day was changed: the newest history id moved, no correction did.
    calls.find(isCorrections).respond({ entries: [], deleted: [], last_history_id: 12 });
    const result = await done;
    assert.equal(result.changed, false);
    assert.equal(notified, 0);
    assert.equal(engine.flightStore.historyId(), 12);
    assert.equal(saved().entries_last_history_id, 12);
  });

  test('a failed corrections fetch keeps the cached copy', async () => {
    const engine = loadEngine({
      fetch: async (url) => url.startsWith('/api/flight-corrections')
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => noFlights },
    });
    engine.storage.set(STORAGE_KEY, cached([entry(1, 100)], 5));
    engine.flightStore.init();
    const result = await engine.flightStore.refresh([1]);
    assert.equal(result.changed, false);
    const mem = plain(vm.runInContext('_mem', engine.context));
    assert.deepEqual([mem.entries.map(e => e.id), mem.entries_last_history_id], [[1], 5]);
  });
});

describe('flightStore.refresh: overlapping calls', () => {
  test('a refresh asked for during one runs once more afterwards, shared by every caller meanwhile', async () => {
    const { engine, calls } = storeWith([], 5);
    const store = engine.flightStore;
    const rounds = () => calls.filter(isCorrections).length;
    const answer = (from) => {
      for (const c of calls.slice(from)) c.respond(isCorrections(c) ? { entries: [], deleted: [], last_history_id: 5 } : noFlights);
    };

    const first = store.refresh([1]);
    await settle();
    assert.equal(rounds(), 1);
    const second = store.refresh();
    const third = store.refresh([1]);
    await settle();
    assert.equal(rounds(), 1, 'nothing more fetched while the first is in flight');

    answer(0);
    const firstResult = await first;
    await settle();
    assert.equal(rounds(), 2, 'exactly one follow-up');
    const issued = calls.length;
    answer(2);
    const [secondResult, thirdResult] = await Promise.all([second, third]);
    assert.equal(secondResult, thirdResult, 'the callers share the follow-up');
    assert.notEqual(secondResult, firstResult);
    await settle();
    assert.equal(calls.length, issued, 'and nothing after it');

    // Once idle, a refresh starts afresh.
    const fourth = store.refresh();
    await settle();
    assert.equal(rounds(), 3);
    answer(issued);
    await fourth;
  });

  test('the follow-up still runs when the refresh in flight fails', async () => {
    const { engine, calls } = storeWith([], 5);
    const first = engine.flightStore.refresh([1]);
    await settle();
    const second = engine.flightStore.refresh();
    // A malformed flights response (no flights array) fails the whole refresh.
    calls.find(c => !isCorrections(c)).respond({});
    calls.find(isCorrections).respond({ entries: [], deleted: [], last_history_id: 5 });
    await assert.rejects(first);
    await settle();
    for (const c of calls.slice(2)) c.respond(isCorrections(c) ? { entries: [], deleted: [], last_history_id: 5 } : noFlights);
    const result = await second;
    assert.equal(result.changed, false);
    assert.equal(calls.filter(isCorrections).length, 2);
  });
});
