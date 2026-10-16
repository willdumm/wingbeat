/**
 * The "Last changed by …" line of the flight form (flight-editor.ts) and the duty log's
 * day form (pilot-duty.ts), from a record's edit history (GET /api/edit-history; the
 * edit_history triggers of migrations 0003 and 0004), and what those forms show when a
 * save is refused because the record changed since they loaded it (409, "Edit conflicts"
 * in src/index.ts). Needs tzCalendarScript() (shared/time.ts) in the same script.
 */
export function editHistoryScript(): string {
  return `
    // ── Edit history ──────────────────────────────────────────────────────────

    // "Last changed by <user>, <date> <time>" for a duty record into el, from its edit
    // history (entities and key as in migrations 0003 and 0004); el stays empty when it
    // has none. entities: one entity, or several sharing the key (a tracked flight's
    // corrections and its aircraft/pilot), whose newest change is shown. Resolves to that
    // history row (null when there's none, the fetch failed or el has moved on to another
    // key), so a form can tell its data is older than the record (h.id > its base).
    async function showLastEdit(el, entities, key) {
      el.textContent = '';
      el.dataset.editKey = key;   // the day form asks again when its date changes
      try {
        const resp = await fetch('/api/edit-history?entity=' + encodeURIComponent([].concat(entities).join(',')) +
          '&key=' + encodeURIComponent(key) + '&limit=2');
        if (!resp.ok) return null;
        const [h, prev] = (await resp.json()).history;
        if (!h || el.dataset.editKey !== key) return null;
        // An aircraft/pilot change on its own says which; one saved together with the
        // flight's corrections (the flight form writes both in one batch) is a plain change.
        const withPrev = prev && prev.entity !== h.entity && prev.at === h.at && prev.user_id === h.user_id;
        el.textContent = (h.entity === 'flight_assignment' && !withPrev ? _editAssignmentChanged(h) : 'Last changed') +
          ' by ' + (h.user_name || 'an unknown user') + ', ' +
          tzDateLabel(unixToTzDateStr(h.at)) + ' ' + unixToTzTime(h.at) + '.';
        return h;
      } catch (_) { return null; }
    }

    // "Changed by <user> since this was loaded (<date> <time>)." for an edit conflict
    // ({ at, user_name }: the server's 409, or a newer history row than the form's data).
    function editConflictText(conflict) {
      return 'Changed by ' + (conflict.user_name || 'an unknown user') + ' since this was loaded (' +
        tzDateLabel(unixToTzDateStr(conflict.at)) + ' ' + unixToTzTime(conflict.at) + ').';
    }

    // Shows an edit conflict in a form's errorEl with a Reload button, which calls
    // reload() (the form reopened from fresh data), after asking when changed() says the
    // user has edits there to lose. No "save anyway": the user sees the other change first.
    // The form's onConflict for runFormAction() (form-modal.ts), and for showLastEdit()'s
    // newer row.
    function showEditConflict(errorEl, conflict, { reload, changed = () => false }) {
      errorEl.textContent = editConflictText(conflict);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secondary btn-sm';
      btn.textContent = 'Reload';
      btn.addEventListener('click', () => {
        if (changed() && !confirm('Discard your changes and load the latest?')) return;
        reload();
      });
      errorEl.appendChild(btn);
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
