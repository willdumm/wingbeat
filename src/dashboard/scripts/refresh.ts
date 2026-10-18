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

    // Everything the map is drawn from: the flights and each tracker's live position and
    // ground trail. A full draw (selectFlight, selectDayView) records it in renderedMapSig.
    function mapDataSig() {
      return JSON.stringify([
        allFlights.map(f => [f.id, f.modified_at]),
        Object.entries(liveDataByTracker).map(([tid, d]) =>
          [tid, d.garmin_time, d.last_point_time, (d.ground_trail ?? []).length]),
      ]);
    }

    // Redraws the map after allFlights or the live data changed (a poll, the refresh
    // button, or a correction saved anywhere), through the same function that drew the
    // current view, so the result matches what a page load would show. Only the viewport
    // differs: it is refit only once the map has been left alone. The "latest flight" it
    // follows is the newest tracked one: manual flights have no track.
    async function refreshMapIfNeeded(oldFlights) {
      const recentInteraction = Date.now() - lastUserInteractionTime < 120_000;
      const latestTracked = allFlights.find(f => f.tracker_id != null);
      const oldLatestTracked = oldFlights.find(f => f.tracker_id != null);
      const dataChanged = mapDataSig() !== renderedMapSig;

      if (activeDayDate === '__overview__') {
        if (dataChanged) showDefaultMapView({ fit: !recentInteraction && mapInputSettled() });
        return;
      }

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

      // Idle: go back to following the most recent flight once it has new data.
      if (!recentInteraction && latestTracked) {
        const oldLatest = oldFlights.find(f => _sameTrackedFlight(f, latestTracked));
        if (!oldLatest || oldLatest.modified_at !== latestTracked.modified_at) {
          activeFlightId = null;
          showDefaultMapView({ fit: mapInputSettled() });
          return;
        }
      }

      if (!dataChanged) return;

      // A selected flight: redraw it in place, without disturbing the viewport.
      if (activeFlightId !== null) {
        let flight = allFlights.find(f => f.id === activeFlightId);
        if (!flight) {
          // runSegmentation deleted the active flight and re-created it with a new
          // auto-incremented ID. Its tracked start is stable, so use it to find the
          // replacement.
          const oldActive = oldFlights.find(f => f.id === activeFlightId);
          if (oldActive) flight = allFlights.find(f => _sameTrackedFlight(f, oldActive));
        }
        // Auto-follow a genuinely new flight when the user was watching the previously
        // newest one. "Genuinely new" = a tracked start not present in oldFlights at all
        // (as opposed to a resegmentation, which keeps it).
        if (latestTracked && oldLatestTracked && activeFlightId === oldLatestTracked.id &&
            !oldFlights.some(f => _sameTrackedFlight(f, latestTracked))) {
          flight = latestTracked;
        }
        if (!flight) return;
        activeFlightId = null;
        const el = document.querySelector('.flight-item[data-id="' + flight.id + '"]');
        await selectFlight(flight, el, false);
        return;
      }

      if (activeDayDate !== null) {
        selectDayView([...getDayFlights(activeDayDate)].reverse(), { fit: mapInputSettled() });
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
