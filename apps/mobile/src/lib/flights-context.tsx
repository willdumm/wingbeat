/**
 * The active account's flight store (flight-cache.ts) for the screens: its cached copy as
 * soon as it's read, refreshed while the app is in the foreground on the dashboard's
 * adaptive schedule (core's nextLivePoll) and at once on return to the foreground. It
 * refreshes only when the handshake is 'ok'; otherwise the cached copy is all there is.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import type { FlightStore, RefreshResult } from '@wingbeat/core/flight-store';
import { nextLivePoll, trackerLiveData } from '@wingbeat/core/live';
import { SPEED_THRESHOLD_KMH } from '@wingbeat/core/regions';
import { useAccounts } from './accounts-context';
import { useBootstrap } from './bootstrap-context';
import { accountFlightStore, staleFlightCacheKeys } from './flight-cache';
import { staleAccountPrefKeys } from './prefs';

interface FlightsValue {
  /** null without an active account, or until its cached copy has been read. */
  store: FlightStore | null;
  /** The last refresh's live data (the status cards'); null before the first. */
  lastRefresh: RefreshResult | null;
  /** Bumped whenever the store's flights may have changed, for screens to re-read them. */
  generation: number;
}

const FlightsContext = createContext<FlightsValue>({ store: null, lastRefresh: null, generation: 0 });

export function FlightsProvider({ children }: { children: ReactNode }) {
  const { loaded, accounts, active, client } = useAccounts();
  const { bootstrap, handshake } = useBootstrap();
  const [store, setStore] = useState<FlightStore | null>(null);
  const [lastRefresh, setLastRefresh] = useState<RefreshResult | null>(null);
  const [generation, setGeneration] = useState(0);

  // Drops the cached copies and the settings (prefs.ts) no account reads any more.
  useEffect(() => {
    if (!loaded) return;
    Storage.getAllKeys()
      .then((keys) => Storage.multiRemove([...staleFlightCacheKeys(keys, accounts), ...staleAccountPrefKeys(keys, accounts)]))
      .catch(() => {});
  }, [loaded, accounts]);

  const accountKey = active ? `${active.host}.${active.user.id}` : null;
  useEffect(() => {
    setStore(null);
    setLastRefresh(null);
    if (!active || !client) return;
    const s = accountFlightStore(Storage, client, active.host, active.user.id);
    let current = true;
    const unsubscribe = s.onChange(() => setGeneration((g) => g + 1));
    Promise.resolve(s.init()).then(() => { if (current) setStore(s); });
    return () => { current = false; unsubscribe(); };
  }, [accountKey, client]);

  // Keyed by the ids, so a bootstrap reloaded on return to the foreground doesn't restart the poll.
  const activeTrackers = bootstrap?.trackers.filter((t) => t.active && !t.deleted) ?? [];
  const trackerIdsKey = activeTrackers.map((t) => t.id).join(',');
  const trackers = useMemo(() => activeTrackers, [trackerIdsKey]);
  useEffect(() => { if (store && bootstrap) store.setPilots(bootstrap.pilots); }, [store, bootstrap]);

  useEffect(() => {
    if (!store || handshake !== 'ok') return;
    const ids = trackers.map((t) => t.id);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastKnownGarminTime: number | null = null;
    let stopped = false;

    const stop = () => { if (timer) clearTimeout(timer); timer = null; };
    const poll = async () => {
      stop();
      let result: RefreshResult | null = null;
      try { result = await store.refresh(ids); } catch { /* the next poll tries again */ }
      if (stopped) return;
      if (result) setLastRefresh(result);
      const live = trackerLiveData(trackers, store.getRaw, result);
      const next = nextLivePoll(SPEED_THRESHOLD_KMH, Date.now() / 1000, live, lastKnownGarminTime);
      lastKnownGarminTime = next.lastKnownGarminTime;
      if (AppState.currentState === 'active') timer = setTimeout(poll, next.delayMs);
    };

    poll();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') poll();
      else stop();
    });
    return () => { stopped = true; stop(); sub.remove(); };
  }, [store, handshake, trackers]);

  return (
    <FlightsContext.Provider value={{ store, lastRefresh, generation }}>
      {children}
    </FlightsContext.Provider>
  );
}

export function useFlights(): FlightsValue {
  return useContext(FlightsContext);
}
