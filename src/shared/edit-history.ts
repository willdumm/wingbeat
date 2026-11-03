/**
 * The "Last changed by …" line of the flight form (flight-editor.ts) and the duty log's
 * day form (pilot-duty.ts), from a record's edit history (GET /api/edit-history; the
 * edit_history triggers of migration 0002), and what those forms show when a
 * save is refused because the record changed since they loaded it (409, "Edit conflicts"
 * in src/index.ts). The text is @wingbeat/core/edit-history's (editConflictText(),
 * lastEditText()) and the read goes through the core client (fetchEditHistory()), from
 * the core bundle (shared/core-bundle.ts) on the page.
 */
export function editHistoryScript(): string {
  return `
    // ── Edit history ──────────────────────────────────────────────────────────

    // "Last changed by <user>, <date> <time>" for a duty record into el, from its edit
    // history (entities and key as in migration 0002); el stays empty when it
    // has none. entities: one entity, or several sharing the key (a tracked flight's
    // corrections and its aircraft/pilot), whose newest change is shown. Resolves to that
    // history row (null when there's none, the fetch failed or el has moved on to another
    // key), so a form can tell its data is older than the record (h.id > its base).
    async function showLastEdit(el, entities, key) {
      el.textContent = '';
      el.dataset.editKey = key;   // the day form asks again when its date changes
      try {
        const [h, prev] = (await fetchEditHistory(entities, key, 2)).history;
        if (!h || el.dataset.editKey !== key) return null;
        el.textContent = lastEditText(h, prev);
        return h;
      } catch (_) { return null; }
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
  `;
}
