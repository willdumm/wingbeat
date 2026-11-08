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
      // Each list on its own: one that fails to load keeps its old value.
      const [trackers, aircraft, pilots] = await Promise.allSettled([fetchTrackers(), fetchAircraft(), fetchPilots()]);
      if (trackers.status === 'fulfilled') trackerList = trackers.value.trackers;
      if (aircraft.status === 'fulfilled') aircraftList = aircraft.value.aircraft;
      if (pilots.status === 'fulfilled') { pilotList = pilots.value.pilots; flightStore.setPilots(pilotList); }
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
