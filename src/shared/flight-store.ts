import { SPEED_THRESHOLD_KMH } from '../geo';

/**
 * Client-side flight store singleton, rendered into both the dashboard and analytics pages.
 * Uses a single localStorage key (ft_flights_v2) across all trackers; tracker filtering
 * is a read-time concern via the optional trackerIds parameter on getAll/getCompleted.
 *
 * It also syncs the flight corrections (GET /api/flight-log-entries) and serves
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

    let _mem = { last_modified_at_by_tracker: {}, flights: [], entries: [], entries_version: null };
    let _cbs = [];
    let _pending = null;
    let _lastTrackerIds = [];
    // Effective flights, rebuilt when the raw flights, the corrections or the pilot list
    // change, so repeated reads return the same objects.
    let _gen = 0;
    let _effCache = null;

    function _fsSave() {
      _gen++;
      try { localStorage.setItem(_STORAGE_KEY, JSON.stringify(_mem)); } catch (_) {}
    }

    function _fsLoad() {
      try {
        const raw = localStorage.getItem(_STORAGE_KEY);
        if (raw) _mem = JSON.parse(raw);
      } catch (_) {}
      if (!Array.isArray(_mem.entries)) { _mem.entries = []; _mem.entries_version = null; }
      _gen++;
    }

    // The page's pilot list (both pages keep one), for manual flights' pilot names.
    function _fsPilots() {
      try { return pilotList || []; } catch (_) { return []; }
    }

    function _fsEffective() {
      const pilots = _fsPilots();
      if (!_effCache || _effCache.gen !== _gen || _effCache.pilots !== pilots) {
        const { flights, unmatched } = applyFlightEdits(_mem.flights, _mem.entries, { includeRemoved: true, pilots });
        _effCache = { gen: _gen, pilots, flights, unmatched };
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

    // The corrections, unless the cached copy is current. A failure keeps the cached copy.
    async function _fsFetchEntries() {
      try {
        const v = _mem.entries_version;
        const resp = await fetch('/api/flight-log-entries' + (v != null ? '?version=' + encodeURIComponent(v) : ''));
        if (!resp.ok) return null;
        const data = await resp.json();
        return data.unchanged ? null : data;
      } catch (_) {
        return null;
      }
    }

    async function _fsFetchMerge(trackerIds) {
      const [results, entriesData] = await Promise.all([
        Promise.all(trackerIds.map(async (tid) => {
          const since = _mem.last_modified_at_by_tracker[tid] ?? 0;
          const resp = await fetch('/api/flights/complete?tracker=' + encodeURIComponent(tid) + '&since=' + since);
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return { tid, data: await resp.json() };
        })),
        _fsFetchEntries(),
      ]);
      let changed = false;
      let latestLastPolled = null;
      const liveLabelsByTracker = {};
      let anyGeocodePending = false;
      for (const { tid, data } of results) {
        if (data.flights.length > 0) {
          _fsMerge(data.flights);
          changed = true;
        }
        if ((data.last_modified_at ?? 0) > (_mem.last_modified_at_by_tracker[tid] ?? 0)) {
          _mem.last_modified_at_by_tracker[tid] = data.last_modified_at;
          changed = true;
        }
        if ((data.last_polled ?? 0) > (latestLastPolled ?? 0)) latestLastPolled = data.last_polled;
        liveLabelsByTracker[tid] = data.live_label ?? null;
        if (data.geocode_pending) anyGeocodePending = true;
      }
      if (entriesData) {
        _mem.entries = entriesData.entries;
        _mem.entries_version = entriesData.version;
        changed = true;
      }
      if (changed) { _fsSave(); _cbs.forEach(cb => cb()); }
      return { changed, lastPolled: latestLastPolled, liveLabelsByTracker, geocodePending: anyGeocodePending };
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
      async refresh(trackerIds = _lastTrackerIds) {
        _lastTrackerIds = trackerIds;
        if (_pending) return _pending;
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

      onChange(cb) {
        _cbs.push(cb);
        return () => { _cbs = _cbs.filter(c => c !== cb); };
      },

      clearCache(trackerIds = null) {
        if (!trackerIds) {
          _mem = { last_modified_at_by_tracker: {}, flights: [], entries: [], entries_version: null };
        } else {
          _mem.flights = _mem.flights.filter(f => !trackerIds.includes(f.tracker_id));
          for (const tid of trackerIds) delete _mem.last_modified_at_by_tracker[tid];
        }
        _fsSave();
      },
    };
  `;
}
