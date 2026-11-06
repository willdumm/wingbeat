/**
 * The flight store: a cached copy of every tracker's flights and the flight corrections,
 * synced from cursors, serving effective flights (corrections applied with
 * applyFlightEdits()). One store per account: the web keeps one per page, in localStorage
 * under ft_flights_v2, and the app one per instance and user.
 *
 * Flights sync per tracker from GET /api/flights/complete?since=<modified_at>, merged by
 * tracker and time overlap. Corrections sync from GET /api/flight-corrections?since=<an
 * edit_history id>, as deltas (rows and deleted keys) or a full reset. The cached blob's
 * key and shape are part of the contract: a changed format would make every browser
 * silently download its full history again, or merge into an old blob wrongly. If it ever
 * has to change, change the key on purpose. See docs/flight-editor-plan.md.
 */
import { applyFlightEdits, type EffectiveFlight, type FlightCorrection } from './flight-edits';
import type { ApiClient } from './api/client';
import { FlightCorrectionsResponse, FlightsCompleteResponse, type FlightPoint, type TrackedFlight } from './api/flights';

/** The web's localStorage key for the cached copy. */
export const FLIGHT_STORE_KEY = 'ft_flights_v2';

/** Sync storage (localStorage) loads at init() synchronously; async storage loads in the promise init() returns. */
export interface KeyValueStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

/** The cached blob, exactly as the web has stored it. */
export interface FlightStoreBlob {
  last_modified_at_by_tracker: Record<string, number>;
  flights: TrackedFlight[];
  entries: FlightCorrection[];
  entries_last_history_id: number;
}

export interface FlightStoreOptions {
  storage: KeyValueStorage;
  client: ApiClient;
  /** The storage key (default FLIGHT_STORE_KEY). */
  key?: string;
  /** A tracker's newest flight is still airborne while its last point is at or above this (SPEED_THRESHOLD_KMH). */
  flightThresholdKmh: number;
  /**
   * Called once, at the first init(), with a function to call when another writer (another
   * tab) changed the stored copy: the store reloads it and notifies its listeners.
   */
  watchExternalChanges?: (onChange: () => void) => void;
}

/** What a refresh learned besides the flights: the status cards' live data. */
export interface RefreshResult {
  changed: boolean;
  lastPolled: number | null;
  liveLabelsByTracker: Record<number, string | null>;
  lastPointTimeByTracker: Record<number, number | null>;
  groundTrailsByTracker: Record<number, FlightPoint[]>;
  geocodePending: boolean;
}

type Correction = { tracker_id: number | null; id: number; flight_start_time: number | null };

/**
 * A correction's key, as edit_history and GET /api/flight-corrections' deleted list have
 * it: '<tracker_id>/<flight_start_time>' or 'manual/<id>'. Merging on it rather than id
 * replaces a tracked flight's row that was deleted and re-inserted under a new id.
 */
export function flightCorrectionKey(e: Correction): string {
  return e.tracker_id == null ? 'manual/' + e.id : e.tracker_id + '/' + e.flight_start_time;
}

/**
 * entries with a GET /api/flight-corrections response applied: { entries, deleted, full }.
 * A full response replaces them; otherwise its rows replace (or join) those with the same
 * key and deleted keys are dropped. Returns entries itself when nothing changed.
 */
export function mergeFlightCorrections<E extends Correction>(
  entries: E[],
  { entries: incoming = [], deleted = [], full = false }: { entries?: E[]; deleted?: string[]; full?: boolean },
): E[] {
  if (full) return JSON.stringify(incoming) === JSON.stringify(entries) ? entries : incoming;
  if (!incoming.length && !deleted.length) return entries;
  const byKey = new Map(entries.map(e => [flightCorrectionKey(e), e]));
  for (const key of deleted) byKey.delete(key);
  for (const e of incoming) byKey.set(flightCorrectionKey(e), e);
  return [...byKey.values()];
}

function isRecord(x: unknown): boolean {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function emptyBlob(): FlightStoreBlob {
  return { last_modified_at_by_tracker: {}, flights: [], entries: [], entries_last_history_id: 0 };
}

function overlaps(a: { start_time: number; end_time: number | null }, b: { start_time: number; end_time: number | null }) {
  const aEnd = a.end_time ?? a.start_time;
  const bEnd = b.end_time ?? b.start_time;
  return a.start_time <= bEnd && b.start_time <= aEnd;
}

// Moves cursors[key] to next if that's later (or anywhere, with reset: a full resync).
// Returns whether it moved.
function advance(cursors: Record<string, number>, key: string, next: number | null | undefined, reset = false): boolean {
  if (reset ? cursors[key] === next : (next ?? 0) <= (cursors[key] ?? 0)) return false;
  cursors[key] = next as number;
  return true;
}

// Manual flights have no tracker, so they're always included; trackerIds narrows the
// tracked ones.
function inTrackers(f: { tracker_id: number | null }, trackerIds?: number[] | null) {
  return !trackerIds || f.tracker_id == null || trackerIds.includes(f.tracker_id);
}

export function createFlightStore({ storage, client, key = FLIGHT_STORE_KEY, flightThresholdKmh, watchExternalChanges }: FlightStoreOptions) {
  // Typed loosely: an old blob may lack fields, and load() repairs it.
  let mem: FlightStoreBlob & { entries_version?: unknown } = emptyBlob();
  let cbs: (() => void)[] = [];
  let pending: Promise<RefreshResult> | null = null;
  let queued: Promise<RefreshResult> | null = null;   // a refresh asked for while one was in flight
  let lastTrackerIds: number[] = [];
  // Trackers refreshed this session: a correction for one of them with no flight is
  // "unmatched"; one for any other tracker can't be judged here.
  const refreshedTrackers = new Set<number>();
  let pilots: { id: number; name: string }[] = [];   // for manual flights' pilot names
  // Effective flights, rebuilt when the raw flights, the corrections or the pilot list
  // change, so repeated reads return the same objects.
  let gen = 0;
  let effCache: { gen: number; flights: EffectiveFlight[]; unmatched: FlightCorrection[]; unplaced: FlightCorrection[] } | null = null;
  let watching = false;
  let loading: Promise<void> | null = null;   // an async storage's load in progress

  const notify = () => cbs.forEach(cb => cb());

  function save() {
    gen++;
    try {
      // An async storage's failure is ignored too, as a full localStorage's is.
      Promise.resolve(storage.setItem(key, JSON.stringify(mem))).catch(() => {});
    } catch (_) {}
  }

  function parse(raw: string | null) {
    try {
      const stored = raw ? JSON.parse(raw) : null;
      if (isRecord(stored)) mem = stored;
    } catch (_) {}
    // A list that's missing takes its cursors with it, or the next refresh would only ask
    // for what's newer. A copy with a list but no cursor (the old whole-table
    // entries_version) is shown until the next refresh replaces it with a full fetch.
    if (!Array.isArray(mem.flights)) { mem.flights = []; mem.last_modified_at_by_tracker = {}; }
    if (!isRecord(mem.last_modified_at_by_tracker)) mem.last_modified_at_by_tracker = {};
    if (!Array.isArray(mem.entries)) { mem.entries = []; mem.entries_last_history_id = 0; }
    if (!Number.isInteger(mem.entries_last_history_id)) mem.entries_last_history_id = 0;
    delete mem.entries_version;
    gen++;
  }

  // Synchronous with sync storage, so the pages can read the store right after init().
  function load(): void | Promise<void> {
    let raw: string | null | Promise<string | null>;
    try { raw = storage.getItem(key); } catch (_) { raw = null; }
    if (raw instanceof Promise) {
      const loaded: Promise<void> = raw.catch(() => null).then(parse).finally(() => {
        if (loading === loaded) loading = null;
      });
      return loading = loaded;
    }
    parse(raw);
  }

  function effective() {
    if (!effCache || effCache.gen !== gen) {
      const { flights, unmatched, unplaced } = applyFlightEdits(mem.flights, mem.entries,
        { includeRemoved: true, pilots, knownTrackerIds: refreshedTrackers });
      effCache = { gen, flights, unmatched, unplaced };
    }
    return effCache;
  }

  function mergeFlights(incoming: TrackedFlight[]) {
    for (const rec of incoming) {
      mem.flights = mem.flights.filter(f => f.tracker_id !== rec.tracker_id || !overlaps(f, rec));
      mem.flights.push(rec);
    }
  }

  const since = (path: string, cursor: number) => path + (path.includes('?') ? '&' : '?') + 'since=' + cursor;

  async function fetchMerge(trackerIds: number[]): Promise<RefreshResult> {
    // The load would replace what this merges, and its cursors are where this starts.
    if (loading) await loading;
    const entriesSince = mem.entries_last_history_id;
    const [results, entriesData] = await Promise.all([
      Promise.all(trackerIds.map(async (tid) => {
        const cursor = mem.last_modified_at_by_tracker[tid] ?? 0;
        return { tid, cursor, data: await client.get(since('/api/flights/complete?tracker=' + encodeURIComponent(tid), cursor), FlightsCompleteResponse) };
      })),
      // A failure keeps the cached copy.
      client.get(since('/api/flight-corrections', entriesSince), FlightCorrectionsResponse).catch(() => null),
    ]);
    let changed = false;
    let latestLastPolled: number | null = null;
    const liveLabelsByTracker: RefreshResult['liveLabelsByTracker'] = {};
    // Not kept in mem: both are replaced whole on every refresh.
    const lastPointTimeByTracker: RefreshResult['lastPointTimeByTracker'] = {};
    const groundTrailsByTracker: RefreshResult['groundTrailsByTracker'] = {};
    let anyGeocodePending = false;
    for (const { tid, cursor, data } of results) {
      if (!refreshedTrackers.has(tid)) { refreshedTrackers.add(tid); gen++; }
      // Dropped if another tab's save moved the tracker's cursor meanwhile, as the corrections
      // below are: these records may be older than that copy's.
      if ((mem.last_modified_at_by_tracker[tid] ?? 0) === cursor) {
        if (data.flights.length > 0) {
          mergeFlights(data.flights);
          changed = true;
        }
        if (advance(mem.last_modified_at_by_tracker, String(tid), data.last_modified_at)) changed = true;
      }
      if ((data.last_polled ?? 0) > (latestLastPolled ?? 0)) latestLastPolled = data.last_polled;
      liveLabelsByTracker[tid] = data.live_label ?? null;
      lastPointTimeByTracker[tid] = data.last_point_time ?? null;
      groundTrailsByTracker[tid] = data.ground_trail ?? [];
      if (data.geocode_pending) anyGeocodePending = true;
    }
    // Dropped if another tab's save moved the cursor meanwhile (the storage listener
    // reloaded mem): the delta may predate that copy. The next refresh continues from it.
    // The cursor is the newest history id of any entity, so it also moves on a change
    // elsewhere (a duty day's); that's saved, but there's nothing to re-render.
    let cursorMoved = false;
    if (entriesData && mem.entries_last_history_id === entriesSince) {
      const entries = mergeFlightCorrections(mem.entries, entriesData as { entries: FlightCorrection[]; deleted: string[]; full?: boolean });
      if (entries !== mem.entries) { mem.entries = entries; changed = true; }
      cursorMoved = advance(mem as unknown as Record<string, number>, 'entries_last_history_id', entriesData.last_history_id, entriesData.full);
    }
    if (changed) { save(); notify(); }
    else if (cursorMoved) save();
    return { changed, lastPolled: latestLastPolled, liveLabelsByTracker, lastPointTimeByTracker, groundTrailsByTracker, geocodePending: anyGeocodePending };
  }

  const store = {
    /** Loads the cached copy (synchronously, with sync storage) and starts watching for other writers. */
    init(): void | Promise<void> {
      if (!watching && watchExternalChanges) {
        watching = true;
        watchExternalChanges(() => {
          const loaded = load();
          if (loaded) loaded.then(notify); else notify();
        });
      }
      return load();
    },

    /**
     * Without trackerIds, the last refresh's (after a write to the corrections, from code
     * that doesn't know the page's trackers).
     *
     * A refresh asked for while one is in flight (say, right after a write, during a poll)
     * runs again once that one finishes, rather than sharing its result, which may predate
     * the write. Callers asking meanwhile share that one follow-up.
     */
    async refresh(trackerIds: number[] = lastTrackerIds): Promise<RefreshResult> {
      lastTrackerIds = trackerIds;
      if (pending) {
        if (!queued) {
          queued = pending.catch(() => {}).then(() => { queued = null; return store.refresh(); });
        }
        return queued;
      }
      pending = fetchMerge(trackerIds).finally(() => { pending = null; });
      return pending;
    },

    /**
     * Effective flights (corrections applied, manual flights added), sorted by start time.
     * Removed flights only with includeRemoved (the flight editor).
     */
    getAll(trackerIds?: number[] | null, { includeRemoved = false } = {}): EffectiveFlight[] {
      return effective().flights.filter(f =>
        inTrackers(f, trackerIds) && (includeRemoved || !(f.edit && f.edit.excluded)));
    },

    /** getAll() without any tracker's newest flight while it's still airborne. */
    getCompleted(trackerIds?: number[] | null, opts?: { includeRemoved?: boolean }): EffectiveFlight[] {
      const all = store.getAll(trackerIds, opts);
      if (!all.length) return [];
      const inFlightIds = new Set<number>();
      const latestByTracker = new Map<number, TrackedFlight>();
      for (const f of store.getRaw(trackerIds)) latestByTracker.set(f.tracker_id, f);
      for (const f of latestByTracker.values()) {
        const lp = f.points[f.points.length - 1];
        if (lp && (lp.v ?? 0) >= flightThresholdKmh) inFlightIds.add(f.id);
      }
      return inFlightIds.size > 0 ? all.filter(f => !inFlightIds.has(f.id)) : all;
    },

    /** The trackers' own records, uncorrected, sorted by start time (live positions, the flight form's "Tracker:" hints). */
    getRaw(trackerIds?: number[] | null): TrackedFlight[] {
      const flights = trackerIds
        ? mem.flights.filter(f => trackerIds.includes(f.tracker_id))
        : mem.flights.slice();
      return flights.sort((a, b) => a.start_time - b.start_time);
    },

    /** Corrections whose tracked flight is gone (see applyFlightEdits). */
    getUnmatched(trackerIds?: number[] | null): FlightCorrection[] {
      return effective().unmatched.filter(e => !trackerIds || trackerIds.includes(e.tracker_id as number));
    },

    /** Corrections for trackers this page didn't refresh (deleted or inactive ones), which apply to nothing here. */
    getUnplaced(): FlightCorrection[] {
      return effective().unplaced;
    },

    /** The page's pilots, for manual flights' pilot names. Call it whenever the list is loaded or a pilot changes. */
    setPilots(list: { id: number; name: string }[] | null | undefined) {
      pilots = list || [];
      gen++;
      notify();
    },

    /** Bumped whenever what getAll() returns may have changed. */
    generation(): number {
      return gen;
    },

    /**
     * The edit_history id the corrections are as of (GET /api/flight-corrections'
     * last_history_id): every correction up to it is applied to getAll()'s flights, whose
     * aircraft/pilot come from the same refresh. The flight form saves with it as
     * base_history_id, so a change it didn't show is a conflict.
     */
    historyId(): number {
      return mem.entries_last_history_id;
    },

    onChange(cb: () => void): () => void {
      cbs.push(cb);
      return () => { cbs = cbs.filter(c => c !== cb); };
    },

    clearCache(trackerIds: number[] | null = null) {
      if (!trackerIds) {
        mem = emptyBlob();
      } else {
        mem.flights = mem.flights.filter(f => !trackerIds.includes(f.tracker_id));
        for (const tid of trackerIds) delete mem.last_modified_at_by_tracker[tid];
      }
      save();
    },

    /** The cached copy as it is now (for tests and debugging; don't mutate it). */
    snapshot(): FlightStoreBlob {
      return mem;
    },
  };
  return store;
}

export type FlightStore = ReturnType<typeof createFlightStore>;
