/**
 * Settings modal hooks for the dashboard.
 * Tracker switching has been replaced by the shared filter chips.
 */
export function dashboardScriptsAircraft(): string {
  return `
    // ── Settings modal hooks ──────────────────────────────────────────────────

    settingsAfterTrackerChange = async () => {
      const wasEmpty = trackerList.filter(t => t.active && !t.deleted).length === 0;
      // Re-fetch lists so filter dropdowns and status cards stay current.
      try {
        const [trackerResp, aircraftResp, pilotResp] = await Promise.all([
          fetch('/api/trackers'),
          fetch('/api/aircraft'),
          fetch('/api/pilots'),
        ]);
        if (trackerResp.ok) { const d = await trackerResp.json(); trackerList = d.trackers; }
        if (aircraftResp.ok) { const d = await aircraftResp.json(); aircraftList = d.aircraft; }
        if (pilotResp.ok) { const d = await pilotResp.json(); pilotList = d.pilots; }
      } catch (_) {}
      if (wasEmpty && trackerList.filter(t => t.active && !t.deleted).length > 0) {
        location.reload();
        return;
      }
      refreshFilterDropdowns();
      updateAircraftStatusCards();
    };

    settingsOnClearCache = async () => {
      const allTrackerIds = trackerList.filter(t => t.active && !t.deleted).map(t => t.id);
      flightStore.clearCache(allTrackerIds);
      expandedDays = null;
      activeFlightId = null;
      const result = await flightStore.refresh(allTrackerIds);
      applyStoreResult(result);
    };
  `;
}
