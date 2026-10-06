/**
 * Live GPS polling: drives the poll loop via flightStore.refresh(), updates per-aircraft
 * status cards and plane markers, and schedules the next adaptive poll.
 */
export function dashboardScriptsLive(): string {
  return `
    // ── Live point ────────────────────────────────────────────────────────────

    // Builds per-tracker live data from store's latest flight points.
    function buildLiveDataByTracker(refreshResult) {
      const result = {};
      const activeTrackers = trackerList.filter(t => t.active && !t.deleted);
      for (const tracker of activeTrackers) {
        const sorted = flightStore.getAll([tracker.id]);
        if (!sorted.length) continue;
        const latest = sorted[sorted.length - 1];
        const lp = latest.points[latest.points.length - 1];
        if (!lp) continue;
        result[tracker.id] = {
          lat: lp.lat, lon: lp.lon,
          velocity_kmh: lp.v, elevation_m: lp.e, course_deg: lp.c,
          garmin_time: lp.t,
          // Use refreshResult label/polled if this is the only tracker, or search by tracker
          location_label: refreshResult?.liveLabelsByTracker?.[tracker.id] ?? null,
          last_polled: refreshResult?.lastPolled ?? null,
        };
      }
      return result;
    }

    // Applies a store refresh result to shared state and re-renders the flight list and status cards.
    function applyStoreResult(result) {
      liveDataByTracker = buildLiveDataByTracker(result);
      const allTrackerIds = trackerList.filter(t => t.active && !t.deleted).map(t => t.id);
      allFlights = flightStore.getAll(allTrackerIds).reverse();
      applyFilter();
      updateAircraftStatusCards();
      refreshAlerts();
    }

    // Full adaptive poll cycle: refresh the store, update status and map.
    async function adaptiveLivePoll() {
      const oldFlights = [...allFlights];
      const allTrackerIds = trackerList.filter(t => t.active && !t.deleted).map(t => t.id);
      try {
        const result = await flightStore.refresh(allTrackerIds);
        const prevData = { ...liveDataByTracker };
        applyStoreResult(result);

        // Geocode follow-up: check if any tracker got a new GPS fix with a pending geocode.
        const anyNewFix = allTrackerIds.some(tid => {
          const cur = liveDataByTracker[tid];
          const prev = prevData[tid];
          return cur && cur.garmin_time && cur.garmin_time !== prev?.garmin_time;
        });
        if (anyNewFix && result.geocodePending) {
          if (geocodeFollowUpTimer) { clearTimeout(geocodeFollowUpTimer); geocodeFollowUpTimer = null; }
          geocodeFollowUpTimer = setTimeout(async () => {
            try {
              const r = await flightStore.refresh(allTrackerIds);
              liveDataByTracker = buildLiveDataByTracker(r);
              updateAircraftStatusCards();
            } catch (_) {}
          }, 15000);
        }

        await refreshMapIfNeeded(oldFlights);
      } catch (_) {}
      finally {
        scheduleNextLivePoll();
      }
    }

    // Schedule the next adaptive poll based on in-flight state across all trackers.
    function scheduleNextLivePoll() {
      if (livePollTimer) { clearTimeout(livePollTimer); livePollTimer = null; }

      const anyInFlight = Object.values(liveDataByTracker).some(d => (d.velocity_kmh ?? 0) >= FLIGHT_THRESHOLD_KMH);
      let delayMs;

      if (anyInFlight) {
        // Track both max (for detecting new data) and min (for scheduling) garmin_time
        // across all in-flight trackers. Using max for change detection, but min for
        // scheduling ensures we don't miss any tracker's next expected fix.
        let latestGarminTime = 0;
        let earliestGarminTime = 0;
        let firstInFlight = true;
        for (const d of Object.values(liveDataByTracker)) {
          if ((d.velocity_kmh ?? 0) >= FLIGHT_THRESHOLD_KMH && d.garmin_time) {
            if (d.garmin_time > latestGarminTime) latestGarminTime = d.garmin_time;
            if (firstInFlight || d.garmin_time < earliestGarminTime) {
              earliestGarminTime = d.garmin_time;
              firstInFlight = false;
            }
          }
        }
        if (latestGarminTime && latestGarminTime !== lastKnownGarminTime) {
          lastKnownGarminTime = latestGarminTime;
          const nextExpectedSec = (earliestGarminTime || latestGarminTime) + 150;
          delayMs = Math.max(30_000, (nextExpectedSec - Math.floor(Date.now() / 1000)) * 1000);
        } else {
          delayMs = 30_000;
        }
      } else {
        delayMs = 60_000;
      }

      livePollTimer = setTimeout(adaptiveLivePoll, delayMs);
    }

    // ── Aircraft status cards ─────────────────────────────────────────────────
    // Card markup and layout live in aircraft-cards.ts; this wires them to live state.

    function _trackerColor(trackerId) {
      return trackerColorFor(trackerList.filter(t => t.active && !t.deleted), trackerId);
    }

    function updateAircraftStatusCards() {
      const container = document.getElementById('aircraft-cards');
      if (!container) return;

      const activeTrackers = trackerList.filter(t => t.active && !t.deleted);
      const lastPolled = Object.values(liveDataByTracker).reduce((best, d) =>
        (d.last_polled ?? 0) > (best ?? 0) ? d.last_polled : best, null);

      // Update refresh time display
      const refreshTime = document.getElementById('refresh-time');
      if (refreshTime) {
        refreshTime.textContent = lastPolled ? relTime(lastPolled) : '—';
      }

      // Rebuild cards
      container.innerHTML = '';
      for (const tracker of activeTrackers) {
        const d = liveDataByTracker[tracker.id];
        const card = buildAircraftCard({
          trackerId: tracker.id,
          label: tracker.assigned_aircraft || tracker.name,
          live: d,
          inFlight: !!d && (d.velocity_kmh ?? 0) >= FLIGHT_THRESHOLD_KMH,
          color: _trackerColor(tracker.id),
          // With a single card there's room for the current altitude and speed too.
          showMetrics: activeTrackers.length === 1,
        });
        card.addEventListener('click', () => {
          openLocationPopup(tracker.id);
        });
        container.appendChild(card);
      }

      // Rebuild cards, then pick the right layout.
      _setupAcLayoutObserver();
      _updateAircraftCardLayout();

      // Update plane markers on the map.
      updateLivePlaneMarkers();
    }

    // ── Aircraft status bar adaptive layout ──────────────────────────────────

    let _acLayoutObserver = null;
    let _acLayoutTimer = null;

    function _debounceAcLayout() {
      if (_acLayoutTimer) clearTimeout(_acLayoutTimer);
      _acLayoutTimer = setTimeout(_updateAircraftCardLayout, 50);
    }

    function _setupAcLayoutObserver() {
      if (_acLayoutObserver) return;
      const bar = document.getElementById('aircraft-status-bar');
      if (!bar || typeof ResizeObserver === 'undefined') return;
      _acLayoutObserver = new ResizeObserver(_debounceAcLayout);
      _acLayoutObserver.observe(bar);
    }

    function _updateAircraftCardLayout() {
      layoutAircraftCards(document.getElementById('aircraft-status-bar'), document.getElementById('aircraft-cards'));
    }


    function updateLivePlaneMarkers() {
      const activeTrackers = trackerList.filter(t => t.active && !t.deleted);

      // Day-view selected — selectDayView placed plane markers on its in-progress flights; don't interfere.
      if (activeDayDate !== null && activeDayDate !== '__overview__') return;

      // Single-flight mode — plane markers are managed by selectFlight; don't interfere.
      if (activeDayDate === null && activeFlightId !== null) return;

      // In overview or no-selection mode: show one marker per tracker that has GPS
      // data, limited to those whose flights appear in filteredFlights.
      const filteredTrackerIds = new Set(filteredFlights.map(f => f.tracker_id));

      for (const tracker of activeTrackers) {
        const d = liveDataByTracker[tracker.id];
        const inFlight = d && (d.velocity_kmh ?? 0) >= FLIGHT_THRESHOLD_KMH;
        const visible = d && d.lat != null && (filteredTrackerIds.has(tracker.id) || filteredFlights.length === 0);
        const color = _trackerColor(tracker.id);

        if (visible) {
          const icon = makePlaneIcon(d.course_deg ?? 0, color);
          if (planeMarkers[tracker.id]) {
            planeMarkers[tracker.id].setLatLng([d.lat, d.lon]);
            planeMarkers[tracker.id].setIcon(icon);
          } else {
            planeMarkers[tracker.id] = L.marker([d.lat, d.lon], {
              icon,
              zIndexOffset: 1000,
              interactive: false,
            }).addTo(map);
          }
        } else {
          if (planeMarkers[tracker.id]) {
            planeMarkers[tracker.id].remove();
            delete planeMarkers[tracker.id];
          }
        }
      }

      // Update map legend for overview / no-selection mode.
      if (activeDayDate === null || activeDayDate === '__overview__') {
        const visibleTrackerIds = activeTrackers.filter(t => planeMarkers[t.id]).map(t => t.id);
        if (visibleTrackerIds.length > 1) {
          _addDayViewLegend(visibleTrackerIds.map(tid => ({
            label: _trackerLegendLabel(tid),
            color: _trackerColor(tid),
          })));
        } else {
          _removeDayViewLegend();
        }
      }
    }
  `;
}
