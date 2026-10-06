import { SPEED_THRESHOLD_KMH } from '../geo';

/**
 * Client-side flight store singleton, rendered into both the dashboard and analytics pages.
 * Uses a single localStorage key (ft_flights_v2) across all trackers; tracker filtering
 * is a read-time concern via the optional trackerIds parameter on getAll/getCompleted.
 */
export function flightStoreScript(): string {
  return `
    // ── Flight store singleton ────────────────────────────────────────────────
    const _STORAGE_KEY  = 'ft_flights_v2';
    const _FLIGHT_KMH   = ${SPEED_THRESHOLD_KMH};

    let _mem = { last_modified_at_by_tracker: {}, flights: [] };
    let _cbs = [];
    let _pending = null;

    function _fsSave() {
      try { localStorage.setItem(_STORAGE_KEY, JSON.stringify(_mem)); } catch (_) {}
    }

    function _fsLoad() {
      try {
        const raw = localStorage.getItem(_STORAGE_KEY);
        if (raw) _mem = JSON.parse(raw);
      } catch (_) {}
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

    async function _fsFetchMerge(trackerIds) {
      const results = await Promise.all(trackerIds.map(async (tid) => {
        const since = _mem.last_modified_at_by_tracker[tid] ?? 0;
        const resp = await fetch('/api/flights/complete?tracker=' + encodeURIComponent(tid) + '&since=' + since);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return { tid, data: await resp.json() };
      }));
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
      if (changed) { _fsSave(); _cbs.forEach(cb => cb()); }
      return { changed, lastPolled: latestLastPolled, liveLabelsByTracker, geocodePending: anyGeocodePending };
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

      async refresh(trackerIds) {
        if (_pending) return _pending;
        _pending = _fsFetchMerge(trackerIds).finally(() => { _pending = null; });
        return _pending;
      },

      getAll(trackerIds) {
        const flights = trackerIds
          ? _mem.flights.filter(f => trackerIds.includes(f.tracker_id))
          : _mem.flights.slice();
        return flights.sort((a, b) => a.start_time - b.start_time);
      },

      getCompleted(trackerIds) {
        const all = this.getAll(trackerIds);
        if (!all.length) return [];
        // Track the most-recent flight per tracker (getAll is sorted asc, so last wins).
        const latestByTracker = new Map();
        for (const f of all) latestByTracker.set(f.tracker_id, f);
        // Exclude any tracker's most-recent flight that is still airborne.
        const inFlightIds = new Set();
        for (const f of latestByTracker.values()) {
          const lp = f.points[f.points.length - 1];
          if (lp && (lp.v ?? 0) >= _FLIGHT_KMH) inFlightIds.add(f.id);
        }
        return inFlightIds.size > 0 ? all.filter(f => !inFlightIds.has(f.id)) : all;
      },

      onChange(cb) {
        _cbs.push(cb);
        return () => { _cbs = _cbs.filter(c => c !== cb); };
      },

      patchFlight(flightId, fields, fallbackStartTime = undefined) {
        const f = _mem.flights.find(fl => fl.id === flightId);
        if (f) { Object.assign(f, fields); _fsSave(); _cbs.forEach(cb => cb()); return; }
        if (fallbackStartTime !== undefined) {
          const g = _mem.flights.find(fl => fl.start_time === fallbackStartTime);
          if (g) { Object.assign(g, fields); _fsSave(); _cbs.forEach(cb => cb()); }
        }
      },

      clearCache(trackerIds = null) {
        if (!trackerIds) {
          _mem = { last_modified_at_by_tracker: {}, flights: [] };
        } else {
          _mem.flights = _mem.flights.filter(f => !trackerIds.includes(f.tracker_id));
          for (const tid of trackerIds) delete _mem.last_modified_at_by_tracker[tid];
        }
        _fsSave();
      },
    };
  `;
}
