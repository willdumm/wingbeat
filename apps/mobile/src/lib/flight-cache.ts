/**
 * Each account's flight store (docs/mobile-app-plan.md, "Data and sync"): core's
 * createFlightStore over an async key-value store (expo-sqlite/kv-store in the app), one
 * cached blob per host and user. The format version is in the key: an update that changes
 * the format raises FLIGHT_CACHE_FORMAT, and the old blobs are dropped at the next launch.
 */
import { createFlightStore, type FlightStore, type KeyValueStorage } from '@wingbeat/core/flight-store';
import { SPEED_THRESHOLD_KMH } from '@wingbeat/core/regions';
import type { ApiClient } from '@wingbeat/core/api/client';

export const FLIGHT_CACHE_FORMAT = 1;

const PREFIX = 'flights.';

export function flightCacheKey(host: string, userId: number): string {
  return `${PREFIX}v${FLIGHT_CACHE_FORMAT}.${host}.${userId}`;
}

/** The cached blobs no current account reads: older formats', and removed accounts'. */
export function staleFlightCacheKeys(keys: string[], accounts: { host: string; user: { id: number } }[]): string[] {
  const live = new Set(accounts.map((a) => flightCacheKey(a.host, a.user.id)));
  return keys.filter((k) => k.startsWith(PREFIX) && !live.has(k));
}

export function accountFlightStore(storage: KeyValueStorage, client: ApiClient, host: string, userId: number): FlightStore {
  return createFlightStore({ storage, client, key: flightCacheKey(host, userId), flightThresholdKmh: SPEED_THRESHOLD_KMH });
}
