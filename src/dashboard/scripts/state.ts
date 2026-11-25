/**
 * Map initialisation and all shared mutable state (the flight threshold behind
 * isInFlight() and friends comes with the core bundle).  Assembled
 * first in the IIFE so every subsequent chunk can reference these bindings.
 *
 * `sidebar` is declared here (not in init.ts) because flight-list.ts and
 * day-view.ts close over it to dismiss the mobile drawer on item selection.
 */
export function dashboardScriptsState(): string {
  return `
    // ── Map setup ─────────────────────────────────────────────────────────────
    // The map starts on the default extent but stays hidden (map-pending) until its first
    // view: the fit to the current flights (showDefaultMapView in init.ts), so it never
    // paints the default extent first and then jumps. ensureMapView() shows the default
    // extent when there is nothing to fit.
    const map = createMap(document.getElementById('map'), _ftDefaultView());
    map.getContainer().classList.add('map-pending');
    let mapHasView = false;

    function ensureMapView() {
      if (mapHasView) return;
      mapHasView = true;
      map.getContainer().classList.remove('map-pending');
    }

    // fitBounds options for tracks. On phones the status cards float over the top of
    // the map, so the fit keeps the tracks below them.
    function mapFitOptions() {
      const header = document.querySelector('header');
      const top = window.innerWidth <= 640 && header ? header.getBoundingClientRect().height : 0;
      return { padding: { top: 40 + top, left: 40, right: 40, bottom: 40 }, maxZoom: 16 };
    }

    // Fits the map to [lat, lon] pairs: at once the first time (the map's first view),
    // animated after that.
    function fitMapTo(latlngs) {
      if (!latlngs.length) return;
      map.fitBounds(_ftLatLngBounds(latlngs), Object.assign(mapFitOptions(), mapHasView ? {} : { duration: 0 }));
      ensureMapView();
    }

    // ── Tracker/aircraft/pilot/overlay lists ──────────────────────────────────
    let trackerList = [];        // all tracker rows from /api/trackers
    let aircraftList = [];       // all aircraft rows from /api/aircraft
    let pilotList = [];          // all pilot rows from /api/pilots
    let dashboardRenderedGen = -1; // flightStore.generation() last rendered (live.ts)
    let overlayList = [];        // all tile overlay rows from /api/overlays

    // ── Filter state ──────────────────────────────────────────────────────────
    let activeFilters = { dateFrom: null, dateTo: null, trackerIds: [], pilotIds: [], aircraftTails: [] };

    // ── Shared mutable state ──────────────────────────────────────────────────
    let activeTrack = null;      // the selected flight's shape (addMapShape)
    let activeFlightId = null;
    let activeFlightInProgress = false;
    let liveDataByTracker = {};  // trackerId → live data object
    let planeMarkers = {};       // trackerId → plane marker (addHtmlMarker)
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
    // dayKey of the displayed day view, or '__overview__' for the default view (whether
    // that is drawn as a day view or as the latest flight); null for a selected flight.
    let activeDayDate = null;
    let renderedMapSig = null; // mapDataSig() as of the last full map draw (refresh.ts)

    // ── Adaptive live-poll scheduling ─────────────────────────────────────────
    let livePollTimer = null;
    let lastKnownGarminTime = null;
    let geocodeFollowUpTimer = null;

    // ── Track data exposed to the map-level hover handler ─────────────────────
    let activeLatlngs = [];
    let activePointData = [];
    let hoverDot = null;
    let pinnedTip = false;

    // ── Ground trails (renderGroundTrails in live.ts) ─────────────────────────
    // Their layers, and their points for the hover handler, kept apart from the active*
    // arrays above (which selectFlight/selectDayView replace) and searched after them.
    let groundTrailLayers = [];
    let trailLatlngs = [];
    let trailPointData = [];
    let trailLabels = [];

    // ── Point picker state ────────────────────────────────────────────────────
    let pointPickerActive = false;
    let pickerDot = null;

    // ── Mobile sidebar reference ──────────────────────────────────────────────
    const sidebar = document.querySelector('aside');

    // ── Current user (fetched in init) ────────────────────────────────────────
    let currentUser = null;
  `;
}
