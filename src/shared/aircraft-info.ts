/** Aircraft info view body, filled by _acInfoRender(). */
export function aircraftInfoMarkup(): string {
  return `<div id="aircraft-info-body" class="aircraft-info-body"></div>`;
}

export function aircraftInfoStyles(): string {
  return `
    .aircraft-info-body {
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .ac-info-section {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      background: var(--surface-0);
      border-radius: var(--radius-lg);
      padding: 0.75rem;
    }

    [data-theme="light"] .ac-info-section {
      background: var(--surface-2);
    }

    .ac-section-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .ac-info-field {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }

    .ac-field-label {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .ac-field-row {
      display: flex;
      gap: 0.4rem;
      align-items: center;
    }

    .ac-field-value {
      font-size: 0.875rem;
      color: var(--text-primary);
    }

    .ac-field-hint {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .ac-field-msg {
      font-size: 0.75rem;
      color: var(--text-muted);
      min-height: 1em;
    }
    .ac-field-msg.ac-msg-ok { color: var(--success-fg); }
    .ac-field-msg.ac-msg-err { color: var(--danger-fg); }

    .ac-input {
      padding: 0.35rem 0.5rem;
      background: var(--input-bg);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: 0.85rem;
      flex: 1;
    }
    .ac-input[type="datetime-local"] {
      -webkit-appearance: none;
      appearance: none;
      flex: none;
      width: 16rem;
    }
    .ac-input-num {
      width: 9rem;
      flex: none;
    }
    .ac-input-date {
      width: 11rem;
      flex: none;
    }
    .ac-select {
      padding: 0.35rem 0.5rem;
      background: var(--input-bg);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: 0.85rem;
    }

    :is(.ac-save-btn, .aircraft-info-cf-update-btn) {
      background: var(--accent);
      border: none;
      border-radius: var(--radius-pill);
      color: var(--accent-fg);
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s;
    }
    :is(.ac-save-btn, .aircraft-info-cf-update-btn):hover { background: var(--accent-hover); }
    .ac-save-btn { padding: 0.35rem 0.75rem; font-size: 0.8rem; font-weight: 500; }

    :is(.ac-cancel-btn, .ac-action-btn, .ac-link-btn, .ac-toggle-btn, .aircraft-info-cf-keep-btn) {
      background: var(--surface-2);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-muted);
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    :is(.ac-cancel-btn, .ac-action-btn, .ac-link-btn, .aircraft-info-cf-keep-btn):hover {
      background: var(--surface-hover);
      color: var(--text-secondary);
      border-color: var(--border-strong);
    }
    .ac-cancel-btn { padding: 0.35rem 0.75rem; font-size: 0.8rem; white-space: nowrap; }
    .ac-action-btn { padding: 0.3rem 0.65rem; font-size: 0.8rem; align-self: flex-start; }
    .ac-link-btn { padding: 0.25rem 0.55rem; font-size: 0.75rem; white-space: nowrap; }

    .ac-toggle-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .ac-toggle-btn { padding: 0.3rem 0.65rem; font-size: 0.8rem; }
    .ac-toggle-btn:not(.ac-toggle-on):hover {
      background: var(--surface-hover);
      color: var(--text-secondary);
      border-color: var(--border-strong);
    }
    .ac-toggle-btn.ac-toggle-on {
      background: rgba(16,185,129,0.12);
      border-color: var(--success-fg);
      color: var(--success-fg);
    }
    .ac-toggle-btn.ac-toggle-on:hover { background: rgba(16,185,129,0.2); }

    .ac-timer-unset {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .ac-timer-input-row {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }
    .ac-timer-input-row.hidden { display: none; }

    .ac-input-actions {
      display: flex;
      gap: 0.4rem;
    }

    .ac-timer-recorded {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }

    .ac-timer-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
    }

    .ac-timer-label {
      color: var(--text-muted);
      min-width: 10rem;
    }

    .ac-timer-value {
      color: var(--text-primary);
      font-weight: 500;
    }
    .ac-timer-est { color: var(--text-secondary); font-weight: normal; }

    .ac-timer-hint { color: var(--text-muted); font-size: 0.72rem; }

    .ac-cf-row { flex-wrap: wrap; gap: 0.4rem; }

    .ac-cf-edit-row {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-top: 0.25rem;
    }
    .ac-cf-edit-row.hidden { display: none; }

    .ac-sched-list {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .ac-sched-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0;
      border-bottom: 1px solid var(--border-subtle);
    }
    .ac-sched-row:last-child { border-bottom: none; }

    .ac-sched-info {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
      min-width: 0;
      font-size: 0.82rem;
    }

    .ac-status-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .ac-sched-name {
      color: var(--text-primary);
      font-weight: 500;
    }

    .ac-badge {
      padding: 0.05rem 0.35rem;
      border-radius: 2px;
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .ac-badge-hobbs { background: var(--accent-surface); color: var(--accent-text); }
    .ac-badge-tach  { background: rgba(22,163,74,0.12); color: var(--success-fg); }
    .ac-badge-calendar { background: rgba(180,83,9,0.12); color: var(--warning-fg); }

    .ac-sched-due { font-size: 0.78rem; color: var(--text-muted); }
    .ac-sched-due.overdue { color: var(--danger-fg); }
    .ac-sched-due.due_soon { color: var(--warning-fg); }
    .ac-sched-due.ok { color: var(--success-fg); }
    .ac-sched-due.timer_not_recorded { color: var(--text-muted); }

    .ac-sched-actions {
      display: flex;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .ac-empty-msg {
      font-size: 0.82rem;
      color: var(--text-muted);
    }

    .ac-sched-edit-form {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border-subtle);
    }

    .ac-sched-add-details {
      font-size: 0.82rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }
    .ac-sched-add-details summary {
      cursor: pointer;
      padding: 0.3rem 0;
      color: var(--text-muted);
      font-size: 0.78rem;
      list-style: none;
      user-select: none;
    }
    .ac-sched-add-details summary::before { content: '+ '; }

    .ac-sched-add-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding-top: 0.5rem;
    }

    .ac-form-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .ac-form-field.hidden { display: none; }

    .ac-form-actions { display: flex; gap: 0.4rem; }

    .aircraft-info-cf-overlay {
      position: absolute;
      inset: 0;
      background: var(--scrim);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }
    .aircraft-info-cf-overlay.hidden { display: none; }

    .aircraft-info-cf-panel {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 1.25rem;
      max-width: 22rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .aircraft-info-cf-message {
      font-size: 0.85rem;
      color: var(--text-primary);
      line-height: 1.5;
    }

    .ac-cf-unusual {
      color: var(--warning-fg);
      font-weight: 600;
    }

    .aircraft-info-cf-actions {
      display: flex;
      gap: 0.5rem;
    }

    .aircraft-info-cf-update-btn { padding: 0.35rem 0.75rem; font-size: 0.82rem; }
    .aircraft-info-cf-keep-btn { padding: 0.35rem 0.75rem; font-size: 0.82rem; }
  `;
}

export function sharedMaintenanceHelperScripts(): string {
  return `
    function _flightHours(f) {
      var pts = f.points;
      var endTime = (f.end_time !== null && f.end_time !== undefined)
        ? f.end_time
        : (pts && pts.length > 0 ? Math.max.apply(null, pts.map(function(p) { return p.t; })) : f.start_time);
      return (endTime - f.start_time) / 3600;
    }

    function _estimatedMeter(recordedValue, recordedAt, correctionFactor, tail, flights) {
      if (recordedValue === null || recordedValue === undefined ||
          recordedAt === null || recordedAt === undefined) return null;
      var cf = (correctionFactor !== null && correctionFactor !== undefined) ? correctionFactor : 1.0;
      var hours = flights
        .filter(function(f) { return f.aircraft_tail === tail && f.start_time >= recordedAt; })
        .reduce(function(s, f) { return s + _flightHours(f); }, 0);
      return recordedValue + cf * hours;
    }

    function _calendarDueDate(lastDoneAt, intervalMonths) {
      var d = new Date(lastDoneAt * 1000);
      var year = d.getFullYear();
      var month = d.getMonth() + 1 + intervalMonths;
      while (month > 12) { month -= 12; year += 1; }
      return new Date(year, month, 0, 23, 59, 59);
    }

    function _maintenanceStatus(item, estHobbs, estTach) {
      if (item.schedule_type === 'hobbs' || item.schedule_type === 'tach') {
        var est = item.schedule_type === 'hobbs' ? estHobbs : estTach;
        if (est === null) {
          return { status: 'timer_not_recorded', due_label: (item.schedule_type === 'hobbs' ? 'Hobbs' : 'Tach') + ' not recorded' };
        }
        var due = (item.last_done_value || 0) + item.interval_hours;
        var rem = due - est;
        var threshold = item.interval_hours * 0.1;
        var st = rem < 0 ? 'overdue' : rem <= threshold ? 'due_soon' : 'ok';
        var lbl = rem < 0
          ? 'Overdue ' + Math.abs(rem).toFixed(1) + ' hr'
          : 'Due in ' + rem.toFixed(1) + ' hr';
        return { status: st, remaining_hours: rem, due_label: lbl };
      } else {
        if (item.last_done_at == null) {
          return { status: 'timer_not_recorded', due_label: 'Last service date not set' };
        }
        var dueDate = _calendarDueDate(item.last_done_at, item.interval_months);
        var remDays = (dueDate.getTime() - Date.now()) / 86400000;
        var st2 = remDays < 0 ? 'overdue' : remDays <= 30 ? 'due_soon' : 'ok';
        var dueStr = dueDate.toLocaleString('default', { month: 'short', year: 'numeric' });
        var lbl2 = remDays < 0
          ? 'Overdue ' + Math.round(Math.abs(remDays)) + ' days'
          : 'Due ' + dueStr;
        return { status: st2, remaining_days: remDays, due_label: lbl2 };
      }
    }
  `;
}

/**
 * Read-mostly rendering for the aircraft info view: the Hobbs/Tach timer sections and the
 * maintenance schedule, as HTML strings built from an aircraft record and its estimated
 * meter readings. Pure (no settings/store state), so the docs-site showcase
 * (src/showcase/) renders the same sections from sample data; aircraftInfoScript() below
 * adds the admin bindings on top.
 */
export function aircraftInfoRenderScript(): string {
  return `
    ${sharedMaintenanceHelperScripts()}

    function _acEsc(s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _acFormatDate(ts) {
      if (!ts) return 'unknown';
      return new Date(ts * 1000).toLocaleDateString();
    }

    function _acStatusDotHtml(status) {
      var color = status === 'ok' ? 'var(--success-fg)'
        : status === 'due_soon' ? 'var(--warning-fg)'
        : status === 'overdue' ? 'var(--danger-fg)'
        : 'var(--text-muted)';
      return '<span class="ac-status-dot" style="background:' + color + '"></span>';
    }

    function _acBadgeHtml(schedType) {
      var labels = { hobbs: 'HOBBS', tach: 'TACH', calendar: 'CAL' };
      return '<span class="ac-badge ac-badge-' + schedType + '">' + (labels[schedType] || schedType) + '</span>';
    }

    // ── Timer section (hobbs or tach) ──
    // Admins get the set/update/correction-factor controls, bound by _acBindTimer.

    function _acTimerHtml(type, a, estimated, isAdmin) {
      var cap = type === 'hobbs' ? 'Hobbs' : 'Tach';
      var tv  = a[type + '_time'];
      var rat = a[type + '_recorded_at'];
      var cf  = (a[type + '_correction'] !== null && a[type + '_correction'] !== undefined) ? a[type + '_correction'] : 1.0;
      var notSet = (tv === null || tv === undefined);

      var content;
      if (notSet) {
        content =
          '<div class="ac-timer-unset">' +
            '<span>Not recorded</span>' +
            (isAdmin ? '<button id="ac-' + type + '-set-btn" class="ac-link-btn">Set ' + cap.toLowerCase() + ' time</button>' : '') +
          '</div>' +
          (isAdmin
            ? '<div id="ac-' + type + '-input-row" class="ac-timer-input-row hidden">' +
                '<input type="number" id="ac-' + type + '-input" class="ac-input" style="width:14rem;" placeholder="' + cap + ' reading (e.g. 1234.7)" step="0.1" min="0" />' +
                '<label class="ac-field-label" style="margin-top:0.25rem;">Reading taken at</label>' +
                '<input type="datetime-local" id="ac-' + type + '-datetime" class="ac-input" />' +
                '<div class="ac-input-actions">' +
                  '<button id="ac-' + type + '-save-btn" class="ac-save-btn">Save</button>' +
                  '<button id="ac-' + type + '-cancel-btn" class="ac-cancel-btn">Cancel</button>' +
                '</div>' +
                '<div id="ac-' + type + '-msg" class="ac-field-msg"></div>' +
              '</div>'
            : '');
      } else {
        var estStr = estimated !== null ? '~' + estimated.toFixed(1) + ' hr' : 'N/A';
        content =
          '<div class="ac-timer-recorded">' +
            '<div class="ac-timer-row">' +
              '<span class="ac-timer-label">Recorded:</span>' +
              '<span class="ac-timer-value">' + tv.toFixed(1) + ' hr</span>' +
              '<span class="ac-timer-hint">as of ' + _acFormatDate(rat) + '</span>' +
            '</div>' +
            '<div class="ac-timer-row">' +
              '<span class="ac-timer-label">Estimated current:</span>' +
              '<span class="ac-timer-value ac-timer-est">' + estStr + '</span>' +
              '<span class="ac-timer-hint">(estimate)</span>' +
            '</div>' +
            '<div class="ac-timer-row ac-cf-row">' +
              '<span class="ac-timer-label">Correction factor:</span>' +
              '<span class="ac-timer-value">' + cf.toFixed(3) + '</span>' +
              (isAdmin
                ? '<button id="ac-' + type + '-cf-edit-btn" class="ac-link-btn">Edit</button>' +
                  '<div id="ac-' + type + '-cf-edit-row" class="ac-cf-edit-row hidden">' +
                    '<input type="number" id="ac-' + type + '-cf-input" class="ac-input ac-input-num" value="' + cf.toFixed(3) + '" step="0.001" min="0.1" max="3.0" />' +
                    '<button id="ac-' + type + '-cf-save-btn" class="ac-save-btn">Save</button>' +
                    '<button id="ac-' + type + '-cf-cancel-btn" class="ac-cancel-btn">Cancel</button>' +
                  '</div>'
                : '') +
            '</div>' +
          '</div>' +
          (isAdmin
            ? '<button id="ac-' + type + '-update-btn" class="ac-action-btn" style="margin-top:0.35rem;">Update reading</button>' +
              '<div id="ac-' + type + '-update-row" class="ac-timer-input-row hidden">' +
                '<input type="number" id="ac-' + type + '-update-input" class="ac-input" style="width:14rem;" placeholder="New ' + cap.toLowerCase() + ' reading" step="0.1" min="0" />' +
                '<label class="ac-field-label" style="margin-top:0.25rem;">Reading taken at</label>' +
                '<input type="datetime-local" id="ac-' + type + '-update-datetime" class="ac-input" />' +
                '<div class="ac-input-actions">' +
                  '<button id="ac-' + type + '-update-save-btn" class="ac-save-btn">Save</button>' +
                  '<button id="ac-' + type + '-update-cancel-btn" class="ac-cancel-btn">Cancel</button>' +
                '</div>' +
                '<div id="ac-' + type + '-update-msg" class="ac-field-msg"></div>' +
              '</div>'
            : '');
      }

      return '<div class="ac-info-section">' +
        '<div class="ac-section-label">' + cap + ' Time</div>' +
        content +
      '</div>';
    }

    // ── Maintenance schedule section ──
    // Admins get edit/delete per row plus the add-item form, bound by _acBindSchedule.

    function _acScheduleHtml(a, estHobbs, estTach, isAdmin) {
      var items = a.maintenance_schedule || [];
      var rows = '';

      if (items.length === 0) {
        rows = '<p class="ac-empty-msg">No maintenance items added.</p>';
      } else {
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          var st = _maintenanceStatus(item, estHobbs, estTach);
          rows +=
            '<div class="ac-sched-row" data-item-id="' + _acEsc(item.id) + '">' +
              '<div class="ac-sched-info">' +
                _acStatusDotHtml(st.status) +
                '<span class="ac-sched-name">' + _acEsc(item.name) + '</span>' +
                _acBadgeHtml(item.schedule_type) +
                '<span class="ac-sched-due ' + st.status + '">' + _acEsc(st.due_label) + '</span>' +
              '</div>' +
              (isAdmin
                ? '<div class="ac-sched-actions">' +
                    '<button class="ac-link-btn ac-sched-edit-btn" data-item-id="' + _acEsc(item.id) + '">Edit</button>' +
                    '<button class="ac-link-btn ac-sched-delete-btn" data-item-id="' + _acEsc(item.id) + '">Delete</button>' +
                  '</div>'
                : '') +
            '</div>';
        }
      }

      var addForm = isAdmin
        ? '<details id="ac-sched-add-details" class="ac-sched-add-details">' +
            '<summary>Add maintenance item</summary>' +
            '<div class="ac-sched-add-form">' +
              '<div class="ac-form-field">' +
                '<label class="ac-field-label">Name</label>' +
                '<input type="text" id="ac-add-name" class="ac-input" placeholder="e.g. Oil Change" />' +
              '</div>' +
              '<div class="ac-form-field">' +
                '<label class="ac-field-label">Schedule type</label>' +
                '<select id="ac-add-type" class="ac-select">' +
                  '<option value="hobbs">Hobbs</option>' +
                  '<option value="tach">Tach</option>' +
                  '<option value="calendar">Calendar</option>' +
                '</select>' +
              '</div>' +
              '<div id="ac-add-meter-fields" class="ac-form-field">' +
                '<label class="ac-field-label">Interval (hours)</label>' +
                '<input type="number" id="ac-add-interval-hours" class="ac-input" style="width:10rem;" placeholder="e.g. 50" step="0.1" min="0.1" />' +
                '<label class="ac-field-label" style="margin-top:0.25rem;">Last done at (meter reading)</label>' +
                '<input type="number" id="ac-add-last-meter" class="ac-input" style="width:10rem;" placeholder="Meter reading at last service" step="0.1" min="0" />' +
              '</div>' +
              '<div id="ac-add-cal-fields" class="ac-form-field hidden">' +
                '<label class="ac-field-label">Interval (months)</label>' +
                '<input type="number" id="ac-add-interval-months" class="ac-input" style="width:10rem;" placeholder="e.g. 12" step="1" min="1" />' +
                '<label class="ac-field-label" style="margin-top:0.25rem;">Last done</label>' +
                '<input type="date" id="ac-add-last-date" class="ac-input ac-input-date" />' +
              '</div>' +
              '<div class="ac-form-actions">' +
                '<button id="ac-add-submit" class="ac-save-btn">Add</button>' +
              '</div>' +
            '</div>' +
          '</details>'
        : '';

      return '<div class="ac-info-section">' +
        '<div class="ac-section-label">Maintenance Schedule</div>' +
        '<div id="ac-sched-list">' + rows + '</div>' +
        addForm +
      '</div>';
    }

  `;
}

export function aircraftInfoScript(): string {
  return `
    // ── Aircraft info modal ────────────────────────────────────────────────────
    ${aircraftInfoRenderScript()}

    var _acInfoAircraft = null;
    var _acInfoPendingCf = null;

    function _acLocalDatetimeNow() {
      var d = new Date();
      var pad = function(n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function _acFlightHoursSince(tail, since) {
      return flightStore.getAll()
        .filter(function(f) { return f.aircraft_tail === tail && f.start_time >= since; })
        .reduce(function(s, f) { return s + _flightHours(f); }, 0);
    }

    function _acDateToTs(dateStr) {
      if (!dateStr) return null;
      var parts = dateStr.split('-');
      if (parts.length !== 3) return null;
      return Math.floor(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getTime() / 1000);
    }

    function _acTsToDateInput(ts) {
      if (!ts) return '';
      var d = new Date(ts * 1000);
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    }

    // ── API save ──

    async function _acSaveAircraft(body) {
      var a = _acInfoAircraft;
      try {
        var resp = await fetch('/api/aircraft/' + encodeURIComponent(a.tail_number), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          var d = await resp.json().catch(function() { return {}; });
          alert(d.error || 'Failed to save.');
          return false;
        }
        Object.assign(a, body);
        return true;
      } catch (_) { alert('Network error.'); return false; }
    }

    // ── Open / close ──

    function openAircraftInfo(aircraft) {
      _acInfoAircraft = aircraft;
      if (document.getElementById('settings-modal').classList.contains('hidden')) { openSettings(); }
      _settingsNavigateTo('settings-view-aircraft-info',
        aircraft.tail_number + (aircraft.name ? ' – ' + aircraft.name : ''));
      _acInfoRender();
    }

    function closeAircraftInfo() { _settingsNavigateBack(); }

    // ── Correction factor overlay ──

    document.getElementById('aircraft-info-cf-update').addEventListener('click', function() {
      _acCfConfirm(true);
    });
    document.getElementById('aircraft-info-cf-keep').addEventListener('click', function() {
      _acCfConfirm(false);
    });

    async function _acCfConfirm(accept) {
      var pend = _acInfoPendingCf;
      if (!pend) return;
      _acInfoPendingCf = null;
      document.getElementById('aircraft-info-cf-overlay').classList.add('hidden');
      var body = {};
      body[pend.type + '_time'] = pend.newValue;
      body[pend.type + '_recorded_at'] = pend.newRecordedAt;
      if (accept) body[pend.type + '_correction'] = pend.computedCf;
      var ok = await _acSaveAircraft(body);
      if (ok) _acInfoRender();
    }

    function _acShowCfOverlay(type, computedCf, currentCf, flightHours) {
      var unusual = computedCf < 0.5 || computedCf > 1.5;
      var cap = type === 'hobbs' ? 'hobbs' : 'tach';
      var msg = (unusual ? '<span class="ac-cf-unusual">&#9888; Unusual value &mdash;</span> ' : '') +
        'Based on your meter readings over the past <strong>' + flightHours.toFixed(1) + '</strong> flight hours, ' +
        'the estimated correction factor for ' + cap + ' is <strong>' + computedCf.toFixed(3) + '</strong>' +
        ' (currently ' + currentCf.toFixed(3) + '). Update the correction factor?';
      document.getElementById('aircraft-info-cf-message').innerHTML = msg;
      document.getElementById('aircraft-info-cf-overlay').classList.remove('hidden');
    }

    // ── Full render ──

    function _acInfoRender() {
      var a = _acInfoAircraft;
      var cf_h = (a.hobbs_correction !== null && a.hobbs_correction !== undefined) ? a.hobbs_correction : 1.0;
      var cf_t = (a.tach_correction !== null && a.tach_correction !== undefined) ? a.tach_correction : 1.0;
      var flights = flightStore.getAll();
      var estHobbs = _estimatedMeter(a.hobbs_time, a.hobbs_recorded_at, cf_h, a.tail_number, flights);
      var estTach  = _estimatedMeter(a.tach_time, a.tach_recorded_at, cf_t, a.tail_number, flights);

      var isAdmin = _settingsUser?.role === 'admin';
      var body = document.getElementById('aircraft-info-body');
      body.innerHTML =
        _acIdentityHtml(a) +
        _acTimerHtml('hobbs', a, estHobbs, isAdmin) +
        _acTimerHtml('tach', a, estTach, isAdmin) +
        _acScheduleHtml(a, estHobbs, estTach, isAdmin);

      _acBindIdentity();
      _acBindTimer('hobbs');
      _acBindTimer('tach');
      _acBindSchedule();
    }

    // ── Identity section ──

    function _acIdentityHtml(a) {
      var isAdmin = _settingsUser?.role === 'admin';
      var nameField = isAdmin
        ? '<div class="ac-field-row">' +
            '<input type="text" id="ac-name-input" class="ac-input" value="' + _acEsc(a.name || '') + '" placeholder="Display name (optional)" />' +
            '<button id="ac-name-save" class="ac-save-btn">Save</button>' +
          '</div>' +
          '<div id="ac-name-msg" class="ac-field-msg"></div>'
        : '<span class="ac-field-value">' + _acEsc(a.name || '—') + '</span>';
      var visField = isAdmin
        ? '<div class="ac-toggle-row">' +
            '<button id="ac-active-toggle" class="ac-toggle-btn' + (a.active ? ' ac-toggle-on' : '') + '">' + (a.active ? 'Active' : 'Hidden') + '</button>' +
            '<span class="ac-field-hint">' + (a.active ? 'Shown in filters and flight list' : 'Hidden from filters and flight list') + '</span>' +
          '</div>'
        : '<span class="ac-field-value">' + (a.active ? 'Active' : 'Hidden') + '</span>';
      return '<div class="ac-info-section">' +
        '<div class="ac-section-label">Identity</div>' +
        '<div class="ac-info-field">' +
          '<label class="ac-field-label">Display name</label>' +
          nameField +
        '</div>' +
        '<div class="ac-info-field">' +
          '<span class="ac-field-label">Tail number</span>' +
          '<span class="ac-field-value">' + _acEsc(a.tail_number) + '</span>' +
        '</div>' +
        '<div class="ac-info-field">' +
          '<span class="ac-field-label">Visibility</span>' +
          visField +
        '</div>' +
      '</div>';
    }

    function _acBindIdentity() {
      var saveBtn = document.getElementById('ac-name-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', async function() {
          var val = document.getElementById('ac-name-input').value.trim() || null;
          var msg = document.getElementById('ac-name-msg');
          var ok = await _acSaveAircraft({ name: val });
          if (ok) {
            var a = _acInfoAircraft;
            document.getElementById('settings-nav-title').textContent =
              a.tail_number + (a.name ? ' – ' + a.name : '');
            msg.textContent = 'Saved';
            msg.className = 'ac-field-msg ac-msg-ok';
            setTimeout(function() { msg.textContent = ''; msg.className = 'ac-field-msg'; }, 2000);
          }
        });
      }

      var toggleBtn = document.getElementById('ac-active-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', async function() {
          var ok = await _acSaveAircraft({ active: !_acInfoAircraft.active });
          if (ok) _acInfoRender();
        });
      }
    }

    // ── Timer section bindings ──

    function _acBindTimer(type) {
      var a = _acInfoAircraft;
      var notSet = (a[type + '_time'] === null || a[type + '_time'] === undefined);

      if (notSet) {
        var setBtn = document.getElementById('ac-' + type + '-set-btn');
        if (!setBtn) return;
        setBtn.addEventListener('click', function() {
          document.getElementById('ac-' + type + '-input-row').classList.remove('hidden');
          setBtn.classList.add('hidden');
          var dtInput = document.getElementById('ac-' + type + '-datetime');
          if (dtInput && !dtInput.value) dtInput.value = _acLocalDatetimeNow();
        });
        document.getElementById('ac-' + type + '-cancel-btn').addEventListener('click', function() {
          document.getElementById('ac-' + type + '-input-row').classList.add('hidden');
          setBtn.classList.remove('hidden');
        });
        document.getElementById('ac-' + type + '-save-btn').addEventListener('click', async function() {
          var val = parseFloat(document.getElementById('ac-' + type + '-input').value);
          var msg = document.getElementById('ac-' + type + '-msg');
          if (isNaN(val) || val < 0) { msg.textContent = 'Enter a valid reading.'; msg.className = 'ac-field-msg ac-msg-err'; return; }
          var dtInput = document.getElementById('ac-' + type + '-datetime');
          var recordedAt = dtInput && dtInput.value ? Math.floor(new Date(dtInput.value).getTime() / 1000) : Math.floor(Date.now() / 1000);
          var body = {};
          body[type + '_time'] = val;
          body[type + '_recorded_at'] = recordedAt;
          var ok = await _acSaveAircraft(body);
          if (ok) _acInfoRender();
        });
      } else {
        var cfEditBtn = document.getElementById('ac-' + type + '-cf-edit-btn');
        if (!cfEditBtn) return;
        cfEditBtn.addEventListener('click', function() {
          document.getElementById('ac-' + type + '-cf-edit-row').classList.toggle('hidden');
        });
        document.getElementById('ac-' + type + '-cf-cancel-btn').addEventListener('click', function() {
          document.getElementById('ac-' + type + '-cf-edit-row').classList.add('hidden');
        });
        document.getElementById('ac-' + type + '-cf-save-btn').addEventListener('click', async function() {
          var val = parseFloat(document.getElementById('ac-' + type + '-cf-input').value);
          if (isNaN(val) || val < 0.1 || val > 3.0) { alert('Enter a value between 0.1 and 3.0'); return; }
          var body = {};
          body[type + '_correction'] = val;
          var ok = await _acSaveAircraft(body);
          if (ok) _acInfoRender();
        });

        var updateBtn = document.getElementById('ac-' + type + '-update-btn');
        updateBtn.addEventListener('click', function() {
          document.getElementById('ac-' + type + '-update-row').classList.remove('hidden');
          updateBtn.classList.add('hidden');
          var dtInput = document.getElementById('ac-' + type + '-update-datetime');
          if (dtInput && !dtInput.value) dtInput.value = _acLocalDatetimeNow();
        });
        document.getElementById('ac-' + type + '-update-cancel-btn').addEventListener('click', function() {
          document.getElementById('ac-' + type + '-update-row').classList.add('hidden');
          updateBtn.classList.remove('hidden');
        });
        document.getElementById('ac-' + type + '-update-save-btn').addEventListener('click', function() {
          var val = parseFloat(document.getElementById('ac-' + type + '-update-input').value);
          var msg = document.getElementById('ac-' + type + '-update-msg');
          if (isNaN(val) || val < 0) { msg.textContent = 'Enter a valid reading.'; msg.className = 'ac-field-msg ac-msg-err'; return; }
          var dtInput = document.getElementById('ac-' + type + '-update-datetime');
          var now = dtInput && dtInput.value ? Math.floor(new Date(dtInput.value).getTime() / 1000) : Math.floor(Date.now() / 1000);
          var oldVal = a[type + '_time'];
          var oldAt  = a[type + '_recorded_at'];
          var cf = (a[type + '_correction'] !== null && a[type + '_correction'] !== undefined) ? a[type + '_correction'] : 1.0;

          if (oldVal !== null && oldVal !== undefined && oldAt !== null && oldAt !== undefined) {
            var fh = _acFlightHoursSince(a.tail_number, oldAt);
            if (fh >= 2.0) {
              var newCf = (val - oldVal) / fh;
              _acInfoPendingCf = { type: type, newValue: val, newRecordedAt: now, computedCf: newCf };
              _acShowCfOverlay(type, newCf, cf, fh);
              return;
            }
          }
          var body = {};
          body[type + '_time'] = val;
          body[type + '_recorded_at'] = now;
          _acSaveAircraft(body).then(function(ok) { if (ok) _acInfoRender(); });
        });
      }
    }

    // ── Maintenance schedule bindings ──

    function _acScheduleEditHtml(item) {
      var isMeter = item.schedule_type === 'hobbs' || item.schedule_type === 'tach';
      return '<div class="ac-sched-edit-form" data-item-id="' + _acEsc(item.id) + '">' +
        '<div class="ac-form-field">' +
          '<label class="ac-field-label">Name</label>' +
          '<input type="text" class="ac-input ac-sched-edit-name" value="' + _acEsc(item.name) + '" />' +
        '</div>' +
        (isMeter
          ? '<div class="ac-form-field">' +
              '<label class="ac-field-label">Interval (hours)</label>' +
              '<input type="number" class="ac-input ac-sched-edit-interval-hours" style="width:10rem;" value="' + (item.interval_hours || '') + '" step="0.1" min="0.1" />' +
              '<label class="ac-field-label" style="margin-top:0.25rem;">Last done at (meter reading)</label>' +
              '<input type="number" class="ac-input ac-sched-edit-last-meter" style="width:10rem;" value="' + (item.last_done_value !== undefined ? item.last_done_value : '') + '" step="0.1" min="0" />' +
            '</div>'
          : '<div class="ac-form-field">' +
              '<label class="ac-field-label">Interval (months)</label>' +
              '<input type="number" class="ac-input ac-sched-edit-interval-months" style="width:10rem;" value="' + (item.interval_months || '') + '" step="1" min="1" />' +
              '<label class="ac-field-label" style="margin-top:0.25rem;">Last done</label>' +
              '<input type="date" class="ac-input ac-input-date ac-sched-edit-last-date" value="' + _acTsToDateInput(item.last_done_at) + '" />' +
            '</div>') +
        '<div class="ac-form-actions">' +
          '<button class="ac-save-btn ac-sched-edit-save">Save</button>' +
          '<button class="ac-cancel-btn ac-sched-edit-cancel">Cancel</button>' +
        '</div>' +
      '</div>';
    }

    function _acBindSchedule() {
      // Add form — toggle meter vs calendar fields on type change
      var addTypeEl = document.getElementById('ac-add-type');
      if (!addTypeEl) return;

      function _acUpdateAddFields() {
        var isMeter = addTypeEl.value === 'hobbs' || addTypeEl.value === 'tach';
        document.getElementById('ac-add-meter-fields').classList.toggle('hidden', !isMeter);
        document.getElementById('ac-add-cal-fields').classList.toggle('hidden', isMeter);
      }
      addTypeEl.addEventListener('change', _acUpdateAddFields);
      _acUpdateAddFields();

      document.getElementById('ac-add-submit').addEventListener('click', async function() {
        var name = document.getElementById('ac-add-name').value.trim();
        if (!name) { alert('Enter a name for the maintenance item.'); return; }
        var schedType = addTypeEl.value;
        var newItem = {
          id: crypto.randomUUID(),
          name: name,
          schedule_type: schedType,
        };
        if (schedType === 'hobbs' || schedType === 'tach') {
          var ih = parseFloat(document.getElementById('ac-add-interval-hours').value);
          if (isNaN(ih) || ih <= 0) { alert('Enter a valid interval in hours.'); return; }
          newItem.interval_hours = ih;
          var lm = parseFloat(document.getElementById('ac-add-last-meter').value);
          if (!isNaN(lm)) newItem.last_done_value = lm;
        } else {
          var im = parseInt(document.getElementById('ac-add-interval-months').value, 10);
          if (isNaN(im) || im < 1) { alert('Enter a valid interval in months.'); return; }
          newItem.interval_months = im;
          var ld = _acDateToTs(document.getElementById('ac-add-last-date').value);
          if (ld) newItem.last_done_at = ld;
        }
        var a = _acInfoAircraft;
        var schedule = (a.maintenance_schedule || []).slice();
        schedule.push(newItem);
        var ok = await _acSaveAircraft({ maintenance_schedule: schedule });
        if (ok) _acInfoRender();
      });

      // Edit / delete buttons
      var listEl = document.getElementById('ac-sched-list');
      listEl.querySelectorAll('.ac-sched-edit-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var itemId = btn.getAttribute('data-item-id');
          var a = _acInfoAircraft;
          var item = (a.maintenance_schedule || []).find(function(it) { return it.id === itemId; });
          if (!item) return;
          var rowEl = listEl.querySelector('.ac-sched-row[data-item-id="' + itemId + '"]');
          if (!rowEl) return;
          var editForm = document.createElement('div');
          editForm.innerHTML = _acScheduleEditHtml(item);
          var formNode = editForm.firstElementChild;
          rowEl.replaceWith(formNode);

          formNode.querySelector('.ac-sched-edit-save').addEventListener('click', async function() {
            var newName = formNode.querySelector('.ac-sched-edit-name').value.trim();
            if (!newName) { alert('Name cannot be empty.'); return; }
            var isMeter = item.schedule_type === 'hobbs' || item.schedule_type === 'tach';
            var updated = Object.assign({}, item, { name: newName });
            if (isMeter) {
              var ih2 = parseFloat(formNode.querySelector('.ac-sched-edit-interval-hours').value);
              if (!isNaN(ih2) && ih2 > 0) updated.interval_hours = ih2;
              var lm2 = parseFloat(formNode.querySelector('.ac-sched-edit-last-meter').value);
              updated.last_done_value = isNaN(lm2) ? undefined : lm2;
            } else {
              var im2 = parseInt(formNode.querySelector('.ac-sched-edit-interval-months').value, 10);
              if (!isNaN(im2) && im2 >= 1) updated.interval_months = im2;
              var ld2 = _acDateToTs(formNode.querySelector('.ac-sched-edit-last-date').value);
              updated.last_done_at = ld2 || undefined;
            }
            var newSchedule = (a.maintenance_schedule || []).map(function(it) {
              return it.id === itemId ? updated : it;
            });
            var ok2 = await _acSaveAircraft({ maintenance_schedule: newSchedule });
            if (ok2) _acInfoRender();
          });

          formNode.querySelector('.ac-sched-edit-cancel').addEventListener('click', function() {
            _acInfoRender();
          });
        });
      });

      listEl.querySelectorAll('.ac-sched-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var itemId = btn.getAttribute('data-item-id');
          var a = _acInfoAircraft;
          var item = (a.maintenance_schedule || []).find(function(it) { return it.id === itemId; });
          if (!item) return;
          if (!confirm('Delete "' + item.name + '"?')) return;
          var newSchedule = (a.maintenance_schedule || []).filter(function(it) { return it.id !== itemId; });
          var ok3 = await _acSaveAircraft({ maintenance_schedule: newSchedule });
          if (ok3) _acInfoRender();
        });
      });
    }
  `;
}
