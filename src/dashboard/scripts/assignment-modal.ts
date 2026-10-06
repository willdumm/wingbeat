/**
 * Flight assignment modal: lets the user change a flight's aircraft and pilot.
 * Opens when the edit button on a flight item is clicked.
 * Calls PUT /api/flights/:id/assignment and patches the local flight store.
 */
export function dashboardScriptsAssignmentModal(): string {
  return `
    // ── Flight assignment modal ───────────────────────────────────────────────

    async function openAssignmentModal(flight) {
      const existing = document.getElementById('assignment-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'assignment-modal';
      modal.className = 'assignment-modal';

      const aircraftOptions = aircraftList.map(a => settingsAircraftOptionHtml(a, flight.aircraft_tail)).join('');

      const activePilots = pilotList.filter(p => p.active || p.id === flight.pilot_id);
      const pilotOptions = activePilots.map(p => settingsPilotOptionHtml(p, flight.pilot_id)).join('');

      modal.innerHTML =
        '<div class="assignment-modal-backdrop"></div>' +
        '<div class="assignment-modal-panel">' +
          '<div class="assignment-modal-header">' +
            '<span class="assignment-modal-title">Edit Assignment</span>' +
            '<button class="assignment-modal-close" aria-label="Close">&times;</button>' +
          '</div>' +
          '<div class="assignment-modal-body">' +
            (aircraftList.length > 0
              ? '<div class="assignment-field">' +
                  '<label>Aircraft</label>' +
                  '<select id="assign-aircraft-select">' +
                    '<option value="">Unknown</option>' +
                    aircraftOptions +
                  '</select>' +
                '</div>'
              : '') +
            (pilotList.length > 0
              ? '<div class="assignment-field">' +
                  '<label>Pilot</label>' +
                  '<select id="assign-pilot-select">' +
                    '<option value="">Unknown</option>' +
                    pilotOptions +
                  '</select>' +
                '</div>'
              : '') +
            (aircraftList.length === 0 && pilotList.length === 0
              ? '<p class="assignment-modal-empty">No aircraft or pilots configured.<br>Add them in Settings → Fleet.</p>'
              : '') +
          '</div>' +
          '<div class="assignment-modal-footer">' +
            '<button class="assignment-save-btn btn-primary">Save</button>' +
            '<button class="assignment-cancel-btn btn-secondary">Cancel</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(modal);

      function closeModal() { modal.remove(); }

      modal.querySelector('.assignment-modal-backdrop').addEventListener('click', closeModal);
      modal.querySelector('.assignment-modal-close').addEventListener('click', closeModal);
      modal.querySelector('.assignment-cancel-btn').addEventListener('click', closeModal);

      modal.querySelector('.assignment-save-btn').addEventListener('click', async () => {
        const aircraftSel = modal.querySelector('#assign-aircraft-select');
        const pilotSel = modal.querySelector('#assign-pilot-select');

        const body = {};
        if (aircraftList.length > 0) {
          body.aircraft_tail = aircraftSel.value || null;
        }
        if (pilotList.length > 0) {
          body.pilot_id = pilotSel.value ? parseInt(pilotSel.value, 10) : null;
        }

        if (Object.keys(body).length === 0) { closeModal(); return; }

        const saveBtn = modal.querySelector('.assignment-save-btn');
        saveBtn.disabled = true;
        try {
          const resp = await fetch('/api/flights/assignment?tracker=' + encodeURIComponent(flight.tracker_id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ flight_ids: [flight.id] }, body)),
          });
          if (resp.ok) {
            const data = await resp.json();
            const patch = {};
            if ('aircraft_tail' in data) patch.aircraft_tail = data.aircraft_tail;
            if ('pilot_id' in data) { patch.pilot_id = data.pilot_id; patch.pilot_name = data.pilot_name; }
            flightStore.patchFlight(flight.id, patch, flight.start_time);
            const allTrackerIds = trackerList.filter(t => t.active && !t.deleted).map(t => t.id);
            allFlights = flightStore.getAll(allTrackerIds).reverse();
            applyFilter();
            refreshAlerts();
            closeModal();
          } else {
            const err = await resp.json().catch(() => ({}));
            alert(err.error ?? 'Failed to save assignment.');
          }
        } catch (_) {
          alert('Failed to save assignment.');
        }
        saveBtn.disabled = false;
      });
    }
  `;
}
