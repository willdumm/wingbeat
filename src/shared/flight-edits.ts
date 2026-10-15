import { statusChip } from './status';
import { MAX_FLIGHT_SECS } from './record-limits';

/**
 * The marks every flight view shares: † on a corrected value (the tracker's value in its
 * title), the "Manual"/"Removed"/"Not found" chips and the remarks line under a flight.
 */
export function flightEditsStyles(): string {
  return `
    .flight-edited {
      color: var(--accent-text); font-weight: var(--weight-bold);
      margin-left: 1px; cursor: help;
    }
    .flight-chip { margin-left: 0.35rem; vertical-align: 1px; }
    .flight-remarks {
      font-size: var(--size-2xs); color: var(--text-muted); font-style: italic;
      margin-top: 0.1rem;
    }
  `;
}

/**
 * Flight corrections (flight_corrections rows) applied to tracked flights, so every page
 * shows the same corrected flights. See docs/flight-editor-plan.md.
 *
 * Takes data as arguments and touches no page state, so the flight store
 * (flight-store.ts), the duty log and the docs-site showcase all call it the same way.
 */
export function flightEditsScript(): string {
  return `
    // ── Flight corrections ────────────────────────────────────────────────────

    // Tracked-flight fields a row can correct (NULL = the tracker's value).
    const FLIGHT_EDIT_FIELDS = ['start_time', 'end_time', 'origin_label', 'destination_label'];
    const FLIGHT_EDIT_FIELD_NAMES = { start_time: 'Dep', end_time: 'Arr', origin_label: 'Origin', destination_label: 'Dest' };
    const FLIGHT_CHIP_MANUAL    = ${JSON.stringify(statusChip('Manual', 'neutral', 'wb-chip--sm flight-chip'))};
    const FLIGHT_CHIP_REMOVED   = ${JSON.stringify(statusChip('Removed', 'danger', 'wb-chip--sm flight-chip'))};
    const FLIGHT_CHIP_UNMATCHED = ${JSON.stringify(statusChip('Not found', 'warn', 'wb-chip--sm flight-chip'))};

    // HTML-escapes text (null/undefined → '') for markup and attribute values. The one
    // escape helper for the flight views, the duty log and the alerts.
    function escHtml(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Applies entries (GET /api/flight-corrections rows) to flights (flight store records)
    // and returns { flights, unmatched, unplaced }, flights sorted by (corrected) start time.
    //
    // A corrected flight is a copy of the record with the row's non-NULL fields applied
    // and edit: { entry, manual, part91, unpaid, remark, excluded, original: { field: tracker's
    // value } }; an untouched one is the record itself, with edit null. A removed
    // (excluded) flight is left out unless includeRemoved. A manual flight (a row with no
    // tracker) gets id -entry.id, tracker_id null, points [], its named-point coordinates
    // and its own pilot/aircraft; pilot_name comes from pilots ([{ id, name }]).
    //
    // unmatched lists rows whose flight is gone (a history import moved its first point, or
    // the tracker's points were wiped) for a tracker whose flights are loaded: one in
    // flights or in knownTrackerIds (the trackers the caller fetched, so a tracker left with
    // no flights still counts). They're shown for deletion and never applied. unplaced
    // lists the other unapplied rows, for trackers whose flights aren't loaded at all
    // (deleted or inactive ones).
    function applyFlightEdits(flights, entries, { includeRemoved = false, pilots = [], knownTrackerIds = null } = {}) {
      const key = (trackerId, start) => trackerId + ':' + start;
      const byKey = new Map();
      for (const e of entries || []) if (e.tracker_id != null) byKey.set(key(e.tracker_id, e.flight_start_time), e);
      const trackers = new Set(knownTrackerIds || []);
      const matched = new Set();
      const out = [];

      for (const f of flights) {
        trackers.add(f.tracker_id);
        const e = byKey.get(key(f.tracker_id, f.start_time));
        if (!e) { out.push(f); continue; }
        matched.add(e);
        if (e.excluded && !includeRemoved) continue;
        const eff = {
          ...f,
          // Bumped by an edit too, so anything that redraws on a changed flight notices.
          modified_at: Math.max(f.modified_at ?? 0, e.updated_at ?? 0),
          edit: { entry: e, manual: false, part91: !!e.part91, unpaid: !!e.unpaid, remark: e.remark || null, excluded: !!e.excluded, original: {} },
        };
        for (const field of FLIGHT_EDIT_FIELDS) {
          if (e[field] != null) { eff.edit.original[field] = f[field]; eff[field] = e[field]; }
        }
        out.push(eff);
      }

      const pilotName = id => (pilots.find(p => p.id === id) || {}).name || null;
      for (const e of entries || []) {
        if (e.tracker_id != null || (e.excluded && !includeRemoved)) continue;
        out.push({
          id: -e.id, tracker_id: null,
          start_time: e.start_time, end_time: e.end_time, modified_at: e.updated_at ?? 0,
          origin_label: e.origin_label, destination_label: e.destination_label,
          start_lat: e.start_lat, start_lon: e.start_lon, end_lat: e.end_lat, end_lon: e.end_lon,
          aircraft_tail: e.aircraft_tail, pilot_id: e.pilot_id, pilot_name: pilotName(e.pilot_id),
          points: [],
          edit: { entry: e, manual: true, part91: !!e.part91, unpaid: !!e.unpaid, remark: e.remark || null, excluded: !!e.excluded, original: {} },
        });
      }
      out.sort((a, b) => a.start_time - b.start_time);

      const unapplied = (entries || []).filter(e => e.tracker_id != null && !matched.has(e));
      return {
        flights: out,
        unmatched: unapplied.filter(e => trackers.has(e.tracker_id)),
        unplaced: unapplied.filter(e => !trackers.has(e.tracker_id)),
      };
    }

    // The remarks shown under a flight, in order: "Part 91" or "Part 91 (unpaid)" (nothing
    // for Part 135), then its free-text remark. Empty for most flights.
    function flightRemarks(f) {
      const out = [];
      if (f.edit && f.edit.part91) out.push(f.edit.unpaid ? 'Part 91 (unpaid)' : 'Part 91');
      if (f.edit && f.edit.remark) out.push(f.edit.remark);
      return out;
    }

    // Whether field of an effective flight was corrected from the tracker's value.
    function flightFieldEdited(f, field) {
      return !!(f.edit && field in f.edit.original);
    }

    // "†" after a value when any of fields was corrected, with the tracker's values in its
    // title ("Tracker: Dep 09:00, Arr 09:44"); '' otherwise.
    function flightEditedMark(f, fields) {
      const edited = fields.filter(k => flightFieldEdited(f, k));
      if (!edited.length) return '';
      return '<span class="flight-edited" title="Tracker: ' + escHtml(edited.map(k =>
        FLIGHT_EDIT_FIELD_NAMES[k] + ' ' + flightOriginalText(k, f.edit.original[k])).join(', ')) + '">†</span>';
    }

    // The remarks line under a flight ("Part 91 · Training"), or '' when it has none.
    function flightRemarksHtml(f) {
      const r = flightRemarks(f);
      return r.length ? '<div class="flight-remarks">' + escHtml(r.join(' · ')) + '</div>' : '';
    }

    // What a row would change, e.g. "Dep 08:05, Part 91" (for unmatched rows).
    function flightEntrySummary(e) {
      const parts = [];
      if (e.start_time != null) parts.push('Dep ' + unixToTzTime(e.start_time));
      if (e.end_time != null) parts.push('Arr ' + unixToTzTime(e.end_time));
      if (e.origin_label != null) parts.push('Origin ' + e.origin_label);
      if (e.destination_label != null) parts.push('Dest ' + e.destination_label);
      if (e.part91) parts.push(e.unpaid ? 'Part 91 (unpaid)' : 'Part 91');
      if (e.remark) parts.push('Remark “' + e.remark + '”');
      if (e.excluded) parts.push('removed');
      return parts.join(', ') || 'no corrections';
    }

    // The tracker's value of a corrected field, as shown beside the correction.
    function flightOriginalText(field, value) {
      if (value == null || value === '') return '(none)';
      return field === 'start_time' || field === 'end_time' ? unixToTzTime(value) : String(value);
    }

    // The flight form saves a flight longer than this only once confirmed, and never one
    // longer than the server's limit (record-limits.ts).
    const FLIGHT_CONFIRM_SECS = 12 * 3600;
    const FLIGHT_MAX_SECS = ${MAX_FLIGHT_SECS};

    // The flight form's date and Dep/Arr times (YYYY-MM-DD, HH:MM, HH:MM) as a flight: an
    // arrival before the departure is the next day. Returns { start_time, end_time, secs,
    // nextDay, long (over FLIGHT_CONFIRM_SECS: ask first), tooLong (over FLIGHT_MAX_SECS:
    // refuse), hint (the form's line under the times; '' for a same-day arrival) }.
    function flightFormTimes(dateKey, dep, arr) {
      const nextDay = arr < dep;
      const start_time = tzLocalToEpoch(dateKey, dep);
      const end_time = tzLocalToEpoch(nextDay ? dutyAddDays(dateKey, 1) : dateKey, arr);
      const secs = end_time - start_time;
      return {
        start_time, end_time, secs, nextDay,
        long: secs > FLIGHT_CONFIRM_SECS,
        tooLong: secs > FLIGHT_MAX_SECS,
        hint: nextDay ? 'Arrives the next day, ' + fmtBlock(secs) + ' after departure.' : '',
      };
    }
  `;
}
