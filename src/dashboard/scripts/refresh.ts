/**
 * Post-poll map refresh helpers and the manual refresh button handler.
 */
export function dashboardScriptsRefresh(): string {
  return `
    // ── Post-poll map refresh helpers ─────────────────────────────────────────
    function getDayFlights(dk) {
      return filteredFlights.filter(f => {
        const start = new Date(f.start_time * 1000);
        return dayKey(start) === dk;
      });
    }

    async function refreshMapIfNeeded(oldFlights) {
      // A flight changed if its modified_at advanced (new points, labels, etc.)
      function flightChanged(f) {
        const old = oldFlights.find(o => o.id === f.id);
        if (!old) return false;
        return old.modified_at !== f.modified_at;
      }

      const recentInteraction = Date.now() - lastUserInteractionTime < 120_000;

      if (!recentInteraction) {
        // Idle mode: auto-follow the most recent flight when nothing is selected,
        // or when the most recent flight has new data.
        if (allFlights.length > 0) {
          const latest = allFlights[0];
          const oldLatest = oldFlights.find(f => f.start_time === latest.start_time);
          const latestChanged = !oldLatest || oldLatest.modified_at !== latest.modified_at;
          if (activeFlightId === null || latestChanged) {
            activeFlightId = null;
            showDefaultMapView();
          }
        }
        return;
      }

      // Recent interaction: update the route rendering without disturbing the viewport.
      if (activeFlightId !== null) {
        let newFlight = allFlights.find(f => f.id === activeFlightId);
        if (!newFlight) {
          // runSegmentation deleted the active flight and re-created it with a new
          // auto-incremented ID. start_time is stable (derived from the first GPS
          // point's timestamp), so use it to find the replacement.
          const oldActive = oldFlights.find(f => f.id === activeFlightId);
          if (oldActive) {
            newFlight = allFlights.find(f => f.start_time === oldActive.start_time);
          }
        }
        if (newFlight && (flightChanged(newFlight) || newFlight.id !== activeFlightId)) {
          activeFlightId = null;
          const el = document.querySelector('.flight-item[data-id="' + newFlight.id + '"]')
            ?? document.querySelector('.flight-item.active');
          await selectFlight(newFlight, el, false);
        }
      }

      // Auto-follow a genuinely new flight when the user was already watching the
      // previously-newest one. "Genuinely new" = a start_time not present in oldFlights
      // at all (as opposed to a resegmentation which reuses the same start_time).
      if (activeFlightId !== null && allFlights[0] && oldFlights[0]) {
        const isGenuinelyNew = !oldFlights.some(f => f.start_time === allFlights[0].start_time);
        const userWasOnOldLatest = activeFlightId === oldFlights[0].id;
        if (isGenuinelyNew && userWasOnOldLatest) {
          activeFlightId = null;
          const el = document.querySelector('.flight-item[data-id="' + allFlights[0].id + '"]')
            ?? document.querySelector('.flight-item');
          await selectFlight(allFlights[0], el, false);
        }
      }

      if (activeDayDate !== null && activeDayDate !== '__overview__') {
        const dayFlights = getDayFlights(activeDayDate);
        // Compare against the filtered old snapshot: apply the same activeFilters
        // predicate to oldFlights so both sides are filtered consistently.
        const oldDayCount = oldFlights.filter(f => {
          const start = new Date(f.start_time * 1000);
          return dayKey(start) === activeDayDate && filterStore.matchesFlight(f, activeFilters);
        }).length;
        if (dayFlights.length !== oldDayCount || dayFlights.some(flightChanged)) {
          selectDayView([...dayFlights].reverse());
        }
      }
    }

    // ── Refresh button ────────────────────────────────────────────────────────
    // The every-minute cron already keeps D1 within ~60s of live, so this just re-reads
    // D1 (same as the adaptive poll loop) instead of forcing a fresh Garmin fetch — that
    // used to block the button on a sequential per-tracker external HTTP call.
    async function triggerRefresh() {
      const btn = document.getElementById('refresh-btn');
      if (btn) { btn.disabled = true; btn.classList.add('refreshing'); }
      const oldFlights = [...allFlights];
      const allTrackerIds = trackerList.filter(t => t.active && !t.deleted).map(t => t.id);
      try {
        const result = await flightStore.refresh(allTrackerIds);
        applyStoreResult(result);
        await refreshMapIfNeeded(oldFlights);
      } catch (_) {}
      finally {
        if (btn) { btn.disabled = false; btn.classList.remove('refreshing'); }
      }
    }

    document.getElementById('refresh-btn').addEventListener('click', triggerRefresh);

    document.getElementById('show-recent-btn').addEventListener('click', () => {
      showDefaultMapView();
      sidebar.classList.remove('open');
    });
  `;
}
