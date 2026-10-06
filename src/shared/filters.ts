/** Shared filter module: styles, markup, and runtime script for tracker/aircraft/pilot/date filtering. */
import { icon } from './icons';

export function filterStyles(): string {
  return `
    /* ── Filter section ──────────────────────────────────────────────────────── */
    .filter-section {
      border-bottom: 1px solid var(--border);
    }

    .filter-toggle {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      width: 100%;
      padding: 0.5rem 0.75rem;
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 0.8rem;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
      flex-shrink: 0;
    }

    .filter-toggle:hover { background: var(--surface-hover); }

    .filter-controls {
      padding: 0.5rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      border-top: 1px solid var(--border);
      container-type: inline-size;
    }

    .filter-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .filter-row label {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      width: 60px;
      flex-shrink: 0;
      text-align: right;
      padding-right: 0.2rem;
    }

    .filter-date-from,
    .filter-date-to {
      -webkit-appearance: none;
      appearance: none;
      flex: 1;
      min-width: 80px;
      min-height: 2.1rem;
      padding: 0.3rem 0.5rem;
      background: var(--input-bg);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: 0.82rem;
    }

    .filter-select {
      flex: 1;
      min-width: 80px;
      min-height: 2.1rem;
      padding: 0.3rem 0.5rem;
      background: var(--input-bg);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: 0.82rem;
      cursor: pointer;
    }

    @container (max-width: 170px) {
      .filter-row { flex-direction: column; align-items: center; }
      .filter-row label { width: auto; text-align: center; padding-right: 0; }
    }

    /* Visual props from .btn-secondary on this element */
    .filter-clear-all { align-self: flex-start; padding: 0.3rem 0.65rem; font-size: 0.78rem; }

    .applied-filters {
      padding: 0 0.75rem 0.5rem;
    }

    .applied-filters-header {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-faint);
      margin-bottom: 0.35rem;
    }

    .applied-filters-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .filter-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: var(--surface-1);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-pill);
      padding: 2px 10px;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .filter-chip-x {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 0.75rem;
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
      transition: color 0.15s;
    }

    .filter-chip-x:hover { color: var(--danger); }
  `;
}

export function filterMarkup(): string {
  return `
    <div class="filter-section">
      <button class="filter-toggle" id="filter-toggle-btn"><span class="chevron">${icon('chevron-right', { size: 14 })}</span><span id="filter-toggle-label">Filters</span></button>
      <div class="applied-filters" id="applied-filters-area" style="display:none">
        <div class="applied-filters-header">Applied Filters</div>
        <div class="applied-filters-chips" id="applied-filters-chips"></div>
      </div>
      <div class="filter-controls" id="filter-controls" style="display:none">
        <div class="filter-row">
          <label>From</label>
          <input type="date" class="filter-date-from" id="filter-date-from" />
        </div>
        <div class="filter-row">
          <label>To</label>
          <input type="date" class="filter-date-to" id="filter-date-to" />
        </div>
        <div class="filter-row">
          <label>Tracker</label>
          <select class="filter-select" id="filter-tracker-select">
            <option value="">— add —</option>
          </select>
        </div>
        <div class="filter-row">
          <label>Aircraft</label>
          <select class="filter-select" id="filter-aircraft-select">
            <option value="">— add —</option>
          </select>
        </div>
        <div class="filter-row">
          <label>Pilot</label>
          <select class="filter-select" id="filter-pilot-select">
            <option value="">— add —</option>
          </select>
        </div>
        <button class="filter-clear-all btn-secondary" id="filter-clear-all-btn">Clear all</button>
      </div>
    </div>
  `;
}

export function filterScript(): string {
  const markupJson = JSON.stringify(filterMarkup());
  return `
    // ── Filter store ──────────────────────────────────────────────────────────
    const _FILTER_KEY = 'ft_filters_v1';

    const filterStore = {
      load() {
        try {
          const raw = localStorage.getItem(_FILTER_KEY);
          if (raw) {
            const s = JSON.parse(raw);
            return {
              dateFrom:      s.dateFrom      ?? null,
              dateTo:        s.dateTo        ?? null,
              trackerIds:    s.trackerIds    ?? [],
              pilotIds:      s.pilotIds      ?? [],
              aircraftTails: s.aircraftTails ?? [],
            };
          }
        } catch (_) {}
        return { dateFrom: null, dateTo: null, trackerIds: [], pilotIds: [], aircraftTails: [] };
      },

      save(state) {
        try { localStorage.setItem(_FILTER_KEY, JSON.stringify(state)); } catch (_) {}
      },

      matchesFlight(flight, state) {
        if (state.dateFrom) {
          if (flight.start_time < _filterDayStart(state.dateFrom)) return false;
        }
        if (state.dateTo) {
          if (flight.start_time > _filterDayEnd(state.dateTo)) return false;
        }
        if (state.trackerIds.length > 0) {
          if (!state.trackerIds.includes(flight.tracker_id)) return false;
        }
        if (state.pilotIds.length > 0) {
          const pid = flight.pilot_id === null ? '__null__' : flight.pilot_id;
          if (!state.pilotIds.includes(pid)) return false;
        }
        if (state.aircraftTails.length > 0) {
          const tail = flight.aircraft_tail === null ? '__null__' : flight.aircraft_tail;
          if (!state.aircraftTails.includes(tail)) return false;
        }
        return true;
      },
    };

    function _filterGetTzOffset(refUTC) {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: window.APP_SETTINGS.timezone,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
      });
      const parts = Object.fromEntries(
        fmt.formatToParts(refUTC).filter(p => p.type !== 'literal').map(p => [p.type, +p.value])
      );
      return (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second) - refUTC.getTime()) / 1000;
    }

    function _filterDayStart(dateStr) {
      const [y, m, d] = dateStr.split('-').map(Number);
      const ref = new Date(Date.UTC(y, m - 1, d, 9, 0, 0));
      return Math.floor(Date.UTC(y, m - 1, d) / 1000) - _filterGetTzOffset(ref);
    }

    function _filterDayEnd(dateStr) {
      const [y, m, d] = dateStr.split('-').map(Number);
      const ref = new Date(Date.UTC(y, m - 1, d, 20, 0, 0));
      return Math.floor(Date.UTC(y, m - 1, d, 23, 59, 59) / 1000) - _filterGetTzOffset(ref);
    }

    // ── Filter UI ─────────────────────────────────────────────────────────────
    // Set by initFilters(); external code can call refreshFilterDropdowns() after list changes.
    let _filterRebuildDropdowns = () => {};

    function refreshFilterDropdowns() { _filterRebuildDropdowns(); }

    function initFilters(onChange) {
      let _filterState = filterStore.load();

      // Inject the HTML shell into the placeholder div.
      const root = document.getElementById('filter-section-root');
      root.innerHTML = ${markupJson};

      const toggleBtn       = document.getElementById('filter-toggle-btn');
      const filterControls  = document.getElementById('filter-controls');
      const appliedArea     = document.getElementById('applied-filters-area');
      const chipsContainer  = document.getElementById('applied-filters-chips');
      const dateFromEl      = document.getElementById('filter-date-from');
      const dateToEl        = document.getElementById('filter-date-to');
      const trackerSel      = document.getElementById('filter-tracker-select');
      const aircraftSel     = document.getElementById('filter-aircraft-select');
      const pilotSel        = document.getElementById('filter-pilot-select');
      const clearAllBtn     = document.getElementById('filter-clear-all-btn');

      function _countActive(state) {
        let n = 0;
        if (state.dateFrom || state.dateTo) n++;
        n += state.trackerIds.length;
        n += state.aircraftTails.length;
        n += state.pilotIds.length;
        return n;
      }

      function _updateToggleLabel() {
        const n = _countActive(_filterState);
        const labelEl = document.getElementById('filter-toggle-label');
        if (labelEl) labelEl.textContent = 'Filters' + (n > 0 ? ' (' + n + ' active)' : '');
      }

      function _renderChips() {
        const chips = [];
        const s = _filterState;

        if (s.dateFrom || s.dateTo) {
          const from = s.dateFrom || '…';
          const to   = s.dateTo   || '…';
          chips.push({ label: from + ' – ' + to, remove: () => {
            _filterState = { ..._filterState, dateFrom: null, dateTo: null };
            dateFromEl.value = '';
            dateToEl.value   = '';
            _commit();
          }});
        }

        for (const id of s.trackerIds) {
          const t = trackerList.find(x => x.id === id);
          chips.push({ label: 'Tracker: ' + (t ? t.name : id), remove: () => {
            _filterState = { ..._filterState, trackerIds: _filterState.trackerIds.filter(x => x !== id) };
            _commit();
          }});
        }

        for (const tail of s.aircraftTails) {
          const lbl = tail === '__null__' ? 'Unknown Aircraft' : tail;
          chips.push({ label: 'Aircraft: ' + lbl, remove: () => {
            _filterState = { ..._filterState, aircraftTails: _filterState.aircraftTails.filter(x => x !== tail) };
            _commit();
          }});
        }

        for (const pid of s.pilotIds) {
          const p = pilotList.find(x => x.id === pid);
          const lbl = pid === '__null__' ? 'Unknown Pilot' : (p ? p.name : pid);
          chips.push({ label: 'Pilot: ' + lbl, remove: () => {
            _filterState = { ..._filterState, pilotIds: _filterState.pilotIds.filter(x => x !== pid) };
            _commit();
          }});
        }

        chipsContainer.innerHTML = '';
        for (const chip of chips) {
          const span = document.createElement('span');
          span.className = 'filter-chip';
          span.textContent = chip.label + ' ';
          const x = document.createElement('button');
          x.className = 'filter-chip-x';
          x.textContent = '\\xd7';
          x.addEventListener('click', chip.remove);
          span.appendChild(x);
          chipsContainer.appendChild(span);
        }

        const hasChips = chips.length > 0;
        appliedArea.style.display = hasChips ? '' : 'none';
        _updateToggleLabel();
      }

      function _commit() {
        filterStore.save(_filterState);
        _renderChips();
        onChange(_filterState);
      }

      _filterRebuildDropdowns = function() {
        // Tracker options
        const curTrackerIds = new Set(_filterState.trackerIds);
        trackerSel.innerHTML = '<option value="">— add —</option>';
        for (const t of (trackerList || []).filter(t => !t.deleted)) {
          if (curTrackerIds.has(t.id)) continue;
          const opt = document.createElement('option');
          opt.value = String(t.id);
          opt.textContent = t.name;
          trackerSel.appendChild(opt);
        }
        for (const t of (trackerList || []).filter(t => t.deleted)) {
          if (curTrackerIds.has(t.id)) continue;
          const opt = document.createElement('option');
          opt.value = String(t.id);
          opt.textContent = t.name + ' (deleted)';
          trackerSel.appendChild(opt);
        }

        // Aircraft options
        const curTails = new Set(_filterState.aircraftTails);
        aircraftSel.innerHTML = '<option value="">— add —</option>';
        if (!curTails.has('__null__')) {
          const opt = document.createElement('option');
          opt.value = '__null__';
          opt.textContent = 'Unknown Aircraft';
          aircraftSel.appendChild(opt);
        }
        for (const a of (aircraftList || []).filter(a => a.active)) {
          if (curTails.has(a.tail_number)) continue;
          const opt = document.createElement('option');
          opt.value = a.tail_number;
          opt.textContent = a.tail_number;
          aircraftSel.appendChild(opt);
        }

        // Pilot options
        const curPilotIds = new Set(_filterState.pilotIds);
        pilotSel.innerHTML = '<option value="">— add —</option>';
        if (!curPilotIds.has('__null__')) {
          const opt = document.createElement('option');
          opt.value = '__null__';
          opt.textContent = 'Unknown Pilot';
          pilotSel.appendChild(opt);
        }
        for (const p of (pilotList || []).filter(p => p.active)) {
          if (curPilotIds.has(p.id)) continue;
          const opt = document.createElement('option');
          opt.value = String(p.id);
          opt.textContent = p.name;
          pilotSel.appendChild(opt);
        }
      };

      // Restore date inputs from state
      if (_filterState.dateFrom) dateFromEl.value = _filterState.dateFrom;
      if (_filterState.dateTo)   dateToEl.value   = _filterState.dateTo;

      _filterRebuildDropdowns();
      _renderChips();

      // ── Event wiring ────────────────────────────────────────────────────────
      initToggleSection(toggleBtn, filterControls, false);

      function _applyDateChip() {
        const from = dateFromEl.value || null;
        const to   = dateToEl.value   || null;
        if (from !== _filterState.dateFrom || to !== _filterState.dateTo) {
          _filterState = { ..._filterState, dateFrom: from, dateTo: to };
          _commit();
        }
      }

      dateFromEl.addEventListener('change', _applyDateChip);
      dateToEl.addEventListener('change', _applyDateChip);

      trackerSel.addEventListener('change', () => {
        const val = trackerSel.value;
        if (!val) return;
        const id = parseInt(val, 10);
        if (!_filterState.trackerIds.includes(id)) {
          _filterState = { ..._filterState, trackerIds: [..._filterState.trackerIds, id] };
          _commit();
        }
        trackerSel.value = '';
        _filterRebuildDropdowns();
      });

      aircraftSel.addEventListener('change', () => {
        const val = aircraftSel.value;
        if (!val) return;
        if (!_filterState.aircraftTails.includes(val)) {
          _filterState = { ..._filterState, aircraftTails: [..._filterState.aircraftTails, val] };
          _commit();
        }
        aircraftSel.value = '';
        _filterRebuildDropdowns();
      });

      pilotSel.addEventListener('change', () => {
        const val = pilotSel.value;
        if (!val) return;
        const pid = val === '__null__' ? '__null__' : parseInt(val, 10);
        if (!_filterState.pilotIds.includes(pid)) {
          _filterState = { ..._filterState, pilotIds: [..._filterState.pilotIds, pid] };
          _commit();
        }
        pilotSel.value = '';
        _filterRebuildDropdowns();
      });

      clearAllBtn.addEventListener('click', () => {
        _filterState = { dateFrom: null, dateTo: null, trackerIds: [], pilotIds: [], aircraftTails: [] };
        dateFromEl.value = '';
        dateToEl.value   = '';
        _filterRebuildDropdowns();
        _commit();
      });

      // Allow aircraft cards to add filter chips programmatically.
      window._filterAddAircraftTail = function(tail) {
        if (!_filterState.aircraftTails.includes(tail)) {
          _filterState = { ..._filterState, aircraftTails: [..._filterState.aircraftTails, tail] };
          _filterRebuildDropdowns();
          _commit();
        }
      };
      window._filterAddTrackerId = function(id) {
        if (!_filterState.trackerIds.includes(id)) {
          _filterState = { ..._filterState, trackerIds: [..._filterState.trackerIds, id] };
          _filterRebuildDropdowns();
          _commit();
        }
      };
    }
  `;
}
