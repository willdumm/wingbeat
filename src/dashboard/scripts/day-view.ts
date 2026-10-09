/**
 * Day-view: renders a set of flights simultaneously — a calendar day's ("Map all"), or
 * every in-progress flight (the default map view) — with numbered end markers that group
 * when they overlap at the current zoom and plane markers on in-progress flights
 * (drawing itself lives in track-render.ts).
 * Colors are assigned per-tracker using ColorBrewer Dark2 (via _trackerColor).
 * When multiple trackers are present, stop numbers restart at 1 per tracker
 * and a map legend is shown.
 */
export function dashboardScriptsDayView(): string {
  return `
    // ── Day view helpers ──────────────────────────────────────────────────────

    // Returns the legend display label for a tracker:
    // aircraft name (or tail) if assigned, else tracker name.
    function _trackerLegendLabel(trackerId) {
      const tracker = trackerList.find(t => t.id === trackerId);
      if (!tracker) return 'Tracker ' + trackerId;
      return tracker.assigned_aircraft || tracker.name;
    }

    function _removeDayViewLegend() {
      const existing = document.getElementById('day-view-legend');
      if (existing) existing.remove();
    }

    function _addDayViewLegend(entries) {
      _removeDayViewLegend();
      document.getElementById('map').appendChild(buildDayViewLegend(entries));
    }

    function clearDayView() {
      for (const layer of dailyLayers) layer.remove();
      dailyLayers = [];
      for (const m of dailyEndMarkers) m.remove();
      dailyEndMarkers = [];
      currentDayEndInfos = null;
      _removeDayViewLegend();
    }

    // Re-places the day's end markers for the current zoom. Called on load and on zoomend.
    function renderEndMarkers(endInfos) {
      for (const m of dailyEndMarkers) m.remove();
      dailyEndMarkers = placeEndMarkers(map, endInfos);
    }

    map.on('zoomend', () => {
      if (currentDayEndInfos) renderEndMarkers(currentDayEndInfos);
    });

    // In-progress: this flight is the most-recent for its tracker and the tracker is airborne.
    function _isFlightInProgress(flight) {
      const latestForTracker = allFlights.find(f => f.tracker_id === flight.tracker_id);
      const trackerLive = liveDataByTracker[flight.tracker_id] ?? null;
      return latestForTracker?.id === flight.id && !!trackerLive && (trackerLive.velocity_kmh ?? 0) >= FLIGHT_THRESHOLD_KMH;
    }

    // Draws flights (chronological) all at once in per-tracker colors, with plane markers
    // on the in-progress ones. Used for a day's "Map all" and for the default view.
    // Pass fit: false to redraw without moving the viewport.
    function selectDayView(flights, { fit = true } = {}) {
      if (activeTrack) { activeTrack.remove(); activeTrack = null; }
      if (activeStartMarker) { activeStartMarker.remove(); activeStartMarker = null; }
      if (activeEndMarker) { activeEndMarker.remove(); activeEndMarker = null; }
      // Remove all plane markers — drawDayTracks places them for in-progress flights.
      for (const [tid, marker] of Object.entries(planeMarkers)) {
        marker.remove();
        delete planeMarkers[tid];
      }
      clearDayView();
      activeLatlngs = [];
      activePointData = [];
      activePointLabels = [];
      hoverTip.remove();
      if (hoverDot) { hoverDot.remove(); hoverDot = null; }
      pinnedTip = false;
      activeFlightId = null;
      document.querySelectorAll('.flight-item').forEach(e => e.classList.remove('active'));

      const drawn = drawDayTracks(map, flights, {
        colorFor: _trackerColor,
        isInProgress: _isFlightInProgress,
        livePosition: (tid) => liveDataByTracker[tid] ?? null,
      });
      dailyLayers.push(...drawn.layers);
      Object.assign(planeMarkers, drawn.planes);
      activeLatlngs = drawn.latlngs;
      activePointData = drawn.pointData;
      activePointLabels = drawn.labels;

      // Fit before placing the end markers: their grouping depends on the zoom, and on
      // first load the map has no view until this fit.
      if (fit && drawn.allPoints.length > 0) {
        map.fitBounds(L.latLngBounds(drawn.allPoints), mapFitOptions());
      }
      ensureMapView();

      currentDayEndInfos = drawn.endInfos;
      renderEndMarkers(drawn.endInfos);

      if (drawn.trackerIds.length > 1) {
        _addDayViewLegend(drawn.trackerIds.map(tid => ({
          label: _trackerLegendLabel(tid),
          color: _trackerColor(tid),
        })));
      }

      // In the default view this also adds plane markers for aircraft on the ground.
      updateLivePlaneMarkers();
    }

    // Default map view: every in-progress flight, across all trackers. With nothing
    // airborne, falls back to the most recent flight. Pass fit: false to redraw without
    // moving the viewport.
    function showDefaultMapView({ fit = true } = {}) {
      activeDayDate = '__overview__';
      const current = filteredFlights.filter(_isFlightInProgress);
      if (current.length > 0) {
        selectDayView([...current].reverse(), { fit });
        return;
      }

      if (filteredFlights.length > 0) {
        const f = filteredFlights[0];
        const el = document.querySelector('.flight-item[data-id="' + f.id + '"]');
        activeFlightId = null;
        selectFlight(f, el, fit);
        return;
      }

      selectDayView([], { fit });
    }
  `;
}
