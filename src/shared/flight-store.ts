import { SPEED_THRESHOLD_KMH } from '../geo';

/**
 * Client-side flight store singleton, rendered into both the dashboard and analytics pages.
 * Uses a single localStorage key (ft_flights_v2) across all trackers; tracker filtering
 * is a read-time concern via the optional trackerIds parameter on getAll/getCompleted.
 *
 * It also syncs the flight corrections (GET /api/flight-corrections) the same way, from a
 * cursor (since=, an edit_history id) that's advanced as deltas are merged, and serves
 * effective flights: getAll/getCompleted apply them with applyFlightEdits()
 * (flight-edits.ts, needed in the same script), so every page shows corrected times and
 * labels, manual flights, and no removed flights. getRaw() returns the tracker's own
 * records. See docs/flight-editor-plan.md.
 */
export function flightStoreScript(): string {
  return `
    // ── Flight store singleton ────────────────────────────────────────────────
    const _STORAGE_KEY  = 'ft_flights_v2';
    const _FLIGHT_KMH   = ${SPEED_THRESHOLD_KMH};

    let _mem = _fsEmpty();
    let _cbs = [];
    let _pending = null;
    let _queued = null;              // a refresh asked for while one was in flight
    let _lastTrackerIds = [];
    // Trackers refreshed this session: a correction for one of them with no flight is
    // "unmatched"; one for any other tracker can't be judged here.
    const _refreshedTrackers = new Set();
    let _pilots = [];                // [{ id, name }], for manual flights' pilot names
    // Effective flights, rebuilt when the raw flights, the corrections or the pilot list
    // change, so repeated reads return the same objects.
    let _gen = 0;
    let _effCache = null;

    function _fsEmpty() {
      return { last_modified_at_by_tracker: {}, flights: [], entries: [], entries_last_history_id: 0 };
    }

    function _fsSave() {
      _gen++;
      try { localStorage.setItem(_STORAGE_KEY, JSON.stringify(_mem)); } catch (_) {}
    }

    function _fsLoad() {
      try {
        const raw = localStorage.getItem(_STORAGE_KEY);
        if (raw) _mem = JSON.parse(raw);
      } catch (_) {}
      // A copy without a cursor (the old whole-table entries_version) is shown until the
      // next refresh replaces it with a full fetch.
      if (!Array.isArray(_mem.entries)) _mem.entries = [];
      if (!Number.isInteger(_mem.entries_last_history_id)) _mem.entries_last_history_id = 0;
      delete _mem.entries_version;
      _gen++;
    }

    function _fsEffective() {
      if (!_effCache || _effCache.gen !== _gen) {
        const { flights, unmatched, unplaced } = applyFlightEdits(_mem.flights, _mem.entries,
          { includeRemoved: true, pilots: _pilots, knownTrackerIds: _refreshedTrackers });
        _effCache = { gen: _gen, flights, unmatched, unplaced };
      }
      return _effCache;
    }

    function _fsOverlaps(a, b) {
      const aEnd = a.end_time ?? a.start_time;
      const bEnd = b.end_time ?? b.start_time;
      return a.start_time <= bEnd && b.start_time <= aEnd;
    }

    function _fsMerge(incoming) {
      for (const rec of incoming) {
        _mem.flights = _mem.flights.filter(f => f.tracker_id !== rec.tracker_id || !_fsOverlaps(f, rec));
        _mem.flights.push(rec);
      }
    }

    // GET path with since=<cursor>: what changed after the cursor and the new cursor, for
    // the caller to merge and advance (_fsAdvance) before saving.
    async function _fsFetchSince(path, since) {
      const resp = await fetch(path + (path.includes('?') ? '&' : '?') + 'since=' + since);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    }

    // Moves cursors[key] to next if that's later (or anywhere, with reset: a full resync).
    // Returns whether it moved.
    function _fsAdvance(cursors, key, next, reset = false) {
      if (reset ? cursors[key] === next : (next ?? 0) <= (cursors[key] ?? 0)) return false;
      cursors[key] = next;
      return true;
    }

    // A correction's key, as edit_history and GET /api/flight-corrections' deleted list
    // have it: '<tracker_id>/<flight_start_time>' or 'manual/<id>'. Merging on it rather than
    // id replaces a tracked flight's row that was deleted and re-inserted under a new id.
    function flightCorrectionKey(e) {
      return e.tracker_id == null ? 'manual/' + e.id : e.tracker_id + '/' + e.flight_start_time;
    }

    // entries with a GET /api/flight-corrections response applied: { entries, deleted, full }.
    // A full response replaces them; otherwise its rows replace (or join) those with the
    // same key and deleted keys are dropped. Returns entries itself when nothing changed.
    function mergeFlightCorrections(entries, { entries: incoming = [], deleted = [], full = false }) {
      if (full) return JSON.stringify(incoming) === JSON.stringify(entries) ? entries : incoming;
      if (!incoming.length && !deleted.length) return entries;
      const byKey = new Map(entries.map(e => [flightCorrectionKey(e), e]));
      for (const key of deleted) byKey.delete(key);
      for (const e of incoming) byKey.set(flightCorrectionKey(e), e);
      return [...byKey.values()];
    }

    async function _fsFetchMerge(trackerIds) {
      const entriesSince = _mem.entries_last_history_id;
      const [results, entriesData] = await Promise.all([
        Promise.all(trackerIds.map(async (tid) => {
          const since = _mem.last_modified_at_by_tracker[tid] ?? 0;
          return { tid, data: await _fsFetchSince('/api/flights/complete?tracker=' + encodeURIComponent(tid), since) };
        })),
        // A failure keeps the cached copy.
        _fsFetchSince('/api/flight-corrections', entriesSince).catch(() => null),
      ]);
      let changed = false;
      let latestLastPolled = null;
      const liveLabelsByTracker = {};
      // Not kept in _mem: both are replaced whole on every refresh.
      const lastPointTimeByTracker = {};
      const groundTrailsByTracker = {};
      let anyGeocodePending = false;
      for (const { tid, data } of results) {
        if (!_refreshedTrackers.has(tid)) { _refreshedTrackers.add(tid); _gen++; }
        if (data.flights.length > 0) {
          _fsMerge(data.flights);
          changed = true;
        }
        if (_fsAdvance(_mem.last_modified_at_by_tracker, tid, data.last_modified_at)) changed = true;
        if ((data.last_polled ?? 0) > (latestLastPolled ?? 0)) latestLastPolled = data.last_polled;
        liveLabelsByTracker[tid] = data.live_label ?? null;
        lastPointTimeByTracker[tid] = data.last_point_time ?? null;
        groundTrailsByTracker[tid] = data.ground_trail ?? [];
        if (data.geocode_pending) anyGeocodePending = true;
      }
      // Dropped if another tab's save moved the cursor meanwhile (the storage listener
      // reloaded _mem): the delta may predate that copy. The next refresh continues from it.
      // The cursor is the newest history id of any entity, so it also moves on a change
      // elsewhere (a duty day's); that's saved, but there's nothing to re-render.
      let cursorMoved = false;
      if (entriesData && _mem.entries_last_history_id === entriesSince) {
        const entries = mergeFlightCorrections(_mem.entries, entriesData);
        if (entries !== _mem.entries) { _mem.entries = entries; changed = true; }
        cursorMoved = _fsAdvance(_mem, 'entries_last_history_id', entriesData.last_history_id, entriesData.full);
      }
      if (changed) { _fsSave(); _cbs.forEach(cb => cb()); }
      else if (cursorMoved) _fsSave();
      return { changed, lastPolled: latestLastPolled, liveLabelsByTracker, lastPointTimeByTracker, groundTrailsByTracker, geocodePending: anyGeocodePending };
    }

    // Manual flights have no tracker, so they're always included; trackerIds narrows the
    // tracked ones.
    function _fsInTrackers(f, trackerIds) {
      return !trackerIds || f.tracker_id == null || trackerIds.includes(f.tracker_id);
    }

    let _storageListenerAttached = false;
    const flightStore = {
      init() {
        _fsLoad();
        if (!_storageListenerAttached) {
          _storageListenerAttached = true;
          window.addEventListener('storage', e => {
            if (e.key !== _STORAGE_KEY) return;
            _fsLoad();
            _cbs.forEach(cb => cb());
          });
        }
      },

      // Without trackerIds, the last refresh's (after a write to the corrections, from
      // code that doesn't know the page's trackers).
      //
      // A refresh asked for while one is in flight (say, right after a write, during a
      // poll) runs again once that one finishes, rather than sharing its result, which may
      // predate the write. Callers asking meanwhile share that one follow-up.
      async refresh(trackerIds = _lastTrackerIds) {
        _lastTrackerIds = trackerIds;
        if (_pending) {
          if (!_queued) {
            _queued = _pending.catch(() => {}).then(() => { _queued = null; return flightStore.refresh(); });
          }
          return _queued;
        }
        _pending = _fsFetchMerge(trackerIds).finally(() => { _pending = null; });
        return _pending;
      },

      // Effective flights (corrections applied, manual flights added), sorted by start
      // time. Removed flights only with includeRemoved (the flight editor).
      getAll(trackerIds, { includeRemoved = false } = {}) {
        return _fsEffective().flights.filter(f =>
          _fsInTrackers(f, trackerIds) && (includeRemoved || !(f.edit && f.edit.excluded)));
      },

      // getAll() without any tracker's newest flight while it's still airborne.
      getCompleted(trackerIds, opts) {
        const all = this.getAll(trackerIds, opts);
        if (!all.length) return [];
        const inFlightIds = new Set();
        const latestByTracker = new Map();
        for (const f of this.getRaw(trackerIds)) latestByTracker.set(f.tracker_id, f);
        for (const f of latestByTracker.values()) {
          const lp = f.points[f.points.length - 1];
          if (lp && (lp.v ?? 0) >= _FLIGHT_KMH) inFlightIds.add(f.id);
        }
        return inFlightIds.size > 0 ? all.filter(f => !inFlightIds.has(f.id)) : all;
      },

      // The trackers' own records, uncorrected, sorted by start time (live positions,
      // the flight form's "Tracker:" hints).
      getRaw(trackerIds) {
        const flights = trackerIds
          ? _mem.flights.filter(f => trackerIds.includes(f.tracker_id))
          : _mem.flights.slice();
        return flights.sort((a, b) => a.start_time - b.start_time);
      },

      // Corrections whose tracked flight is gone (see applyFlightEdits).
      getUnmatched(trackerIds) {
        return _fsEffective().unmatched.filter(e => !trackerIds || trackerIds.includes(e.tracker_id));
      },

      // Corrections for trackers this page didn't refresh (deleted or inactive ones), which
      // apply to nothing here.
      getUnplaced() {
        return _fsEffective().unplaced;
      },

      // The page's pilots ([{ id, name }]), for manual flights' pilot names. Call it
      // whenever the list is loaded or a pilot changes.
      setPilots(pilots) {
        _pilots = pilots || [];
        _gen++;
        _cbs.forEach(cb => cb());
      },

      // Bumped whenever what getAll() returns may have changed.
      generation() {
        return _gen;
      },

      // The edit_history id the corrections are as of (GET /api/flight-corrections'
      // last_history_id): every correction up to it is applied to getAll()'s flights, whose
      // aircraft/pilot come from the same refresh. The flight form saves with it as
      // base_history_id, so a change it didn't show is a conflict.
      historyId() {
        return _mem.entries_last_history_id;
      },

      onChange(cb) {
        _cbs.push(cb);
        return () => { _cbs = _cbs.filter(c => c !== cb); };
      },

      clearCache(trackerIds = null) {
        if (!trackerIds) {
          _mem = _fsEmpty();
        } else {
          _mem.flights = _mem.flights.filter(f => !trackerIds.includes(f.tracker_id));
          for (const tid of trackerIds) delete _mem.last_modified_at_by_tracker[tid];
        }
        _fsSave();
      },
    };
  `;
}
