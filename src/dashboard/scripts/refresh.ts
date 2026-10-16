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

    // The flight's identity across re-segmentation: its tracker's own start time (a
    // corrected departure doesn't change it). Manual flights have no tracker.
    function _trackedStart(f) {
      return f.edit && 'start_time' in f.edit.original ? f.edit.original.start_time : f.start_time;
    }
    function _sameTrackedFlight(a, b) {
      return a.tracker_id != null && a.tracker_id === b.tracker_id && _trackedStart(a) === _trackedStart(b);
    }

    // Redraws the map after allFlights changed (a poll, or a correction saved anywhere).
    // The "latest flight" it follows is the newest tracked one: manual flights have no
    // track.
    async function refreshMapIfNeeded(oldFlights) {
      // A flight changed if its modified_at advanced (new points, labels, an edit, etc.)
      function flightChanged(f) {
        const old = oldFlights.find(o => o.id === f.id);
        if (!old) return false;
        return old.modified_at !== f.modified_at;
      }

      const recentInteraction = Date.now() - lastUserInteractionTime < 120_000;
      const latestTracked = allFlights.find(f => f.tracker_id != null);
      const oldLatestTracked = oldFlights.find(f => f.tracker_id != null);

      // The selected flight was removed (or deleted): fall back to the default view.
      if (activeFlightId !== null) {
        const oldActive = oldFlights.find(f => f.id === activeFlightId);
        const stillThere = allFlights.some(f => f.id === activeFlightId) ||
          (oldActive && allFlights.some(f => _sameTrackedFlight(f, oldActive)));
        if (!stillThere) {
          activeFlightId = null;
          showDefaultMapView({ fit: mapInputSettled() });
          return;
        }
      }

      if (!recentInteraction) {
        // Idle mode: auto-follow the most recent flight when nothing is selected,
        // or when the most recent flight has new data.
        if (latestTracked) {
          const latest = latestTracked;
          const oldLatest = oldFlights.find(f => _sameTrackedFlight(f, latest));
          const latestChanged = !oldLatest || oldLatest.modified_at !== latest.modified_at;
          if (activeFlightId === null || latestChanged) {
            activeFlightId = null;
            // Redraw with the new data, but only re-fit once the map has been left alone.
            showDefaultMapView({ fit: mapInputSettled() });
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
            newFlight = allFlights.find(f => _sameTrackedFlight(f, oldActive));
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
      if (activeFlightId !== null && latestTracked && oldLatestTracked) {
        const isGenuinelyNew = !oldFlights.some(f => _sameTrackedFlight(f, latestTracked));
        const userWasOnOldLatest = activeFlightId === oldLatestTracked.id;
        if (isGenuinelyNew && userWasOnOldLatest) {
          activeFlightId = null;
          const el = document.querySelector('.flight-item[data-id="' + latestTracked.id + '"]')
            ?? document.querySelector('.flight-item');
          await selectFlight(latestTracked, el, false);
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
          selectDayView([...dayFlights].reverse(), { fit: mapInputSettled() });
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
