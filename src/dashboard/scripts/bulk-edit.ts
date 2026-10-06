/**
 * Bulk flight edit modal: filter flights by date/aircraft/pilot, select them
 * individually or all at once, then apply an aircraft and/or pilot assignment
 * to all selected flights in a single pass.
 */
export function dashboardScriptsBulkEdit(): string {
  return `
    // ── Bulk flight edit modal ─────────────────────────────────────────────────

    document.getElementById('bulk-edit-btn').addEventListener('click', openBulkEditModal);

    function openBulkEditModal() {
      const existing = document.getElementById('bulk-edit-modal');
      if (existing) { existing.remove(); return; }

      const modal = document.createElement('div');
      modal.id = 'bulk-edit-modal';
      modal.className = 'bulk-edit-modal';

      const acFilterOpts =
        '<option value="">All aircraft</option>' +
        '<option value="__null__">Unknown aircraft</option>' +
        aircraftList.map(a => settingsAircraftOptionHtml(a, null)).join('');

      const pilotFilterOpts =
        '<option value="">All pilots</option>' +
        '<option value="__null__">Unknown pilot</option>' +
        pilotList.map(p => settingsPilotOptionHtml(p, null)).join('');

      const acApplyOpts =
        '<option value="">— no change —</option>' +
        '<option value="__null__">Clear (unknown)</option>' +
        aircraftList.map(a => settingsAircraftOptionHtml(a, null)).join('');

      const pilotApplyOpts =
        '<option value="">— no change —</option>' +
        '<option value="__null__">Clear (unknown)</option>' +
        pilotList.map(p => settingsPilotOptionHtml(p, null)).join('');

      const hasAc = aircraftList.length > 0;
      const hasPilot = pilotList.length > 0;

      const panel = document.createElement('div');
      panel.className = 'be-panel';
      panel.innerHTML =
        '<div class="be-sticky-top">' +
          '<div class="be-header">' +
            '<span class="be-title">Bulk Edit Flights</span>' +
            '<button class="be-close" aria-label="Close">&times;</button>' +
          '</div>' +
          '<div class="be-filters">' +
            '<div class="be-filter-row">' +
              '<div class="be-field"><label>From</label><input type="date" id="be-from" /></div>' +
              '<div class="be-field"><label>To</label><input type="date" id="be-to" /></div>' +
            '</div>' +
            (hasAc || hasPilot
              ? '<div class="be-filter-row">' +
                (hasAc ? '<div class="be-field"><label>Aircraft</label><select id="be-filter-ac">' + acFilterOpts + '</select></div>' : '') +
                (hasPilot ? '<div class="be-field"><label>Pilot</label><select id="be-filter-p">' + pilotFilterOpts + '</select></div>' : '') +
                '</div>'
              : '') +
          '</div>' +
          '<div class="be-list-header">' +
            '<label class="be-select-all-wrap">' +
              '<input type="checkbox" id="be-select-all" />' +
              '<span id="be-sel-label">Select all</span>' +
            '</label>' +
            '<span id="be-count-label" class="be-count-label"></span>' +
          '</div>' +
        '</div>' +
        '<div class="be-flight-list" id="be-flight-list"></div>' +
        '<div class="be-apply-section">' +
          '<div class="be-apply-label">Set assignment for selected flights</div>' +
          '<div class="be-apply-fields">' +
            (hasAc ? '<div class="be-field"><label>Aircraft</label><select id="be-apply-ac">' + acApplyOpts + '</select></div>' : '') +
            (hasPilot ? '<div class="be-field"><label>Pilot</label><select id="be-apply-p">' + pilotApplyOpts + '</select></div>' : '') +
          '</div>' +
          '<div class="be-apply-actions">' +
            '<button id="be-apply-btn" class="be-apply-btn btn-primary" disabled>Apply to selected</button>' +
            '<button class="be-cancel-btn btn-secondary">Done</button>' +
          '</div>' +
        '</div>';

      modal.appendChild(panel);
      document.body.appendChild(modal);

      let beFiltered = [];
      const beSelected = new Set();

      function beGetFiltered() {
        const from = (panel.querySelector('#be-from') || {}).value || '';
        const to   = (panel.querySelector('#be-to')   || {}).value || '';
        const ac   = (panel.querySelector('#be-filter-ac') || {}).value || '';
        const p    = (panel.querySelector('#be-filter-p')  || {}).value || '';

        return allFlights.filter(function(f) {
          if (from) {
            const d = new Date(from + 'T00:00:00').getTime() / 1000;
            if (f.start_time < d) return false;
          }
          if (to) {
            const d = new Date(to + 'T23:59:59').getTime() / 1000;
            if (f.start_time > d) return false;
          }
          if (ac !== '') {
            if (ac === '__null__') { if (f.aircraft_tail != null) return false; }
            else { if (f.aircraft_tail !== ac) return false; }
          }
          if (p !== '') {
            if (p === '__null__') { if (f.pilot_id != null) return false; }
            else { if (String(f.pilot_id) !== p) return false; }
          }
          return true;
        });
      }

      function beUpdateControls(n) {
        const cb = panel.querySelector('#be-select-all');
        if (cb) {
          const total = beFiltered.length;
          cb.checked = total > 0 && n === total;
          cb.indeterminate = n > 0 && n < total;
          panel.querySelector('#be-sel-label').textContent =
            n > 0 ? (n + ' of ' + total + ' selected') : 'Select all';
        }
        const btn = panel.querySelector('#be-apply-btn');
        if (btn) {
          btn.textContent = n > 0
            ? ('Apply to ' + n + ' flight' + (n === 1 ? '' : 's'))
            : 'Apply to selected';
          btn.disabled = n === 0;
        }
      }

      function beRenderList() {
        beFiltered = beGetFiltered();

        // Drop selections that no longer appear in the filtered list.
        const filteredIds = new Set(beFiltered.map(function(f) { return f.id; }));
        beSelected.forEach(function(id) { if (!filteredIds.has(id)) beSelected.delete(id); });

        const listEl = panel.querySelector('#be-flight-list');
        listEl.innerHTML = '';

        panel.querySelector('#be-count-label').textContent =
          beFiltered.length + (beFiltered.length === 1 ? ' flight' : ' flights');

        if (beFiltered.length === 0) {
          const msg = document.createElement('div');
          msg.className = 'be-empty-msg';
          msg.textContent = 'No flights match the current filters.';
          listEl.appendChild(msg);
          beUpdateControls(0);
          return;
        }

        for (const f of beFiltered) {
          const row = document.createElement('label');
          row.className = 'be-flight-row';

          const start = new Date(f.start_time * 1000);
          const dateStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
          const timeStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
          let detail = dateStr + ' ' + timeStr;
          if (f.origin_label || f.destination_label) {
            const o = f.origin_label || '?';
            const d = f.destination_label || (f.end_time ? '?' : '');
            detail += ' – ' + o + (d ? ' → ' + d : '');
          }

          const assignParts = [];
          if (f.aircraft_tail) assignParts.push(f.aircraft_tail);
          else if (hasAc) assignParts.push('Unknown Aircraft');
          if (f.pilot_name) assignParts.push(f.pilot_name);
          else if (hasPilot) assignParts.push('Unknown Pilot');

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'be-flight-check';
          cb.checked = beSelected.has(f.id);
          cb.addEventListener('change', function() {
            if (cb.checked) beSelected.add(f.id);
            else beSelected.delete(f.id);
            beUpdateControls(beFiltered.filter(function(f) { return beSelected.has(f.id); }).length);
          });

          const info = document.createElement('span');
          info.className = 'be-flight-info';
          info.innerHTML =
            '<span class="be-flight-date">' + settingsEscAttr(detail) + '</span>' +
            (assignParts.length ? '<span class="be-flight-assign">' + settingsEscAttr(assignParts.join(' · ')) + '</span>' : '');

          row.appendChild(cb);
          row.appendChild(info);
          listEl.appendChild(row);
        }

        beUpdateControls(beFiltered.filter(function(f) { return beSelected.has(f.id); }).length);
      }

      panel.querySelector('.be-close').addEventListener('click', function() { modal.remove(); });
      panel.querySelector('.be-cancel-btn').addEventListener('click', function() { modal.remove(); });

      panel.querySelector('#be-select-all').addEventListener('change', function(e) {
        if (e.target.checked) {
          beFiltered.forEach(function(f) { beSelected.add(f.id); });
        } else {
          beFiltered.forEach(function(f) { beSelected.delete(f.id); });
        }
        beRenderList();
      });

      ['be-from', 'be-to', 'be-filter-ac', 'be-filter-p'].forEach(function(id) {
        const el = panel.querySelector('#' + id);
        if (el) el.addEventListener('change', beRenderList);
      });

      panel.querySelector('#be-apply-btn').addEventListener('click', async function() {
        const applyAcEl = panel.querySelector('#be-apply-ac');
        const applyPEl  = panel.querySelector('#be-apply-p');
        const applyAc   = applyAcEl ? applyAcEl.value : '';
        const applyP    = applyPEl  ? applyPEl.value  : '';

        if (!applyAc && !applyP) {
          alert('Choose an aircraft and/or pilot to apply.');
          return;
        }

        const toUpdate = beFiltered.filter(function(f) { return beSelected.has(f.id); });
        if (toUpdate.length === 0) return;

        const body = {};
        if (applyAc !== '') body.aircraft_tail = (applyAc === '__null__') ? null : applyAc;
        if (applyP  !== '') body.pilot_id       = (applyP  === '__null__') ? null : parseInt(applyP, 10);

        const applyBtn = panel.querySelector('#be-apply-btn');
        applyBtn.disabled = true;
        applyBtn.textContent = 'Applying…';

        try {
          const resp = await fetch('/api/flights/assignment', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ flight_ids: toUpdate.map(function(f) { return f.id; }) }, body)),
          });
          if (resp.ok) {
            const data = await resp.json();
            const patch = {};
            if ('aircraft_tail' in data) patch.aircraft_tail = data.aircraft_tail;
            if ('pilot_id' in data) { patch.pilot_id = data.pilot_id; patch.pilot_name = data.pilot_name; }
            for (const f of toUpdate) {
              flightStore.patchFlight(f.id, patch, f.start_time);
              beSelected.delete(f.id);
            }
          } else {
            const err = await resp.json().catch(function() { return {}; });
            alert(err.error ?? 'Failed to update flights.');
          }
        } catch (_) {
          alert('Failed to update flights.');
        }

        // Sync allFlights from the patched store and re-render the sidebar list.
        const _allTids = trackerList.filter(t => t.active && !t.deleted).map(t => t.id);
        allFlights = flightStore.getAll(_allTids).reverse();
        applyFilter();
        refreshAlerts();

        // Re-render the bulk edit list to reflect the new assignment values.
        beRenderList();

        beUpdateControls(beFiltered.filter(function(f) { return beSelected.has(f.id); }).length);
      });

      beRenderList();
    }
  `;
}
