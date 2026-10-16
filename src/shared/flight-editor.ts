import { icon } from './icons';
import { formControlStyles } from './form-modal';
import { MAX_FLIGHT_TEXT_LENGTH } from './record-limits';

/**
 * The flight editor: a full-screen settings view listing effective flights (filterable,
 * selectable, with bulk actions) and the single-flight form, shared by the dashboard,
 * the analytics page and the duty log. Replaces the dashboard's Bulk Edit and assignment
 * modals and the duty log's own flight form. See docs/flight-editor-plan.md, §4.
 *
 * The view lives in the settings modal (settings.ts places flightEditorMarkup()); the
 * script needs the flight store, flight-edits.ts, form-modal.ts (apiWrite,
 * runFormAction), segmented-control.ts, edit-history.ts, html.ts (escHtml) and
 * tzCalendarScript(), all on both pages.
 */
export function flightEditorMarkup(): string {
  return /* html */ `
          <div class="fe-toolbar">
            <div class="fe-filters">
              <label class="fe-filter"><span>From</span><input type="date" id="fe-from" /></label>
              <label class="fe-filter"><span>To</span><input type="date" id="fe-to" /></label>
              <label class="fe-filter"><span>Aircraft</span><select id="fe-aircraft"></select></label>
              <label class="fe-filter"><span>Pilot</span><select id="fe-pilot"></select></label>
              <label class="fe-show-removed"><input type="checkbox" id="fe-show-removed" />Show removed</label>
            </div>
            <button id="fe-add" class="btn-secondary btn-sm" data-doc-shot="flight-editor.add-flight">${icon('plus', { size: 14 })}Add flight</button>
          </div>
          <div class="fe-body">
            <div class="fe-list-header">
              <label class="fe-select-all"><input type="checkbox" id="fe-select-all" /><span id="fe-count"></span></label>
            </div>
            <div id="fe-list" class="fe-list"></div>
          </div>
          <div id="fe-selection" class="fe-selection" hidden>
            <span id="fe-selection-count" class="fe-selection-count"></span>
            <select id="fe-set-aircraft" class="fe-action-select" aria-label="Set aircraft"></select>
            <select id="fe-set-pilot" class="fe-action-select" aria-label="Set pilot"></select>
            <button class="btn-secondary btn-sm" data-fe-bulk="part91">Part 91</button>
            <button class="btn-secondary btn-sm" data-fe-bulk="part135">Part 135</button>
            <button class="btn-danger btn-sm" data-fe-bulk="remove">Remove</button>
            <button class="btn-secondary btn-sm" data-fe-bulk="restore">Restore</button>
            <button class="btn-secondary btn-sm" data-fe-bulk="clear">Clear</button>
            <span id="fe-selection-error" class="fe-selection-error" role="alert"></span>
          </div>`;
}

export function flightEditorStyles(): string {
  return `
    /* The editor opens full screen (data-fullscreen); past 64rem it keeps a readable
       measure, centered, like the duty log. */
    .fe-toolbar {
      display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.5rem 0.75rem;
      padding: 0.6rem max(1rem, calc((100% - 64rem) / 2 + 1rem));
      border-bottom: 1px solid var(--border);
      position: sticky; top: 0; z-index: 1;
      background: var(--surface-1);
    }
    .fe-filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.5rem 0.75rem; flex: 1 1 30rem; }
    .fe-filter { display: flex; flex-direction: column; gap: 0.2rem; flex: 1 1 8rem; max-width: 14rem; }
    .fe-filter > span {
      font-size: var(--size-2xs); font-weight: var(--weight-semibold);
      text-transform: uppercase; letter-spacing: var(--tracking-caps); color: var(--text-muted);
    }
    ${formControlStyles('.fe-filter input, .fe-filter select, .fe-action-select')}
    .fe-filter input, .fe-filter select, .fe-action-select { padding: 0.25rem 0.4rem; font-size: var(--size-sm); }
    .fe-show-removed, .fe-select-all {
      display: inline-flex; align-items: center; gap: 0.35rem;
      font-size: var(--size-sm); color: var(--text-secondary); cursor: pointer;
    }
    .fe-show-removed { min-height: var(--control-h-sm); }

    .fe-body { padding: 0.5rem 1rem 1rem; max-width: 64rem; margin: 0 auto; }
    .fe-list-header { padding: 0.25rem 0.5rem 0.5rem; border-bottom: 1px solid var(--border); }
    .fe-empty { padding: 1rem 0.5rem; font-size: var(--size-sm); color: var(--text-muted); }

    .fe-row {
      display: grid;
      grid-template-columns: auto 6.5rem 6.5rem minmax(0, 1fr) 5rem minmax(0, 8rem) 3rem;
      align-items: baseline; gap: 0 0.6rem;
      padding: 0.45rem 0.5rem;
      border-bottom: 1px solid var(--border-subtle);
      font-size: var(--size-sm); color: var(--text-primary);
      cursor: pointer;
    }
    .fe-row:hover { background: var(--surface-hover); }
    .fe-row-readonly { cursor: default; }
    .fe-row-readonly:hover { background: none; }
    .fe-open {
      background: none; border: none; padding: 0; margin: 0;
      font: inherit; color: inherit; text-align: left; cursor: pointer;
      border-radius: var(--radius-xs);
    }
    .fe-open:hover { color: var(--accent-text); }
    .fe-open:focus-visible { outline: none; box-shadow: var(--ring-focus); }
    .fe-row.fe-selected { background: var(--accent-surface); }
    .fe-row-removed > :not(.fe-check) { opacity: 0.5; }
    .fe-row-removed .fe-route { text-decoration: line-through; }
    .fe-check { align-self: center; }
    .fe-date { font-weight: var(--weight-semibold); white-space: nowrap; }
    .fe-times, .fe-dur { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--text-secondary); }
    .fe-dur { text-align: right; }
    .fe-route { overflow-wrap: anywhere; }
    .fe-ac, .fe-pilot { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fe-row .flight-remarks { grid-column: 4 / -1; }
    .fe-row-unmatched { cursor: default; color: var(--text-secondary); }
    .fe-row-unmatched .fe-unmatched-text { grid-column: 2 / -1; }
    .fe-link-btn {
      background: none; border: none; padding: 0; margin-left: 0.4rem;
      font: inherit; color: var(--danger-fg); text-decoration: underline; cursor: pointer;
    }

    /* Narrow: date and times stack, route takes the row, aircraft/pilot below it. */
    .fe-body { container-type: inline-size; }
    @container (max-width: 40rem) {
      .fe-row { grid-template-columns: auto minmax(0, 1fr) auto; }
      .fe-row > .fe-date { grid-column: 2; }
      .fe-row > .fe-dur { grid-column: 3; grid-row: 1; }
      .fe-row > .fe-times, .fe-row > .fe-route { grid-column: 2 / -1; }
      .fe-row > .fe-ac, .fe-row > .fe-pilot { grid-column: 2 / -1; font-size: var(--size-xs); }
      .fe-row .flight-remarks { grid-column: 2 / -1; }
    }

    .fe-selection {
      position: sticky; bottom: 0; z-index: 1;
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
      padding: 0.6rem max(1rem, calc((100% - 64rem) / 2 + 1rem));
      padding-bottom: max(0.6rem, env(safe-area-inset-bottom));
      background: var(--surface-1);
      border-top: 1px solid var(--border);
      box-shadow: var(--shadow-lg);
    }
    .fe-selection[hidden], .fe-selection [hidden], .fe-toolbar [hidden] { display: none; }
    .fe-selection-count { font-size: var(--size-sm); font-weight: var(--weight-semibold); color: var(--text-primary); margin-right: 0.25rem; }
    .fe-action-select { width: auto; }
    .fe-selection-error { font-size: var(--size-xs); color: var(--danger-fg); flex-basis: 100%; }
    .fe-selection-error:empty { display: none; }

    .fe-toolbar input[type="checkbox"], .fe-body input[type="checkbox"] {
      accent-color: var(--accent); width: 16px; height: 16px; margin: 0; cursor: pointer;
    }
  `;
}

export function flightEditorScript(): string {
  return `
    // ── Flight editor ─────────────────────────────────────────────────────────

    const _FE_ICON_EDIT = ${JSON.stringify(icon('pencil', { size: 13 }))};
    let _feCanEdit = false;
    const _feSelected = new Set();   // effective flight ids
    let _feShown = [];               // flights currently listed
    let _feNamedPoints = null;       // [{ name, lat, lon }], loaded on first use
    let _feFormLoading = false;      // openFlightForm() is waiting for the named points

    // Opens the editor, optionally filtered ({ pilotId, from, to }: YYYY-MM-DD dates).
    async function openFlightEditor({ pilotId = null, from = '', to = '' } = {}) {
      if (document.getElementById('settings-modal').classList.contains('hidden')) openSettings();
      _settingsNavigateTo('settings-view-flight-editor', 'Edit flights');
      _feSelected.clear();
      document.getElementById('fe-from').value = from;
      document.getElementById('fe-to').value = to;
      document.getElementById('fe-show-removed').checked = false;
      _feFillFilterSelects(pilotId);
      const user = await _loadSettingsUser();
      _feCanEdit = user?.role === 'admin';
      document.getElementById('fe-add').hidden = !_feCanEdit;
      _feRender();
    }

    function _feFillFilterSelects(pilotId) {
      document.getElementById('fe-aircraft').innerHTML =
        '<option value="">All aircraft</option><option value="__null__">Unknown aircraft</option>' +
        aircraftList.map(a => settingsAircraftOptionHtml(a, null)).join('');
      document.getElementById('fe-pilot').innerHTML =
        '<option value="">All pilots</option><option value="__null__">Unknown pilot</option>' +
        pilotList.map(p => settingsPilotOptionHtml(p, pilotId)).join('');
      document.getElementById('fe-set-aircraft').innerHTML =
        '<option value="">Set aircraft…</option><option value="__null__">Unknown</option>' +
        aircraftList.filter(a => a.active).map(a => settingsAircraftOptionHtml(a, null)).join('');
      document.getElementById('fe-set-pilot').innerHTML =
        '<option value="">Set pilot…</option><option value="__null__">Unknown</option>' +
        pilotList.filter(p => p.active).map(p => settingsPilotOptionHtml(p, null)).join('');
    }

    // The toolbar as a filters.ts state, so the editor filters the way the flight list does.
    function _feFilterState() {
      const ac = document.getElementById('fe-aircraft').value;
      const p = document.getElementById('fe-pilot').value;
      return {
        dateFrom: document.getElementById('fe-from').value || null,
        dateTo: document.getElementById('fe-to').value || null,
        trackerIds: [],
        aircraftTails: ac ? [ac] : [],
        pilotIds: p ? [p === '__null__' ? '__null__' : parseInt(p, 10)] : [],
      };
    }

    function _feIsOpen() {
      return document.getElementById('settings-view-flight-editor').classList.contains('settings-view-active');
    }

    function _feRender() {
      if (!_feIsOpen()) return;
      const state = _feFilterState();
      const showRemoved = document.getElementById('fe-show-removed').checked;
      // Newest first, like the flight list.
      _feShown = flightStore.getCompleted(undefined, { includeRemoved: showRemoved })
        .filter(f => filterStore.matchesFlight(f, state)).reverse();
      const shownIds = new Set(_feShown.map(f => f.id));
      for (const id of [..._feSelected]) if (!shownIds.has(id)) _feSelected.delete(id);

      // Corrections that apply to no flight here, in the date range: their flight is gone,
      // or their tracker's flights aren't loaded (a deleted or inactive tracker).
      const inRange = e => filterStore.matchesFlight(
        { start_time: e.flight_start_time, tracker_id: e.tracker_id, pilot_id: null, aircraft_tail: null },
        { ...state, pilotIds: [], aircraftTails: [] });
      const unapplied = [
        ...flightStore.getUnmatched().filter(inRange).map(e => [e, 'tracked flight no longer found']),
        ...flightStore.getUnplaced().filter(inRange).map(e => [e, _feTrackerNote(e.tracker_id)]),
      ];

      const list = document.getElementById('fe-list');
      // The list is rebuilt on every store change (a poll's new flights too), so keep the
      // keyboard focus where it was.
      const focused = list.contains(document.activeElement) ? document.activeElement : null;
      const focusKey = focused && focused.closest('[data-fe-id]')
        ? [focused.closest('[data-fe-id]').dataset.feId, focused.classList.contains('fe-check') ? '.fe-check' : '.fe-open'] : null;
      let html = '';
      for (const [e, why] of unapplied) {
        html += '<div class="fe-row fe-row-unmatched"><span></span><span class="fe-unmatched-text">' +
          FLIGHT_CHIP_UNMATCHED + ' ' + escHtml(tzDateLabel(unixToTzDateStr(e.flight_start_time)) + ' ' +
          unixToTzTime(e.flight_start_time)) + ': ' + escHtml(why) + '; its corrections (' +
          escHtml(flightEntrySummary(e)) + ') aren’t applied.' +
          (_feCanEdit ? '<button class="fe-link-btn" data-fe-delete-entry="' + e.id + '">Delete</button>' : '') +
          '</span></div>';
      }
      for (const f of _feShown) html += _feRowHtml(f);
      if (!html) html = '<div class="fe-empty">No flights match these filters.</div>';
      list.innerHTML = html;
      if (focusKey) {
        const el = list.querySelector('[data-fe-id="' + focusKey[0] + '"] ' + focusKey[1]);
        if (el) el.focus();
      }
      document.getElementById('fe-count').textContent = _feShown.length + (_feShown.length === 1 ? ' flight' : ' flights');
      document.getElementById('fe-select-all').disabled = !_feCanEdit || _feShown.length === 0;
      _feSyncSelection();
    }

    // Why a tracker's corrections apply to nothing on this page.
    function _feTrackerNote(trackerId) {
      const t = trackerList.find(x => x.id === trackerId);
      if (!t) return 'tracker no longer exists';
      return (t.deleted ? 'tracker ' + t.name + ' was deleted' : 'tracker ' + t.name + ' is inactive');
    }

    // A row: its checkbox selects it; the date button (or a click anywhere else on the
    // row) opens the flight form, for an editor. For anyone else the row is read-only and
    // the date plain text.
    function _feRowHtml(f) {
      const removed = !!(f.edit && f.edit.excluded);
      const manual = !!(f.edit && f.edit.manual);
      const sel = _feSelected.has(f.id);
      const secs = Math.max(0, f.end_time - f.start_time);
      return '<div class="fe-row' + (removed ? ' fe-row-removed' : '') + (sel ? ' fe-selected' : '') + (_feCanEdit ? '' : ' fe-row-readonly') +
          '" data-fe-id="' + f.id + '">' +
        '<input type="checkbox" class="fe-check" aria-label="Select flight"' + (sel ? ' checked' : '') + (_feCanEdit ? '' : ' disabled') + '>' +
        (_feCanEdit
          ? '<button type="button" class="fe-date fe-open" aria-label="' +
            escHtml('Edit flight ' + tzDateLabel(unixToTzDateStr(f.start_time)) + ' ' + unixToTzTime(f.start_time)) + '">' +
            escHtml(tzDateLabel(unixToTzDateStr(f.start_time))) + '</button>'
          : '<span class="fe-date">' + escHtml(tzDateLabel(unixToTzDateStr(f.start_time))) + '</span>') +
        '<span class="fe-times">' + unixToTzTime(f.start_time) + flightEditedMark(f, ['start_time']) + '–' +
          unixToTzTime(f.end_time) + flightEditedMark(f, ['end_time']) + '</span>' +
        '<span class="fe-route">' + escHtml(f.origin_label || '—') + flightEditedMark(f, ['origin_label']) + ' → ' +
          escHtml(f.destination_label || '—') + flightEditedMark(f, ['destination_label']) +
          (manual ? FLIGHT_CHIP_MANUAL : '') + (removed ? FLIGHT_CHIP_REMOVED : '') + '</span>' +
        '<span class="fe-ac">' + escHtml(f.aircraft_tail || '—') + '</span>' +
        '<span class="fe-pilot">' + escHtml(f.pilot_name || '—') + '</span>' +
        '<span class="fe-dur">' + fmtDuration(secs) + '</span>' +
        flightRemarksHtml(f) +
      '</div>';
    }

    function _feSyncSelection() {
      const n = _feSelected.size;
      const all = document.getElementById('fe-select-all');
      all.checked = n > 0 && n === _feShown.length;
      all.indeterminate = n > 0 && n < _feShown.length;
      document.getElementById('fe-selection').hidden = n === 0;
      document.getElementById('fe-selection-count').textContent = n + ' selected';
      const sel = _feShown.filter(f => _feSelected.has(f.id));
      document.querySelector('[data-fe-bulk="restore"]').hidden = !sel.some(f => f.edit && f.edit.excluded);
      document.querySelector('[data-fe-bulk="remove"]').hidden = !sel.some(f => !(f.edit && f.edit.excluded));
    }

    document.getElementById('fe-list').addEventListener('click', e => {
      const del = e.target.closest('[data-fe-delete-entry]');
      if (del) {
        deleteUnappliedCorrections(+del.dataset.feDeleteEntry).then(done => { if (done) _feRender(); });
        return;
      }
      const row = e.target.closest('[data-fe-id]');
      if (!row) return;
      const id = +row.dataset.feId;
      if (e.target.classList.contains('fe-check')) {
        if (e.target.checked) _feSelected.add(id); else _feSelected.delete(id);
        row.classList.toggle('fe-selected', e.target.checked);
        _feSyncSelection();
        return;
      }
      // The form edits, so only an editor opens it.
      const f = _feCanEdit && _feShown.find(x => x.id === id);
      if (f) openFlightForm(f);
    });
    document.getElementById('fe-select-all').addEventListener('change', e => {
      _feSelected.clear();
      if (e.target.checked) _feShown.forEach(f => _feSelected.add(f.id));
      _feRender();
    });
    ['fe-from', 'fe-to', 'fe-aircraft', 'fe-pilot', 'fe-show-removed'].forEach(id =>
      document.getElementById(id).addEventListener('change', _feRender));
    document.getElementById('fe-add').addEventListener('click', () => {
      const p = document.getElementById('fe-pilot').value;
      openFlightForm(null, { pilotId: p && p !== '__null__' ? parseInt(p, 10) : null });
    });
    // Corrections saved from the form (or a poll's new flights) show up in the open list.
    flightStore.onChange(_feRender);

    // The bulk route's key for a flight: its tracker's original start time, or its row.
    function _feFlightRef(f) {
      if (f.tracker_id == null) return { entry_id: f.edit.entry.id };
      const start = f.edit && 'start_time' in f.edit.original ? f.edit.original.start_time : f.start_time;
      return { tracker_id: f.tracker_id, flight_start_time: start };
    }

    // Aircraft/pilot for tracked flights (by id) and manual flights (by row) in one request.
    function flightAssign(flights, assign) {
      const tracked = flights.filter(f => f.tracker_id != null);
      const manual = flights.filter(f => f.tracker_id == null);
      return apiWrite('PUT', '/api/flights/assignment', {
        flight_ids: tracked.map(f => f.id), entry_ids: manual.map(f => f.edit.entry.id), ...assign,
      });
    }

    function flightSetFlags(flights, set) {
      return apiWrite('POST', '/api/flight-corrections/bulk', { flights: flights.map(_feFlightRef), set });
    }

    async function _feBulk(fn) {
      const controls = [...document.querySelectorAll('#fe-selection button, #fe-selection select')];
      await runFormAction(controls, document.getElementById('fe-selection-error'),
        () => fn(_feShown.filter(f => _feSelected.has(f.id))));
      // Best effort: the write went through either way, and the next poll catches up.
      await flightStore.refresh().catch(() => {});
      _feRender();
    }

    document.getElementById('fe-set-aircraft').addEventListener('change', e => {
      const v = e.target.value;
      e.target.value = '';
      if (v) _feBulk(sel => flightAssign(sel, { aircraft_tail: v === '__null__' ? null : v }));
    });
    document.getElementById('fe-set-pilot').addEventListener('change', e => {
      const v = e.target.value;
      e.target.value = '';
      if (v) _feBulk(sel => flightAssign(sel, { pilot_id: v === '__null__' ? null : parseInt(v, 10) }));
    });
    document.getElementById('fe-selection').addEventListener('click', e => {
      const btn = e.target.closest('[data-fe-bulk]');
      if (!btn) return;
      const act = btn.dataset.feBulk;
      if (act === 'clear') { _feSelected.clear(); _feRender(); return; }
      if (act === 'remove' && !confirm('Remove ' + _feSelected.size + ' flight(s)? They’re hidden everywhere except here, with Show removed.')) return;
      const set = { part91: { part91: true }, part135: { part91: false }, remove: { excluded: true }, restore: { excluded: false } }[act];
      _feBulk(sel => flightSetFlags(sel, set));
    });

    // Deletes corrections that apply to no flight (row entryId), once confirmed, then
    // refreshes the flight store along with reload() (the caller's own data, e.g. the duty
    // log's). Returns whether the corrections were deleted; a failed delete is reported and
    // refreshes nothing. Shared by the flight editor and the duty log.
    async function deleteUnappliedCorrections(entryId, reload) {
      if (!confirm('Delete these corrections? The flight they belonged to is no longer in the tracker’s history.')) return false;
      try {
        await apiWrite('DELETE', '/api/flight-corrections/' + entryId);
      } catch (e) {
        alert('Delete failed: ' + (e && e.message ? e.message : String(e)));
        return false;
      }
      await Promise.all([flightStore.refresh().catch(() => {}), reload ? reload() : null]);
      return true;
    }

    async function _feLoadNamedPoints() {
      if (_feNamedPoints) return _feNamedPoints;
      try {
        const resp = await fetch('/api/named-points');
        const data = resp.ok ? await resp.json() : { features: [] };
        _feNamedPoints = data.features.map(ft => ({ name: ft.properties.name, lon: ft.geometry.coordinates[0], lat: ft.geometry.coordinates[1] }));
      } catch (_) { return []; }
      return _feNamedPoints;
    }

    // ── Flight form ──

    // f again from the store after a refresh: the same tracker flight (by its tracker's
    // start time, which keys its corrections) or manual flight (by row), or null if it's gone.
    function _feFindFlight(f) {
      const ref = _feFlightRef(f);
      return flightStore.getAll(undefined, { includeRemoved: true }).find(x =>
        ref.entry_id != null
          ? x.tracker_id == null && x.edit && x.edit.entry && x.edit.entry.id === ref.entry_id
          : x.tracker_id === ref.tracker_id && _feFlightRef(x).flight_start_time === ref.flight_start_time) || null;
    }

    // Edits flight f (an effective flight: tracked or manual), or adds a manual flight
    // when f is null (on dateKey, today by default, for pilotId). Saves through
    // /api/flight-corrections (corrections, Part 91, remark, removal) and
    // /api/flights/assignment (aircraft, pilot), then refreshes the flight store, which
    // re-renders every open view.
    //
    // A save, revert or delete sends the store's history id as base_history_id: f is the
    // store's as of it, so a change since (another admin's, or this flight's in another
    // tab) is refused (src/index.ts, "Edit conflicts") and the form offers to reload.
    async function openFlightForm(f, { dateKey = null, pilotId = null } = {}) {
      const baseHistoryId = flightStore.historyId();
      const isNew = !f;
      const tracked = !!(f && f.tracker_id != null);
      const edit = f ? f.edit : null;
      const entry = edit ? edit.entry : null;
      const removed = !!(edit && edit.excluded);
      // The tracker's own values: the effective flight with its corrections undone.
      const orig = tracked ? { ...f, ...(edit ? edit.original : {}) } : null;
      const curPilot = f ? f.pilot_id : pilotId;
      const curTail = f ? f.aircraft_tail : null;
      // The first open waits for the named points; a second click meanwhile (a double
      // click) would open the form twice, so it's dropped.
      if (_feFormLoading) return;
      _feFormLoading = true;
      let namedPoints;
      try { namedPoints = await _feLoadNamedPoints(); } finally { _feFormLoading = false; }

      const aircraftOptions = aircraftList
        .filter(a => a.active || a.tail_number === curTail)
        .map(a => settingsAircraftOptionHtml(a, curTail)).join('');
      const pilotOptions = pilotList
        .filter(p => p.active || p.id === curPilot)
        .map(p => settingsPilotOptionHtml(p, curPilot)).join('');
      const hint = field => tracked && flightFieldEdited(f, field)
        ? '<div class="form-field-original">Tracker: ' + escHtml(flightOriginalText(field, orig[field])) + '</div>' : '';
      const date = f ? unixToTzDateStr(f.start_time) : (dateKey || unixToTzDateStr(Math.floor(Date.now() / 1000)));

      const { modal, close, isDirty } = openFormModal({
        id: 'flight-form-modal',
        className: 'form-modal-wide',
        title: isNew ? 'Add flight' : (tracked ? 'Edit flight' : 'Edit manual flight'),
        bodyHtml:
          (tracked
            ? '<p class="form-modal-hint">Corrections show everywhere except the recorded track. Tracker: ' +
              escHtml(tzDateLabel(unixToTzDateStr(orig.start_time)) + ', ' + unixToTzTime(orig.start_time) + '–' +
              unixToTzTime(orig.end_time) + ', ' + (orig.origin_label || '—') + ' → ' + (orig.destination_label || '—')) + '.</p>'
            : '') +
          (removed ? '<p class="form-modal-hint">' + FLIGHT_CHIP_REMOVED + ' Hidden everywhere except the flight editor.</p>' : '') +
          '<datalist id="fe-f-places">' + namedPoints.map(p => '<option value="' + escHtml(p.name) + '">').join('') + '</datalist>' +
          '<div class="form-field"><label for="fe-f-date">Date</label>' +
            '<input type="date" id="fe-f-date" value="' + escHtml(date) + '"></div>' +
          '<div class="form-field-row">' +
            '<div class="form-field"><label for="fe-f-dep">Dep</label>' +
              '<input type="time" id="fe-f-dep" value="' + (f ? unixToTzTime(f.start_time) : '') + '">' + hint('start_time') + '</div>' +
            '<div class="form-field"><label for="fe-f-arr">Arr</label>' +
              '<input type="time" id="fe-f-arr" value="' + (f ? unixToTzTime(f.end_time) : '') + '">' + hint('end_time') + '</div>' +
          '</div>' +
          '<p class="form-modal-hint" data-fe-next-day aria-live="polite"></p>' +
          '<div class="form-field-row">' +
            '<div class="form-field"><label for="fe-f-origin">Origin</label>' +
              '<input type="text" id="fe-f-origin" list="fe-f-places" autocomplete="off" maxlength="${MAX_FLIGHT_TEXT_LENGTH}" value="' + escHtml((f && f.origin_label) || '') + '">' + hint('origin_label') + '</div>' +
            '<div class="form-field"><label for="fe-f-dest">Dest</label>' +
              '<input type="text" id="fe-f-dest" list="fe-f-places" autocomplete="off" maxlength="${MAX_FLIGHT_TEXT_LENGTH}" value="' + escHtml((f && f.destination_label) || '') + '">' + hint('destination_label') + '</div>' +
          '</div>' +
          '<div class="form-field-row">' +
            '<div class="form-field"><label for="fe-f-aircraft">Aircraft</label>' +
              '<select id="fe-f-aircraft"><option value="">Unknown</option>' + aircraftOptions + '</select></div>' +
            '<div class="form-field"><label for="fe-f-pilot">Pilot</label>' +
              '<select id="fe-f-pilot">' + (tracked ? '<option value="">Unknown</option>' : (curPilot == null ? '<option value="">Choose…</option>' : '')) +
              pilotOptions + '</select></div>' +
          '</div>' +
          // Pay only applies to Part 91 (Part 135 is flying for compensation), so it shows
          // only while Part 91 is picked.
          '<div class="form-field-row">' +
            '<div class="form-field"><span class="form-field-label" id="fe-f-part-label">Operated under</span>' +
              segmentedHtml('part', [['135', 'Part 135'], ['91', 'Part 91', 'flight-editor.part91']], edit && edit.part91 ? '91' : '135', { labelledBy: 'fe-f-part-label' }) + '</div>' +
            '<div class="form-field" data-fe-pay' + (edit && edit.part91 ? '' : ' hidden') + '><span class="form-field-label" id="fe-f-pay-label">Pay</span>' +
              segmentedHtml('pay', [['paid', 'Paid'], ['unpaid', 'Unpaid']], edit && edit.unpaid ? 'unpaid' : 'paid', { labelledBy: 'fe-f-pay-label' }) + '</div>' +
          '</div>' +
          '<div class="form-field"><label for="fe-f-remark">Remark</label>' +
            '<input type="text" id="fe-f-remark" placeholder="e.g. Training" maxlength="${MAX_FLIGHT_TEXT_LENGTH}" value="' + escHtml((edit && edit.remark) || '') + '"></div>' +
          '<p class="form-modal-hint" data-fe-last-edit></p>' +
          '<div class="form-modal-error" role="alert"></div>',
        footerHtml:
          (!isNew ? (removed
            ? '<button class="btn-secondary btn-md" data-act="restore">Restore</button>'
            : '<button class="btn-danger btn-md" data-act="remove">Remove from log</button>') : '') +
          (tracked && entry ? '<button class="btn-secondary btn-md" data-act="revert">Revert to tracker</button>' : '') +
          (!isNew && !tracked ? '<button class="btn-danger btn-md" data-act="delete">Delete</button>' : '') +
          '<span class="form-modal-footer-spacer"></span>' +
          '<button class="btn-secondary btn-md" data-act="cancel">Cancel</button>' +
          '<button class="btn-primary btn-md" data-act="save">Save</button>',
      });
      modal.querySelector('.form-modal-panel').dataset.docShot = 'flight-editor.flight-form';

      const $ = sel => modal.querySelector(sel);
      const getPart = wireSegmented(modal, 'part', part => { $('[data-fe-pay]').hidden = part !== '91'; });
      const getPay = wireSegmented(modal, 'pay');
      const errorEl = $('.form-modal-error');
      // Reload (an edit conflict): the flight again from a refreshed store, in a new form.
      async function reload() {
        await flightStore.refresh().catch(() => {});
        const fresh = _feFindFlight(f);
        if (fresh) openFlightForm(fresh);
        else errorEl.textContent = 'This flight is no longer in the log.';
      }
      const onConflict = conflict => showEditConflict(errorEl, conflict, { reload, changed: isDirty });
      // A tracked flight's corrections are keyed by its tracker's start time, so their
      // history survives a revert; a manual flight's by its row.
      // Its aircraft/pilot history (migration 0004) shares the corrections' key.
      // A change newer than the store's copy is shown as a conflict right away, rather
      // than after the user has made their edits.
      const lastEdit = tracked ? showLastEdit($('[data-fe-last-edit]'), ['flight_corrections', 'flight_assignment'], orig.tracker_id + '/' + orig.start_time)
        : entry ? showLastEdit($('[data-fe-last-edit]'), 'flight_corrections', 'manual/' + entry.id) : null;
      if (lastEdit) lastEdit.then(h => { if (h && h.id > baseHistoryId && !errorEl.textContent) onConflict(h); });
      const buttons = [...modal.querySelectorAll('.form-modal-footer button')];
      const btn = act => modal.querySelector('[data-act="' + act + '"]');
      btn('cancel').addEventListener('click', close);
      const deleteUrl = () => '/api/flight-corrections/' + entry.id + '?base_history_id=' + baseHistoryId;

      async function save(fn) {
        if (!await runFormAction(buttons, errorEl, fn, onConflict)) return;
        // Saved: close whatever the refresh does, so a failed refresh can't invite a second
        // save (a duplicate manual flight). The next poll catches up.
        close();
        await flightStore.refresh().catch(() => {});
      }

      // A label's named-point coordinates (manual flights), or nulls.
      function coords(label) {
        const p = label && namedPoints.find(n => n.name === label);
        return p ? [p.lat, p.lon] : [null, null];
      }

      // Whether the form's times t change the flight's: always for a manual flight; for a
      // tracked one, not when they're the tracker's to the minute (flightTrackedTimes()), so
      // a tracker's own overlong flight can still take a remark or Part 91, as the server
      // allows.
      const timesChanged = t => {
        if (!tracked) return true;
        const c = flightTrackedTimes(t, orig);
        return c.start_time != null || c.end_time != null;
      };

      // The Date, Dep and Arr fields as flightFormTimes() reads them (an arrival before the
      // departure is the next day), or null while one is empty.
      function readTimes() {
        const d = $('#fe-f-date').value, dep = $('#fe-f-dep').value, arr = $('#fe-f-arr').value;
        return d && dep && arr ? flightFormTimes(d, dep, arr) : null;
      }
      // "Arrives the next day" under the times whenever the arrival rolls over.
      const nextDayHint = $('[data-fe-next-day]');
      function showNextDay() {
        const t = readTimes();
        nextDayHint.textContent = t ? t.hint : '';
      }
      ['#fe-f-date', '#fe-f-dep', '#fe-f-arr'].forEach(sel => {
        $(sel).addEventListener('input', showNextDay);
        $(sel).addEventListener('change', showNextDay);
      });
      showNextDay();

      // The form's state as epochs/labels, or an error message.
      function readForm() {
        const t = readTimes();
        if (!t) return 'Enter the date, departure and arrival times.';
        // A manual flight needs an arrival after its departure; a tracked one can land in
        // the minute it took off (a flight under a minute), and then saving it mustn't turn
        // into a 24-hour correction.
        if (t.secs === 0 && !tracked) return 'The arrival time is the same as the departure.';
        if (t.tooLong && timesChanged(t)) {
          return 'A flight can’t be longer than ' + FLIGHT_MAX_SECS / 3600 + ' hours. Check the departure and arrival times ' +
            '(an arrival before the departure is the next day).';
        }
        return {
          start_time: t.start_time, end_time: t.end_time,
          origin_label: $('#fe-f-origin').value.trim() || null,
          destination_label: $('#fe-f-dest').value.trim() || null,
          aircraft_tail: $('#fe-f-aircraft').value || null,
          pilot_id: $('#fe-f-pilot').value ? parseInt($('#fe-f-pilot').value, 10) : null,
          part91: getPart() === '91',
          unpaid: getPart() === '91' && getPay() === 'unpaid',
          remark: $('#fe-f-remark').value.trim() || null,
        };
      }

      btn('save').addEventListener('click', () => {
        const v = readForm();
        if (typeof v === 'string') { errorEl.textContent = v; return; }
        // A long flight is most likely a mistyped time read as the next day.
        const t = readTimes();
        if (t.long && timesChanged(t) && !confirm('This flight is ' + fmtDuration(t.secs) + ' long' + (t.nextDay ? ', arriving the next day' : '') +
          '. Save it?')) return;
        save(async () => {
          if (!tracked) {
            if (v.pilot_id == null) throw new Error('Choose a pilot.');
            const [startLat, startLon] = coords(v.origin_label);
            const [endLat, endLon] = coords(v.destination_label);
            const body = { ...v, excluded: removed, start_lat: startLat, start_lon: startLon, end_lat: endLat, end_lon: endLon };
            if (entry) await apiWrite('PUT', '/api/flight-corrections/' + entry.id, { ...body, base_history_id: baseHistoryId });
            else await apiWrite('POST', '/api/flight-corrections', body);
            return;
          }
          // Only what differs from the tracker is stored (the server drops a row left
          // empty); times compare to the minute (flightTrackedTimes()).
          // The aircraft/pilot change goes in the same request, so the server writes it
          // with the correction in one batch.
          const times = flightTrackedTimes(v, orig);
          const assign = {};
          if (v.aircraft_tail !== (orig.aircraft_tail || null)) assign.aircraft_tail = v.aircraft_tail;
          if (v.pilot_id !== (orig.pilot_id ?? null)) assign.pilot_id = v.pilot_id;
          await apiWrite('POST', '/api/flight-corrections', {
            tracker_id: orig.tracker_id, flight_start_time: orig.start_time,
            start_time: times.start_time, end_time: times.end_time,
            origin_label: v.origin_label === (orig.origin_label || null) ? null : v.origin_label,
            destination_label: v.destination_label === (orig.destination_label || null) ? null : v.destination_label,
            part91: v.part91, unpaid: v.unpaid, remark: v.remark, excluded: removed,
            assign: Object.keys(assign).length ? assign : undefined,
            base_history_id: baseHistoryId,
          });
        });
      });

      btn('remove')?.addEventListener('click', () => {
        if (!confirm('Remove this flight? It’s hidden everywhere (flight list, map, analytics, maintenance, duty log) ' +
          'except the flight editor with Show removed, where it can be restored.')) return;
        save(() => flightSetFlags([f], { excluded: true }));
      });
      btn('restore')?.addEventListener('click', () => save(() => flightSetFlags([f], { excluded: false })));
      btn('revert')?.addEventListener('click', () => {
        if (!confirm('Drop this flight’s corrections, Part 91 and unpaid marks and remark, and show it as the tracker recorded it?')) return;
        save(() => apiWrite('DELETE', deleteUrl()));
      });
      btn('delete')?.addEventListener('click', () => {
        if (!confirm('Delete this manual flight?')) return;
        save(() => apiWrite('DELETE', deleteUrl()));
      });
    }
  `;
}
