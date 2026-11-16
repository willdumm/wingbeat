export function dashboardScriptsAlerts(): string {
  return `
    // ── Alerts feed ──────────────────────────────────────────────────────────

    // The alerts for the page's lists as of now (@wingbeat/core/alerts: unassigned flights,
    // maintenance, missing readings, pilots near a duty limit), sorted by urgency.
    function computeAlerts() {
      return computeAlertsFor({ flights: flightStore.getAll(), aircraft: aircraftList, pilots: pilotList, trackers: trackerList });
    }

    function _alertRowHtml(alert) {
      var borderClass = alert.urgency === 'immediate' ? 'immediate' : 'due_soon';
      // The row's words are core's (alertText), as in the app and its notifications.
      var words = alertText(alert);
      var bodyHtml = '<div class="alert-body">' +
        '<span class="alert-text">' + escHtml(words.text) + '</span>' +
        (words.detail ? '<span class="alert-desc">' + escHtml(words.detail) + '</span>' : '') +
        '</div>';
      var icon, actionLabel, actionDataAttrs;

      if (alert.kind === 'unassigned_flight') {
        icon = '!';
        actionLabel = 'Assign';
        actionDataAttrs = 'data-flight-id="' + escHtml(String(alert.flight_id)) + '"';
      } else if (alert.kind === 'maintenance') {
        icon = '⚠';
        actionLabel = 'View';
        actionDataAttrs = 'data-aircraft-tail="' + escHtml(alert.aircraft_tail) + '"';
      } else if (alert.kind === 'timer_not_recorded') {
        icon = '⚑';
        actionLabel = 'Set';
        actionDataAttrs = 'data-aircraft-tail="' + escHtml(alert.aircraft_tail) + '"';
      } else {
        icon = '⚑';
        actionLabel = 'Log';
        actionDataAttrs = 'data-pilot-id="' + escHtml(String(alert.pilot_id)) + '" data-pilot-name="' + escHtml(alert.pilot_name) + '"';
      }

      var isAdmin = currentUser?.role === 'admin';
      var hideAction = alert.kind === 'unassigned_flight' && !isAdmin;
      var clickClass = alert.kind === 'unassigned_flight' ? ' alert-row-clickable' : '';
      return '<div class="alert-row ' + borderClass + clickClass + '" data-alert-kind="' + escHtml(alert.kind) + '" ' + actionDataAttrs + '>' +
        '<span class="alert-icon">' + icon + '</span>' +
        bodyHtml +
        (hideAction ? '' : '<button class="alert-action-btn btn-secondary" ' + actionDataAttrs + ' data-alert-kind="' + escHtml(alert.kind) + '">' + actionLabel + '</button>') +
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
          openFlightForm(flight);
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
