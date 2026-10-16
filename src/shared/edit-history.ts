/**
 * The "Last changed by …" line of the flight form (flight-editor.ts) and the duty log's
 * day form (pilot-duty.ts), from a record's edit history (GET /api/edit-history; the
 * edit_history triggers of migrations 0003 and 0004). Needs tzCalendarScript()
 * (shared/time.ts) in the same script.
 */
export function editHistoryScript(): string {
  return `
    // ── Edit history ──────────────────────────────────────────────────────────

    // "Last changed by <user>, <date> <time>" for a duty record into el, from its edit
    // history (entities and key as in migrations 0003 and 0004); el stays empty when it
    // has none. entities: one entity, or several sharing the key (a tracked flight's
    // corrections and its aircraft/pilot), whose newest change is shown.
    async function showLastEdit(el, entities, key) {
      el.textContent = '';
      el.dataset.editKey = key;   // the day form asks again when its date changes
      try {
        const resp = await fetch('/api/edit-history?entity=' + encodeURIComponent([].concat(entities).join(',')) +
          '&key=' + encodeURIComponent(key) + '&limit=2');
        if (!resp.ok) return;
        const [h, prev] = (await resp.json()).history;
        if (!h || el.dataset.editKey !== key) return;
        // An aircraft/pilot change on its own says which; one saved together with the
        // flight's corrections (the flight form writes both in one batch) is a plain change.
        const withPrev = prev && prev.entity !== h.entity && prev.at === h.at && prev.user_id === h.user_id;
        el.textContent = (h.entity === 'flight_assignment' && !withPrev ? _editAssignmentChanged(h) : 'Last changed') +
          ' by ' + (h.user_name || 'an unknown user') + ', ' +
          tzDateLabel(unixToTzDateStr(h.at)) + ' ' + unixToTzTime(h.at) + '.';
      } catch (_) {}
    }

    // "Pilot last changed", "Aircraft last changed" or both, for a flight_assignment
    // history row (before/after: { pilot_id, aircraft_tail } as JSON).
    function _editAssignmentChanged(h) {
      let before = {}, after = {};
      try { before = JSON.parse(h.before) || {}; after = JSON.parse(h.after) || {}; } catch (_) {}
      const aircraft = before.aircraft_tail !== after.aircraft_tail, pilot = before.pilot_id !== after.pilot_id;
      return (aircraft && pilot ? 'Aircraft and pilot' : aircraft ? 'Aircraft' : pilot ? 'Pilot' : 'Aircraft or pilot') + ' last changed';
    }
  `;
}
