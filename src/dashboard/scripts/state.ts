/**
 * Map initialisation, all shared mutable state, and the FLIGHT_THRESHOLD_KMH
 * constant (injected from the server-side SPEED_THRESHOLD_KMH).  Assembled
 * first in the IIFE so every subsequent chunk can reference these bindings.
 *
 * `sidebar` is declared here (not in init.ts) because flight-list.ts and
 * day-view.ts close over it to dismiss the mobile drawer on item selection.
 */
import { sharedTileLayerDefs } from '../../shared/map-controls';

export function dashboardScriptsState(speedThreshold: number): string {
  return `
    // ── Map setup ─────────────────────────────────────────────────────────────
    // No view yet: the first one is the fit to the current flights (showDefaultMapView in
    // init.ts), so the map never paints the default extent first and then jumps. Leaflet
    // holds layers added before then until it has a view. ensureMapView() falls back to
    // the default extent when there is nothing to fit.
    const map = L.map('map', { zoomControl: false, attributionControl: false });

    function ensureMapView() {
      if (map._loaded) return;
      map.setView(
        [window.APP_SETTINGS.mapDefaultLat, window.APP_SETTINGS.mapDefaultLng],
        window.APP_SETTINGS.mapDefaultZoom
      );
    }

    // fitBounds options for tracks. On phones the status cards float over the top of
    // the map, so the fit keeps the tracks below them.
    function mapFitOptions() {
      const header = document.querySelector('header');
      const top = window.innerWidth <= 640 && header ? header.getBoundingClientRect().height : 0;
      return { paddingTopLeft: [40, 40 + top], paddingBottomRight: [40, 40] };
    }

    ${sharedTileLayerDefs('map')}

    // ── Tracker/aircraft/pilot/overlay lists ──────────────────────────────────
    let trackerList = [];        // all tracker rows from /api/trackers
    let aircraftList = [];       // all aircraft rows from /api/aircraft
    let pilotList = [];          // all pilot rows from /api/pilots
    let overlayList = [];        // all tile overlay rows from /api/overlays

    // ── Filter state ──────────────────────────────────────────────────────────
    let activeFilters = { dateFrom: null, dateTo: null, trackerIds: [], pilotIds: [], aircraftTails: [] };

    // ── Shared mutable state ──────────────────────────────────────────────────
    let activeTrack = null;
    let activeStartMarker = null;
    let activeEndMarker = null;
    let activeFlightId = null;
    let activeFlightInProgress = false;
    let liveDataByTracker = {};  // trackerId → live data object
    let planeMarkers = {};       // trackerId → L.Marker
    let allFlights = [];
    let filteredFlights = [];    // result of applyFilter(); used by map view and status cards
    let dailyLayers = [];
    let dailyEndMarkers = [];   // refreshed on zoom; kept separate from dailyLayers
    let currentDayEndInfos = null; // non-null while a day view is active
    let activePointLabels = [];
    let expandedDays = null;  // null = first render; Set<string> after
    let seenDayKeys = new Set(); // tracks every day key we've ever rendered
    let lastUserInteractionTime = 0; // ms; updated on manual pan/zoom or flight click
    let lastMapInputTime = 0; // ms; last touch/mouse/wheel input on the map or its controls

    // Poll-driven re-fits wait until the map has gone this long without input, so an
    // update never pulls the view away from where the user is looking.
    const MAP_INPUT_SETTLE_MS = 20_000;
    function mapInputSettled() { return Date.now() - lastMapInputTime >= MAP_INPUT_SETTLE_MS; }
    let activeDayDate = null; // dayKey or '__overview__' of the currently displayed day view

    // Speed threshold (km/h) injected from the server-side constant.
    const FLIGHT_THRESHOLD_KMH = ${speedThreshold};

    // ── Adaptive live-poll scheduling ─────────────────────────────────────────
    let livePollTimer = null;
    let lastKnownGarminTime = null;
    let geocodeFollowUpTimer = null;

    // ── Track data exposed to the map-level hover handler ─────────────────────
    let activeLatlngs = [];
    let activePointData = [];
    let hoverDot = null;
    let pinnedTip = false;

    // ── Point picker state ────────────────────────────────────────────────────
    let pointPickerActive = false;
    let pickerDot = null;

    // ── Mobile sidebar reference ──────────────────────────────────────────────
    const sidebar = document.querySelector('aside');

    // ── Current user (fetched in init) ────────────────────────────────────────
    let currentUser = null;
  `;
}
