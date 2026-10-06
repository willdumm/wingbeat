import { sharedMaintenanceHelperScripts } from '../../shared/aircraft-info';

export function dashboardScriptsAlerts(): string {
  return `
    ${sharedMaintenanceHelperScripts()}
    // ── Alerts feed ──────────────────────────────────────────────────────────

    function _alEsc(s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function computeAlerts() {
      var now = Math.floor(Date.now() / 1000);
      var flights = flightStore.getAll();
      var flightsByTail = new Map();
      var flightsByPilot = new Map();
      for (var _fi = 0; _fi < flights.length; _fi++) {
        var _f = flights[_fi];
        if (_f.aircraft_tail) {
          if (!flightsByTail.has(_f.aircraft_tail)) flightsByTail.set(_f.aircraft_tail, []);
          flightsByTail.get(_f.aircraft_tail).push(_f);
        }
        if (_f.pilot_id !== null && _f.pilot_id !== undefined) {
          if (!flightsByPilot.has(_f.pilot_id)) flightsByPilot.set(_f.pilot_id, []);
          flightsByPilot.get(_f.pilot_id).push(_f);
        }
      }
      var alerts = [];

      // 1. Unassigned flights (last 30 days)
      var cutoff30 = now - 30 * 86400;
      var activeAcTailsSet = {};
      aircraftList.filter(function(a) { return a.active; }).forEach(function(a) { activeAcTailsSet[a.tail_number] = true; });
      var activePilotIdsSet = {};
      pilotList.filter(function(p) { return p.active; }).forEach(function(p) { activePilotIdsSet[p.id] = true; });
      var activeTrackerIdsSet = {};
      trackerList.filter(function(t) { return t.active && !t.deleted; }).forEach(function(t) { activeTrackerIdsSet[t.id] = true; });

      for (var i = 0; i < flights.length; i++) {
        var f = flights[i];
        if (f.start_time < cutoff30) continue;
        if (!activeTrackerIdsSet[f.tracker_id]) continue;
        if (f.aircraft_tail && !activeAcTailsSet[f.aircraft_tail]) continue;
        if (f.pilot_id && !activePilotIdsSet[f.pilot_id]) continue;
        var missing = [];
        if (!f.aircraft_tail) missing.push('aircraft');
        if (!f.pilot_id) missing.push('pilot');
        if (missing.length === 0) continue;

        var dateStr = new Date(f.start_time * 1000).toLocaleDateString('default', { month: 'short', day: 'numeric' });
        var timeStr = new Date(f.start_time * 1000).toLocaleTimeString('default', { hour: 'numeric', minute: '2-digit' });
        var acLabel = f.aircraft_tail || 'no aircraft';
        var label = missing.indexOf('pilot') >= 0 ? dateStr + ' · ' + acLabel + ' · no pilot' : dateStr + ' · no aircraft';
        if (missing.length === 2) label = dateStr + ' · no aircraft or pilot';

        alerts.push({
          kind: 'unassigned_flight',
          flight_id: f.id,
          flight_label: label,
          flight_time_str: timeStr,
          flight_origin: f.origin_label || null,
          flight_destination: f.destination_label || null,
          start_time: f.start_time,
          missing: missing,
          urgency: 'immediate',
        });
      }

      // 2. Maintenance & timer alerts for active aircraft
      var activeAircraft = aircraftList.filter(function(a) { return a.active; });
      for (var j = 0; j < activeAircraft.length; j++) {
        var ac = activeAircraft[j];
        var cf_h = (ac.hobbs_correction !== null && ac.hobbs_correction !== undefined) ? ac.hobbs_correction : 1.0;
        var cf_t = (ac.tach_correction !== null && ac.tach_correction !== undefined) ? ac.tach_correction : 1.0;
        var tailFlights = flightsByTail.get(ac.tail_number) || [];
        var estHobbs = _estimatedMeter(ac.hobbs_time, ac.hobbs_recorded_at, cf_h, ac.tail_number, tailFlights);
        var estTach  = _estimatedMeter(ac.tach_time, ac.tach_recorded_at, cf_t, ac.tail_number, tailFlights);

        // Avg hobbs rate over last 30 days — used for cross-type sort ordering
        var cutoffAc = now - 30 * 86400;
        var recentAcFlights = tailFlights.filter(function(f) { return f.start_time >= cutoffAc; });
        var recentHobbsHours = recentAcFlights.reduce(function(s, f) { return s + _flightHours(f) * cf_h; }, 0);
        var avgHobbsPerDay = recentHobbsHours / 30;

        var schedule = ac.maintenance_schedule || [];
        var missingHobbsItems = [];
        var missingTachItems = [];
        var missingCalItems = [];

        for (var k = 0; k < schedule.length; k++) {
          var item = schedule[k];
          var st = _maintenanceStatus(item, estHobbs, estTach);

          if (st.status === 'timer_not_recorded') {
            if (item.schedule_type === 'hobbs') missingHobbsItems.push(item.name);
            else if (item.schedule_type === 'tach') missingTachItems.push(item.name);
            else missingCalItems.push(item.name);
          } else if (st.status === 'overdue' || st.status === 'due_soon') {
            var estDays = null;
            if (st.remaining_hours !== undefined) {
              estDays = avgHobbsPerDay > 0 ? st.remaining_hours / avgHobbsPerDay : null;
            } else if (st.remaining_days !== undefined) {
              estDays = st.remaining_days;
            }
            alerts.push({
              kind: 'maintenance',
              aircraft_tail: ac.tail_number,
              aircraft_name: ac.name,
              item: item,
              status: st,
              urgency: st.status === 'overdue' ? 'immediate' : 'due_soon',
              _estDays: estDays,
            });
          }
        }

        if (missingHobbsItems.length > 0) {
          alerts.push({ kind: 'timer_not_recorded', aircraft_tail: ac.tail_number, aircraft_name: ac.name, timer_type: 'hobbs', needed_for: missingHobbsItems.join(', '), urgency: 'immediate' });
        }
        if (missingTachItems.length > 0) {
          alerts.push({ kind: 'timer_not_recorded', aircraft_tail: ac.tail_number, aircraft_name: ac.name, timer_type: 'tach', needed_for: missingTachItems.join(', '), urgency: 'immediate' });
        }
        if (missingCalItems.length > 0) {
          alerts.push({ kind: 'timer_not_recorded', aircraft_tail: ac.tail_number, aircraft_name: ac.name, timer_type: 'calendar', needed_for: missingCalItems.join(', '), urgency: 'immediate' });
        }
      }

      // 3. Pilot duty alerts (FAR 135.267-style limits)
      var DUTY_LIMITS = [
        { window_label: '24-hour',  window_seconds: 86400,    limit_hours: 8    },
        { window_label: '7-day',    window_seconds: 604800,   limit_hours: 36   },
        { window_label: '30-day',   window_seconds: 2592000,  limit_hours: 100  },
        { window_label: '90-day',   window_seconds: 7776000,  limit_hours: 250  },
        { window_label: '12-month', window_seconds: 31536000, limit_hours: 1000 },
      ];

      var activePilots = pilotList.filter(function(p) { return p.active; });
      for (var m = 0; m < activePilots.length; m++) {
        var pilot = activePilots[m];
        var worstPct = 0;
        var worstAlert = null;

        for (var n = 0; n < DUTY_LIMITS.length; n++) {
          var dl = DUTY_LIMITS[n];
          var windowStart = now - dl.window_seconds;
          var pid = pilot.id;
          var hoursFlown = (flightsByPilot.get(pid) || [])
            .filter(function(f) { return f.start_time >= windowStart; })
            .reduce(function(s, f) { return s + _flightHours(f); }, 0);
          var pct = hoursFlown / dl.limit_hours;
          if (pct >= 0.90 && pct > worstPct) {
            worstPct = pct;
            worstAlert = {
              kind: 'pilot_duty',
              pilot_id: pilot.id,
              pilot_name: pilot.name,
              window_label: dl.window_label,
              hours_flown: hoursFlown,
              limit_hours: dl.limit_hours,
              pct: pct,
              urgency: 'due_soon',
            };
          }
        }

        if (worstAlert) alerts.push(worstAlert);
      }

      return _sortAlerts(alerts);
    }

    function _sortAlerts(alerts) {
      var immediate = alerts.filter(function(a) { return a.urgency === 'immediate'; });
      var dueSoon   = alerts.filter(function(a) { return a.urgency === 'due_soon'; });

      var immUnassigned = immediate.filter(function(a) { return a.kind === 'unassigned_flight'; });
      var immTimer      = immediate.filter(function(a) { return a.kind === 'timer_not_recorded'; });
      var immMaint      = immediate.filter(function(a) { return a.kind === 'maintenance'; });

      immUnassigned.sort(function(a, b) { return a.start_time - b.start_time; });
      immTimer.sort(function(a, b) { return a.aircraft_tail.localeCompare(b.aircraft_tail); });
      immMaint.sort(function(a, b) {
        var da = a._estDays !== null && a._estDays !== undefined ? a._estDays : 999;
        var db = b._estDays !== null && b._estDays !== undefined ? b._estDays : 999;
        return da - db;
      });

      var dsMaint = dueSoon.filter(function(a) { return a.kind === 'maintenance'; });
      var dsPilot = dueSoon.filter(function(a) { return a.kind === 'pilot_duty'; });

      dsMaint.sort(function(a, b) {
        var da = a._estDays !== null && a._estDays !== undefined ? a._estDays : 9999;
        var db = b._estDays !== null && b._estDays !== undefined ? b._estDays : 9999;
        return da - db;
      });
      dsPilot.sort(function(a, b) { return b.pct - a.pct; });

      return immUnassigned.concat(immTimer).concat(immMaint).concat(dsMaint).concat(dsPilot);
    }

    function _alertRowHtml(alert) {
      var borderClass = alert.urgency === 'immediate' ? 'immediate' : 'due_soon';
      var icon, bodyHtml, actionLabel, actionDataAttrs;

      if (alert.kind === 'unassigned_flight') {
        icon = '!';
        var descParts = [];
        if (alert.flight_time_str) descParts.push(alert.flight_time_str);
        if (alert.flight_origin) {
          descParts.push(alert.flight_origin + (alert.flight_destination ? ' → ' + alert.flight_destination : ''));
        }
        bodyHtml = '<div class="alert-body">' +
          '<span class="alert-text">' + _alEsc(alert.flight_label) + '</span>' +
          (descParts.length > 0 ? '<span class="alert-desc">' + _alEsc(descParts.join(' · ')) + '</span>' : '') +
          '</div>';
        actionLabel = 'Assign';
        actionDataAttrs = 'data-flight-id="' + _alEsc(String(alert.flight_id)) + '"';
      } else if (alert.kind === 'maintenance') {
        icon = '⚠';
        var acParts = alert.aircraft_name ? [alert.aircraft_tail, alert.aircraft_name] : [alert.aircraft_tail];
        bodyHtml = '<div class="alert-body"><span class="alert-text">' + _alEsc(acParts.join(' · ') + ' · ' + alert.item.name + ' · ' + alert.status.due_label) + '</span></div>';
        actionLabel = 'View';
        actionDataAttrs = 'data-aircraft-tail="' + _alEsc(alert.aircraft_tail) + '"';
      } else if (alert.kind === 'timer_not_recorded') {
        icon = '⚑';
        var acParts2 = alert.aircraft_name ? [alert.aircraft_tail, alert.aircraft_name] : [alert.aircraft_tail];
        var timerDesc = alert.timer_type === 'calendar'
          ? 'Last service date not set (' + alert.needed_for + ')'
          : (alert.timer_type === 'hobbs' ? 'Hobbs' : 'Tach') + ' not recorded (' + alert.needed_for + ')';
        bodyHtml = '<div class="alert-body"><span class="alert-text">' + _alEsc(acParts2.join(' · ') + ' · ' + timerDesc) + '</span></div>';
        actionLabel = 'Set';
        actionDataAttrs = 'data-aircraft-tail="' + _alEsc(alert.aircraft_tail) + '"';
      } else {
        icon = '⚑';
        bodyHtml = '<div class="alert-body"><span class="alert-text">' + _alEsc(alert.pilot_name + ' · ' + alert.hours_flown.toFixed(1) + '/' + alert.limit_hours + ' hr (' + alert.window_label + ')') + '</span></div>';
        actionLabel = 'Log';
        actionDataAttrs = 'data-pilot-id="' + _alEsc(String(alert.pilot_id)) + '" data-pilot-name="' + _alEsc(alert.pilot_name) + '"';
      }

      var isAdmin = currentUser?.role === 'admin';
      var hideAction = alert.kind === 'unassigned_flight' && !isAdmin;
      var clickClass = alert.kind === 'unassigned_flight' ? ' alert-row-clickable' : '';
      return '<div class="alert-row ' + borderClass + clickClass + '" data-alert-kind="' + _alEsc(alert.kind) + '" ' + actionDataAttrs + '>' +
        '<span class="alert-icon">' + icon + '</span>' +
        bodyHtml +
        (hideAction ? '' : '<button class="alert-action-btn btn-secondary" ' + actionDataAttrs + ' data-alert-kind="' + _alEsc(alert.kind) + '">' + actionLabel + '</button>') +
      '</div>';
    }

    function renderAlerts(alerts) {
      var strip = document.getElementById('alerts-strip');
      if (!strip) return;

      strip.classList.toggle('hidden', !alerts || alerts.length === 0);
      if (!alerts || alerts.length === 0) return;

      var immCount  = alerts.filter(function(a) { return a.urgency === 'immediate'; }).length;
      var soonCount = alerts.filter(function(a) { return a.urgency === 'due_soon'; }).length;

      var totalLabel = alerts.length + ' alert' + (alerts.length !== 1 ? 's' : '');
      var summaryExtra = '';
      if (immCount > 0) summaryExtra += ' <span class="alerts-imm">· ' + immCount + ' immediate</span>';
      else if (soonCount > 0) summaryExtra += ' <span class="alerts-soon">· ' + soonCount + ' due soon</span>';

      document.getElementById('alerts-summary').innerHTML = '⚠ ' + totalLabel + summaryExtra;

      var listEl = document.getElementById('alerts-list');
      var rowsHtml = '';
      for (var i = 0; i < alerts.length; i++) {
        rowsHtml += _alertRowHtml(alerts[i]);
      }
      listEl.innerHTML = rowsHtml;

      listEl.querySelectorAll('.alert-action-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          _handleAlertAction(btn);
        });
      });

      listEl.querySelectorAll('.alert-row-clickable').forEach(function(row) {
        row.addEventListener('click', function() {
          var flightId = parseInt(row.getAttribute('data-flight-id'), 10);
          var flight = allFlights.find(function(f) { return f.id === flightId; });
          if (!flight) return;
          lastUserInteractionTime = Date.now();
          var el = document.querySelector('.flight-item[data-id="' + flightId + '"]');
          selectFlight(flight, el || null);
          sidebar.classList.remove('open');
        });
      });
    }

    function _handleAlertAction(btn) {
      var kind = btn.getAttribute('data-alert-kind');

      if (kind === 'unassigned_flight') {
        var flightId = parseInt(btn.getAttribute('data-flight-id'), 10);
        var flight = allFlights.find(function(f) { return f.id === flightId; });
        if (flight) {
          var el = document.querySelector('.flight-item[data-id="' + flightId + '"]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          openAssignmentModal(flight);
        }
      } else if (kind === 'maintenance' || kind === 'timer_not_recorded') {
        var tail = btn.getAttribute('data-aircraft-tail');
        var aircraft = aircraftList.find(function(a) { return a.tail_number === tail; });
        if (aircraft) openAircraftInfo(aircraft);
      } else if (kind === 'pilot_duty') {
        var pilotId = parseInt(btn.getAttribute('data-pilot-id'), 10);
        var pilotName = btn.getAttribute('data-pilot-name');
        openPilotDuty(pilotId, pilotName);
      }
    }

    function refreshAlerts() {
      renderAlerts(computeAlerts());
    }

    function initAlerts() {
      initToggleSection(
        document.getElementById('alerts-strip-bar'),
        document.getElementById('alerts-list')
      );
      refreshAlerts();
    }
  `;
}
