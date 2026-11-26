import { sharedMapControlsScripts, tileOverlayLegendMountScript } from '../../shared/map-controls';
import { sharedSidebarToggleScripts } from '../../shared/sidebar';

export function analyticsScriptsMap(): string {
  return `
    // ── Shared state ──────────────────────────────────────────────────────────
    let trackerList = [];      // populated during init(); used by settings modal & filter
    let aircraftList = [];     // populated during init(); used by filter dropdowns
    let pilotList = [];        // populated during init(); used by filter dropdowns
    let overlayList = [];      // populated during init(); tile overlays shown in the map legend
    let activeTrackerIds = null;   // trackerList's active ones (the cached ones until it loads)
    let pagePainted = false;
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
    const analyticsMap = createMap(document.getElementById('analytics-map'), _ftDefaultView());

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

    function activeIdsOf(trackers) {
      return trackers.filter(t => t.active && !t.deleted).map(t => t.id);
    }

    // ── Full re-render ────────────────────────────────────────────────────────
    function rerender() {
      pagePainted = true;
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
      if (trackers.status === 'fulfilled') { trackerList = trackers.value.trackers; activeTrackerIds = activeIdsOf(trackerList); }
      if (aircraft.status === 'fulfilled') aircraftList = aircraft.value.aircraft;
      if (pilots.status === 'fulfilled') { pilotList = pilots.value.pilots; flightStore.setPilots(pilotList); }
      refreshFilterDropdowns();
      rerender();
    };

    settingsOnClearCache = async () => {
      flightStore.clearCache();
      await flightStore.refresh(activeTrackerIds || []).catch(() => {});
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
      ${sharedMapControlsScripts('analyticsMap')}
      ${tileOverlayLegendMountScript('analyticsMap')}

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

    // The last load's regions and active tracker ids, so cached flights paint before (or
    // without) an answer for either. In Cache storage: region shapes in localStorage would
    // crowd out the flights there.
    const _PAGE_CACHE_NAME = 'ft-analytics-v1', _PAGE_CACHE_KEY = '/analytics-page-cache';

    async function loadPageCache() {
      try {
        const hit = await (await caches.open(_PAGE_CACHE_NAME)).match(_PAGE_CACHE_KEY);
        const cached = hit ? await hit.json() : null;
        return cached && cached.regions && Array.isArray(cached.trackerIds) ? cached : null;
      } catch (_) { return null; }
    }

    async function savePageCache() {
      if (!REGIONS || !activeTrackerIds) return;
      try {
        const body = JSON.stringify({ regions: REGIONS, trackerIds: activeTrackerIds });
        await (await caches.open(_PAGE_CACHE_NAME)).put(_PAGE_CACHE_KEY, new Response(body));
      } catch (_) {}
    }

    // Each on its own, filling in when it arrives: one that fails or hangs keeps its old value.
    function loadLists() {
      fetchAircraft().then(r => { aircraftList = r.aircraft; refreshFilterDropdowns(); }, () => {});
      fetchPilots().then(r => { pilotList = r.pilots; flightStore.setPilots(pilotList); refreshFilterDropdowns(); }, () => {});
      fetchOverlays().then(r => { overlayList = r.overlays; _ftRenderOverlayLegend(); }, () => {});
    }

    async function refreshFlights() {
      try {
        await flightStore.refresh(activeTrackerIds);
      } catch (_err) {
        if (allFlights.length === 0) showAccountingMessage('Failed to load flight data.');
        return;
      }
      rerender();
    }

    function showAccountingMessage(text) {
      document.getElementById('accounting-table-container').innerHTML = '<div class="empty-msg">' + text + '</div>';
    }

    async function init() {
      wirePage();
      initFilters((newFilters) => {
        _analyticsActiveFilters = newFilters;
        if (pagePainted) rerender();
      });
      flightStore.init();

      loadLists();
      const regionsLoaded = loadRegions();
      const trackersLoaded = fetchTrackers().then(r => {
        trackerList = r.trackers;
        activeTrackerIds = activeIdsOf(trackerList);
        refreshFilterDropdowns();
      }, () => {});
      const bothLoaded = Promise.all([regionsLoaded, trackersLoaded]).then(savePageCache);
      // A #settings/<page> URL opens settings over the page, once it has the trackers.
      trackersLoaded.then(() => settingsOpenFromUrl());

      // Phase 1: paint from cache; without the regions and tracker ids cached, wait for them.
      const cached = await loadPageCache();
      let paintedIds = null, cachedRefresh = null;
      if (cached) {
        REGIONS = REGIONS || cached.regions;
        paintedIds = activeTrackerIds = activeTrackerIds || cached.trackerIds;
        rerender();
        regionsLoaded.then(changed => { if (changed) rerender(); });
        if (paintedIds.length) cachedRefresh = refreshFlights();
        await trackersLoaded;
      } else {
        await bothLoaded;
      }
      if (!activeTrackerIds) { showAccountingMessage('Failed to load flight data.'); return; }
      if (!activeTrackerIds.length) { showAccountingMessage('No trackers configured.'); return; }

      // Phase 2: fetch incremental update, again if the trackers aren't the cached ones.
      if (String(paintedIds) !== String(activeTrackerIds)) {
        rerender();
        await cachedRefresh;
        await refreshFlights();
      }

      // Re-render when another tab updates the store.
      await cachedRefresh;
      flightStore.onChange(rerender);
    }

    init();

    // ── Sidebar toggle ────────────────────────────────────────────────────────
    ${sharedSidebarToggleScripts('panel')}
  `;
}
