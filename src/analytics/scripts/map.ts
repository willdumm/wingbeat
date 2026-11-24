import { maplibreMapControlsScripts, maplibreOverlayLegendMountScript } from '../../shared/map-controls';
import { sharedSidebarToggleScripts } from '../../shared/sidebar';

export function analyticsScriptsMap(): string {
  return `
    // ── Shared state ──────────────────────────────────────────────────────────
    let trackerList = [];      // populated during init(); used by settings modal & filter
    let aircraftList = [];     // populated during init(); used by filter dropdowns
    let pilotList = [];        // populated during init(); used by filter dropdowns
    let overlayList = [];      // populated during init(); tile overlays shown in the map legend
    let allFlights = [];       // all completed flights across all active trackers
    let filteredFlights = [];  // after applying active filters
    let selectedMonthKey = null;
    let currentView = 'map';

    function setView(view) {
      currentView = view;
      const isMap = view === 'map';
      document.getElementById('streamgraph-container').style.display = isMap ? 'none' : 'flex';
      document.getElementById('layer-controls').style.display = isMap ? '' : 'none';
      document.getElementById('map-controls').style.display = isMap ? '' : 'none';
      document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
      if (!isMap) updateStreamGraph();
    }

    // ── Map initialization ────────────────────────────────────────────────────
    // MapLibre's zoom is Leaflet's less one (512 px tiles), and mapDefaultZoom is stored on
    // Leaflet's scale.
    const analyticsMap = createMap(document.getElementById('analytics-map'), {
      center: [window.APP_SETTINGS.mapDefaultLng, window.APP_SETTINGS.mapDefaultLat],
      zoom: window.APP_SETTINGS.mapDefaultZoom - 1,
    });

    // ── Layer state ───────────────────────────────────────────────────────────
    let heatmapWeightMode = 'time';
    let endpointHeatShape = null;
    let pathDensityShape  = null;
    let flightLinesShape  = null;
    let regionBoundShape  = null;

    // ── Sidebar reference ─────────────────────────────────────────────────────
    const sidebar = document.querySelector('aside');

    // ── Layer update functions ────────────────────────────────────────────────
    function getToggles() {
      return getLayerToggles(document.getElementById('layer-controls'));
    }

    function updateEndpointHeatmap() {
      if (endpointHeatShape) { endpointHeatShape.remove(); endpointHeatShape = null; }
      if (!getToggles().endpointHeat || filteredFlights.length === 0) return;
      endpointHeatShape = addEndpointHeat(analyticsMap, filteredFlights, heatmapWeightMode);
    }

    function updatePointLayers() {
      if (pathDensityShape) { pathDensityShape.remove(); pathDensityShape = null; }
      if (flightLinesShape) { flightLinesShape.remove(); flightLinesShape = null; }
      const toggles = getToggles();
      if (!filteredFlights.length) return;
      if (toggles.pathDensity) pathDensityShape = addRouteHeat(analyticsMap, filteredFlights);
      if (toggles.flightLines) flightLinesShape = addFlightLines(analyticsMap, filteredFlights);
    }

    function updateRegionBoundaries() {
      if (regionBoundShape) { regionBoundShape.remove(); regionBoundShape = null; }
      if (getToggles().regionBounds) regionBoundShape = addRegionBounds(analyticsMap, REGIONS);
    }

    function refreshMapLayers() {
      updateEndpointHeatmap();
      updateRegionBoundaries();
      updatePointLayers();
    }

    // ── Monthly accounting: month row click expands/collapses region detail ───
    function renderAccounting() {
      renderAccountingInto(document.getElementById('accounting-table-container'), filteredFlights, selectedMonthKey, key => {
        selectedMonthKey = selectedMonthKey === key ? null : key;
        renderAccounting();
      });
    }

    // ── Full re-render ────────────────────────────────────────────────────────
    function rerender() {
      const activeTrackerIds = trackerList.filter(t => t.active && !t.deleted).map(t => t.id);
      allFlights = flightStore.getCompleted(activeTrackerIds);
      filteredFlights = allFlights.filter(f => filterStore.matchesFlight(f, _analyticsActiveFilters));
      renderOverallTotals(document.getElementById('overall-totals-container'), filteredFlights);
      renderAccounting();
      refreshMapLayers();
      updateStreamGraph();
    }

    // ── Settings modal hooks ──────────────────────────────────────────────────
    settingsAfterTrackerChange = async () => {
      // Each list on its own: one that fails to load keeps its old value.
      const [trackers, aircraft, pilots] = await Promise.allSettled([fetchTrackers(), fetchAircraft(), fetchPilots()]);
      if (trackers.status === 'fulfilled') trackerList = trackers.value.trackers;
      if (aircraft.status === 'fulfilled') aircraftList = aircraft.value.aircraft;
      if (pilots.status === 'fulfilled') { pilotList = pilots.value.pilots; flightStore.setPilots(pilotList); }
      refreshFilterDropdowns();
      rerender();
    };

    settingsOnClearCache = async () => {
      const activeTrackerIds = trackerList.filter(t => t.active && !t.deleted).map(t => t.id);
      flightStore.clearCache();
      await flightStore.refresh(activeTrackerIds).catch(() => {});
      rerender();
    };

    // Active filters for this page (set by initFilters callback).
    let _analyticsActiveFilters = filterStore.load();

    // ── Initialization ────────────────────────────────────────────────────────
    // The map chrome and page controls, wired before any data loads so they work whatever
    // the data does.
    function wirePage() {
      // View toggle (Map / Stream Graph)
      document.querySelectorAll('.view-tab').forEach(tab => {
        tab.addEventListener('click', () => setView(tab.dataset.view));
      });

      // Stream graph toolbar controls
      wireSgControls();

      // ── Zoom controls + basemap switcher ────────────────────────────────────
      ${maplibreMapControlsScripts('analyticsMap')}
      ${maplibreOverlayLegendMountScript('analyticsMap')}

      // Legend: layer toggles, heatmap weight mode, collapse
      wireLayerControls(document.getElementById('layer-controls'), {
        onLayerToggle: (layerId) => {
          if (layerId === 'endpoint-heat') updateEndpointHeatmap();
          else if (layerId === 'path-density' || layerId === 'flight-lines') updatePointLayers();
          else refreshMapLayers();
        },
        onWeightMode: (mode) => {
          heatmapWeightMode = mode;
          updateEndpointHeatmap();
        },
      });

      // Touch scroll guard (prevents iOS Safari page-behind-status-bar scroll)
      document.addEventListener('touchmove', e => {
        if (!e.target.closest('.analytics-panel, .settings-modal, .form-modal, .map-controls-bar, .overlay-legend-panel')) e.preventDefault();
      }, { passive: false });
    }

    async function init() {
      wirePage();
      await loadRegions();
      // Each list on its own: one that fails to load keeps its old value.
      const [trackers, aircraft, pilots, overlays] = await Promise.allSettled([fetchTrackers(), fetchAircraft(), fetchPilots(),
        fetchOverlays()]);
      if (trackers.status === 'fulfilled') trackerList = trackers.value.trackers;
      if (aircraft.status === 'fulfilled') aircraftList = aircraft.value.aircraft;
      if (pilots.status === 'fulfilled') { pilotList = pilots.value.pilots; flightStore.setPilots(pilotList); }
      if (overlays.status === 'fulfilled') overlayList = overlays.value.overlays;
      _ftRenderOverlayLegend();

      const activeTrackers = trackerList.filter(t => t.active && !t.deleted);
      if (!activeTrackers.length) {
        document.getElementById('accounting-table-container').innerHTML =
          '<div class="empty-msg">No trackers configured.</div>';
        return;
      }

      const activeTrackerIds = activeTrackers.map(t => t.id);

      // Initialise filter UI.
      initFilters((newFilters) => {
        _analyticsActiveFilters = newFilters;
        filteredFlights = allFlights.filter(f => filterStore.matchesFlight(f, _analyticsActiveFilters));
        renderOverallTotals(document.getElementById('overall-totals-container'), filteredFlights);
        renderAccounting();
        refreshMapLayers();
        updateStreamGraph();
      });

      // Phase 1: paint from cache synchronously.
      flightStore.init();
      allFlights = flightStore.getCompleted(activeTrackerIds);
      filteredFlights = allFlights.filter(f => filterStore.matchesFlight(f, _analyticsActiveFilters));
      renderOverallTotals(document.getElementById('overall-totals-container'), filteredFlights);
      renderAccounting();
      refreshMapLayers();

      // Phase 2: fetch incremental update.
      try {
        await flightStore.refresh(activeTrackerIds);
        allFlights = flightStore.getCompleted(activeTrackerIds);
        filteredFlights = allFlights.filter(f => filterStore.matchesFlight(f, _analyticsActiveFilters));
        renderOverallTotals(document.getElementById('overall-totals-container'), filteredFlights);
        renderAccounting();
        refreshMapLayers();
        updateStreamGraph();
      } catch (_err) {
        if (allFlights.length === 0) {
          document.getElementById('accounting-table-container').innerHTML =
            '<div class="empty-msg">Failed to load flight data.</div>';
          return;
        }
      }

      // Re-render when another tab updates the store.
      flightStore.onChange(rerender);
    }

    init();

    // ── Sidebar toggle ────────────────────────────────────────────────────────
    ${sharedSidebarToggleScripts('analyticsMap', 'panel')}
  `;
}
