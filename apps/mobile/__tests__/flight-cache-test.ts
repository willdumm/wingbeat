import type { ApiClient } from '@wingbeat/core/api/client';
import { accountFlightStore, flightCacheKey, staleFlightCacheKeys } from '@/lib/flight-cache';

const A = 'a.wingbeat.dummthings.dev';
const B = 'b.wingbeat.dummthings.dev';

/** An async key-value store in memory, like expo-sqlite/kv-store. */
function memory() {
  const map = new Map<string, string>();
  return { map, getItem: async (k: string) => map.get(k) ?? null, setItem: async (k: string, v: string) => { map.set(k, v); } };
}

const flight = (id: number, trackerId: number, start: number) => ({
  id, tracker_id: trackerId, start_time: start, end_time: start + 600, modified_at: start, aircraft_tail: null,
  pilot_id: null, pilot_name: null, origin_label: null, destination_label: null,
  start_lat: null, start_lon: null, end_lat: null, end_lon: null,
  points: [{ t: start, lat: 58, lon: -154, v: 10, e: null, c: null }],
});

/** A client whose server has these flights for tracker 1. */
function client(flights: ReturnType<typeof flight>[]): ApiClient {
  return {
    get: async (path: string) => (path.startsWith('/api/flights/complete')
      ? { last_polled: 5, live_label: null, geocode_pending: false, flights, last_modified_at: flights.at(-1)?.modified_at ?? null }
      : { entries: [], deleted: [], last_history_id: 3 }) as never,
    write: async () => { throw new Error('read-only'); },
  };
}

test('one cached blob per host and user, read back by a new store', async () => {
  const kv = memory();
  const a = accountFlightStore(kv, client([flight(1, 1, 1000)]), A, 1);
  const b = accountFlightStore(kv, client([flight(2, 1, 2000)]), B, 1);
  await a.init();
  await b.init();
  await a.refresh([1]);
  await b.refresh([1]);
  expect([...kv.map.keys()].sort()).toEqual([flightCacheKey(A, 1), flightCacheKey(B, 1)]);

  const again = accountFlightStore(kv, client([]), A, 1);
  await again.init();
  expect(again.getAll().map((f) => f.id)).toEqual([1]);
});

test('stale keys: older formats and removed accounts, nothing that isn’t a flight cache', () => {
  const keys = [flightCacheKey(A, 1), flightCacheKey(A, 2), `flights.v0.${A}.1`, 'something-else'];
  expect(staleFlightCacheKeys(keys, [{ host: A, user: { id: 1 } }])).toEqual([flightCacheKey(A, 2), `flights.v0.${A}.1`]);
});
