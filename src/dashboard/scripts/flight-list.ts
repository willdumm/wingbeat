import { icon } from '../../shared/icons';

/**
 * Flight list rows: groups flights into days and builds the day headings and flight rows.
 * Takes its data as arguments rather than reading dashboard state, so the docs-site
 * showcase (src/showcase/) renders the same list from sample data. Needs dayKey/fmtDay/
 * fmtTime from helpers.ts.
 */
export function dashboardScriptsFlightListRender(): string {
  const chevronIconHtml = icon('chevron-right', { size: 14 });
  return `
    const FLIGHT_LIST_CHEVRON_HTML = ${JSON.stringify(chevronIconHtml)};

    // Groups flights (already sorted) into [{ label, dayKey, flights }] by local day.
    function groupFlightsByDay(flights) {
      const dayGroups = [];
      let lastDayKey = null;
      let currentGroup = null;
      for (const f of flights) {
        const start = new Date(f.start_time * 1000);
        const dk = dayKey(start);
        if (dk !== lastDayKey) {
          currentGroup = { label: fmtDay(start), dayKey: dk, flights: [] };
          dayGroups.push(currentGroup);
          lastDayKey = dk;
        }
        currentGroup.flights.push(f);
      }
      return dayGroups;
    }

    // Collapsible day heading with a flight count and a "Map all" button.
    // Returns { heading, chevron } so the caller can wire expand/collapse.
    function buildFlightDayHeading(group, { expanded, onMapAll }) {
      const heading = document.createElement('div');
      heading.className = 'flight-day-heading';
      heading.dataset.dayKey = group.dayKey;

      const chevron = document.createElement('span');
      chevron.className = 'chevron';
      chevron.innerHTML = FLIGHT_LIST_CHEVRON_HTML;
      chevron.setAttribute('data-open', expanded ? 'true' : 'false');
      heading.appendChild(chevron);

      const dayLabel = document.createElement('span');
      dayLabel.className = 'day-label';
      dayLabel.textContent = group.label;
      heading.appendChild(dayLabel);

      const countBadge = document.createElement('span');
      countBadge.className = 'day-count';
      const n = group.flights.length;
      countBadge.textContent = n + (n === 1 ? ' flight' : ' flights');
      heading.appendChild(countBadge);

      const btn = document.createElement('button');
      btn.className = 'day-view-btn btn-secondary';
      btn.textContent = 'Map all';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onMapAll();
      });
      heading.appendChild(btn);

      return { heading, chevron };
    }

    // One flight row: start time, duration, route, and aircraft/pilot assignment.
    // hasAircraft/hasPilots: whether any are configured, which decides whether a missing
    // assignment reads "Unknown Aircraft"/"Unknown Pilot" or is left out.
    function buildFlightItem(f, { active, hasAircraft, hasPilots }) {
      const el = document.createElement('div');
      el.className = 'flight-item' + (active ? ' active' : '');
      el.dataset.id = f.id;

      const start = new Date(f.start_time * 1000);
      const dur = f.end_time ? ((f.end_time - f.start_time) / 3600).toFixed(1) : null;

      let routeHtml = '';
      if (f.origin_label || f.destination_label) {
        const origin = f.origin_label || '?';
        const dest = f.destination_label || (f.end_time ? '?' : '');
        routeHtml = '<div class="flight-route">' + origin + ' →' + (dest ? ' ' + dest : '') + '</div>';
      }

      const assignParts = [];
      if (f.aircraft_tail) assignParts.push(f.aircraft_tail);
      else if (hasAircraft) assignParts.push('Unknown Aircraft');
      if (f.pilot_name) assignParts.push(f.pilot_name);
      else if (f.pilot_id != null) assignParts.push('Unknown Pilot');
      else if (hasPilots) assignParts.push('Unknown Pilot');
      const assignHtml = assignParts.length > 0
        ? '<div class="flight-assign">' + assignParts.join(' · ') + '</div>'
        : '';

      el.innerHTML =
        '<div class="flight-item-header">' +
          '<div class="flight-date">' + fmtTime(start) + (dur != null ? ' <span class="flight-dur">(' + dur + ' hr)</span>' : '') + '</div>' +
        '</div>' +
        routeHtml + assignHtml;
      return el;
    }
  `;
}

/**
 * Flight list sidebar: day-grouped rendering with collapsible sections,
 * per-flight selection using embedded points from the store, and shared filter.
 */
export function dashboardScriptsFlightList(): string {
  return `
    // ── Flights list ──────────────────────────────────────────────────────────
    function renderFlightList(flights, isFiltered) {
      const list = document.getElementById('flight-list');
      const empty = document.getElementById('empty-msg');

      if (flights.length === 0) {
        empty.textContent = 'No flights recorded yet.';
        empty.style.display = '';
        list.querySelectorAll('.flight-item, .flight-day-heading, .day-flights-body').forEach(el => el.remove());
        return;
      }

      empty.style.display = 'none';
      list.querySelectorAll('.flight-item, .flight-day-heading, .day-flights-body').forEach(el => el.remove());

      const dayGroups = groupFlightsByDay(flights);

      // Auto-expand any of the two most recent days the first time they appear.
      if (expandedDays === null) expandedDays = new Set();
      dayGroups.slice(0, 2).forEach(g => {
        if (!seenDayKeys.has(g.dayKey)) expandedDays.add(g.dayKey);
      });
      dayGroups.forEach(g => seenDayKeys.add(g.dayKey));

      for (const group of dayGroups) {
        const isExpanded = isFiltered || expandedDays.has(group.dayKey);

        const chronoFlights = [...group.flights].reverse();
        const { heading, chevron } = buildFlightDayHeading(group, {
          expanded: isExpanded,
          onMapAll: () => {
            activeDayDate = group.dayKey;
            selectDayView(chronoFlights);
            sidebar.classList.remove('open');
          },
        });
        list.appendChild(heading);

        const body = document.createElement('div');
        body.className = 'day-flights-body';
        if (!isExpanded) body.style.display = 'none';

        for (const f of group.flights) {
          const el = buildFlightItem(f, {
            active: f.id === activeFlightId,
            hasAircraft: aircraftList.length > 0,
            hasPilots: pilotList.length > 0,
          });

          el.addEventListener('click', () => {
            lastUserInteractionTime = Date.now();
            selectFlight(f, el);
            sidebar.classList.remove('open');
          });
          body.appendChild(el);
        }

        list.appendChild(body);

        if (!isFiltered) {
          heading.addEventListener('click', () => {
            const nowExpanded = expandedDays.has(group.dayKey);
            if (nowExpanded) {
              expandedDays.delete(group.dayKey);
              body.style.display = 'none';
              chevron.setAttribute('data-open', 'false');
            } else {
              expandedDays.add(group.dayKey);
              body.style.display = '';
              chevron.setAttribute('data-open', 'true');
            }
          });
        }
      }
    }

    // Select a flight and draw its track using embedded points from the store.
    // Pass fitView=false to update the route without resetting the viewport.
    async function selectFlight(flight, el, fitView = true) {
      clearDayView();
      activeDayDate = null;
      const alreadySelected = activeFlightId === flight.id;
      activeFlightId = flight.id;
      if (alreadySelected) return;

      document.querySelectorAll('.flight-item').forEach(e => e.classList.remove('active'));
      if (el) el.classList.add('active');

      if (activeTrack) { activeTrack.remove(); activeTrack = null; }
      if (activeStartMarker) { activeStartMarker.remove(); activeStartMarker = null; }
      if (activeEndMarker) { activeEndMarker.remove(); activeEndMarker = null; }
      activeFlightInProgress = false;
      activeLatlngs = [];
      activePointData = [];
      activePointLabels = [];
      hoverTip.remove();
      if (hoverDot) { hoverDot.remove(); hoverDot = null; }
      pinnedTip = false;

      // Remove all plane markers while in single-flight view.
      for (const [tid, marker] of Object.entries(planeMarkers)) {
        marker.remove();
        delete planeMarkers[tid];
      }

      if ((flight.points ?? []).length === 0) return;

      // This flight is in-progress if it is the most-recent for its tracker and the tracker is airborne.
      const latestForTracker = allFlights.find(f => f.tracker_id === flight.tracker_id);
      const isLatestForTracker = latestForTracker?.id === flight.id;
      const trackerLive = liveDataByTracker[flight.tracker_id] ?? null;
      const inProgress = isLatestForTracker && (trackerLive == null || (trackerLive.velocity_kmh ?? 0) >= FLIGHT_THRESHOLD_KMH);

      const drawn = drawFlightTrack(map, flight, {
        inProgress,
        // Show the red end marker only for completed older flights; for the most-recent
        // flight the plane icon serves as the position indicator.
        showEndMarker: !inProgress && !isLatestForTracker,
        // Show this tracker's plane marker whenever viewing its most-recent flight,
        // regardless of whether it is currently airborne.
        plane: (isLatestForTracker && trackerLive?.lat)
          ? { lat: trackerLive.lat, lon: trackerLive.lon, course_deg: trackerLive.course_deg, color: _trackerColor(flight.tracker_id) }
          : null,
      });

      activeTrack = drawn.track;
      activeStartMarker = drawn.startMarker;
      activeEndMarker = drawn.endMarker;
      if (drawn.planeMarker) planeMarkers[flight.tracker_id] = drawn.planeMarker;
      activeLatlngs = drawn.latlngs;
      activePointData = drawn.pointData;
      activePointLabels = drawn.labels;
      activeFlightInProgress = inProgress;

      if (fitView) map.fitBounds(activeTrack.getBounds(), { padding: [40, 40] });
    }

    function applyFilter() {
      const isFiltered = !!(activeFilters.dateFrom || activeFilters.dateTo ||
        activeFilters.trackerIds.length || activeFilters.pilotIds.length || activeFilters.aircraftTails.length);
      filteredFlights = allFlights.filter(f => filterStore.matchesFlight(f, activeFilters));
      renderFlightList(filteredFlights, isFiltered);
    }
  `;
}
