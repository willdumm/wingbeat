/**
 * showcase.js: the landing page's client script. One IIFE made of the same client-side
 * chunks the dashboard and analytics pages ship (status cards, track rendering, flight
 * list rows, maintenance and duty-log renderers, accounting, heatmaps, stream graph),
 * plus a driver that expands the sample data and mounts each demo into a shadow root.
 * Because the demos call the real renderers, a change to the app UI shows up here on
 * the next `npm run docs:showcase`.
 */
import { SPEED_THRESHOLD_KMH } from '../geo';
import { Env } from '../types';
import { themeRuntimeScript } from '../shared/theme';
import { mapLayerColorRuntimeScript, mapLayersRuntimeScript, sharedTileLayerDefs, sharedMapControlsScripts, staticSiteBasemapPresets } from '../shared/map-controls';
import { filterScript } from '../shared/filters';
import { sharedSidebarToggleScripts } from '../shared/sidebar';
import { aircraftInfoRenderScript } from '../shared/aircraft-info';
import { pilotDutyRenderScript } from '../shared/pilot-duty';
import { dashboardScriptsHelpers } from '../dashboard/scripts/helpers';
import { dashboardScriptsIcons } from '../dashboard/scripts/icons';
import { dashboardScriptsHover } from '../dashboard/scripts/hover';
import { dashboardScriptsAircraftCards } from '../dashboard/scripts/aircraft-cards';
import { dashboardScriptsTrackRender } from '../dashboard/scripts/track-render';
import { dashboardScriptsFlightListRender } from '../dashboard/scripts/flight-list';
import { dashboardScriptsPointPicker } from '../dashboard/scripts/point-picker';
import { elevationToolScript } from '../shared/elevation';
import { analyticsScriptsRegion } from '../analytics/scripts/region';
import { analyticsScriptsTime } from '../analytics/scripts/time';
import { analyticsScriptsAccounting } from '../analytics/scripts/accounting';
import { analyticsScriptsStreamgraphRender } from '../analytics/scripts/streamgraph';
import { analyticsScriptsLayers } from '../analytics/scripts/layers';
import { SampleData } from './sample-data';
import { formatLocalDateTime } from '../shared/format';
import { synthesizeTrack } from './tracks';
import { demoMarkup, demoStylesheets } from './demos';
import { SHOWCASE_TILE_KEY_META } from './page';

// Where both maps start before they fit to their data: Kodiak Island and the Katmai coast.
const MAP_DEFAULT = { lat: 57.75, lng: -153.6, zoom: 7 };

export function showcaseScript(sample: SampleData): string {
  const settings = {
    appName: sample.appName,
    timezone: sample.timezone,
    mapDefaultLat: MAP_DEFAULT.lat,
    mapDefaultLng: MAP_DEFAULT.lng,
    mapDefaultZoom: MAP_DEFAULT.zoom,
  };
  const body = [
    // First: pilotDutyRenderScript reads APP_SETTINGS.timezone when it's evaluated.
    `window.APP_SETTINGS = ${JSON.stringify(settings)};`,
    `const SAMPLE = ${JSON.stringify(sample)};`,
    `const DEMO_CSS = ${JSON.stringify(demoStylesheets())};`,
    `const DEMO_MARKUP = ${JSON.stringify(demoMarkup(sample.appName))};`,
    `const FLIGHT_THRESHOLD_KMH = ${SPEED_THRESHOLD_KMH};`,
    // Assigned rather than declared: the bundler may rename the function itself.
    `const synthesizeTrack = ${synthesizeTrack.toString()};`,
    `const formatLocalDateTime = ${formatLocalDateTime.toString()};`,
    `const trackerList = SAMPLE.trackers;`,
    themeRuntimeScript(),
    mapLayerColorRuntimeScript(),
    // No app Worker behind the docs site to hold the Carto key, so keyed basemaps use a
    // public, referrer-restricted key that Hugo writes into the page (see
    // SHOWCASE_TILE_KEY_META), and are left out when there isn't one.
    mapLayersRuntimeScript({} as Env, staticSiteBasemapPresets()),
    `(() => {
      const key = document.querySelector('meta[name="${SHOWCASE_TILE_KEY_META}"]')?.content;
      _ftPresets = _ftPresets.flatMap(p => !p.secretEnvVar ? [p]
        : key ? [{ ...p, url: p.url.replace('{KEY}', encodeURIComponent(key)) }] : []);
    })();`,
    filterScript(),
    dashboardScriptsHelpers(),
    dashboardScriptsIcons(),
    dashboardScriptsAircraftCards(),
    dashboardScriptsTrackRender(),
    dashboardScriptsFlightListRender(),
    aircraftInfoRenderScript(),
    pilotDutyRenderScript(),
    analyticsScriptsRegion(),
    `REGIONS = SAMPLE.regions;`,
    analyticsScriptsTime(),
    analyticsScriptsAccounting(),
    analyticsScriptsStreamgraphRender(),
    analyticsScriptsLayers(),
    showcaseDriverScript(),
  ].join('\n');
  return `(() => {\n${body}\n})();\n`;
}

function showcaseDriverScript(): string {
  return `
    // ── Sample data → flights on the visitor's clock ──────────────────────────
    // Flights are stored as "N days ago at HH:MM" in the sample timezone, with "now" at
    // SAMPLE.nowMinute today. The whole schedule shifts so that moment is the visitor's
    // now: the aircraft in the air are in the air, and each one's legs still join up.

    const NOW = Math.floor(Date.now() / 1000);
    const [_todayY, _todayM, _todayD] = unixToTzDateStr(NOW).split('-').map(Number);

    function localMidnight(daysAgo) {
      const d = new Date(Date.UTC(_todayY, _todayM - 1, _todayD - daysAgo));
      return tzDayStartUnix(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    const SHIFT = NOW - (localMidnight(0) + SAMPLE.nowMinute * 60);

    const TERRAIN = { ...SAMPLE.terrain, elevations: Uint8Array.from(atob(SAMPLE.terrain.elevations), c => c.charCodeAt(0)) };
    function synthesize(from, to, seed, kmh, altM) {
      return synthesizeTrack(placeLatLon(from), placeLatLon(to), seed, kmh, altM, SAMPLE.intervalSec, TERRAIN, SAMPLE.terrainClearanceM);
    }

    const TRACKERS_BY_ID = Object.fromEntries(SAMPLE.trackers.map(t => [t.id, t]));
    const PILOTS_BY_ID = Object.fromEntries(SAMPLE.pilots.map(p => [p.id, p]));
    const ACTIVE_TRACKERS = SAMPLE.trackers.filter(t => t.active && !t.deleted);

    // The same flight shape the flight store hands the dashboard and analytics pages.
    function makeFlight(id, trackerId, pilotId, start, fixes, originLabel, destinationLabel, completed) {
      const points = fixes.map(([t, lat, lon, v, e, c]) => ({ t: start + t, lat, lon, v, e, c }));
      const first = points[0], last = points[points.length - 1];
      return {
        id,
        tracker_id: trackerId,
        pilot_id: pilotId,
        pilot_name: PILOTS_BY_ID[pilotId]?.name ?? null,
        aircraft_tail: TRACKERS_BY_ID[trackerId]?.assigned_aircraft ?? null,
        start_time: start,
        end_time: completed ? last.t : null,
        origin_label: originLabel,
        destination_label: completed ? destinationLabel : null,
        start_lat: first.lat, start_lon: first.lon,
        end_lat: last.lat, end_lon: last.lon,
        points,
      };
    }

    function placeLatLon(i) { return [SAMPLE.places[i][1], SAMPLE.places[i][2]]; }

    // In-progress flights: the fixes received so far, the latest one ageSec ago.
    const LIVE_FLIGHTS = [];
    const LIVE_LABELS = {};
    for (const lv of SAMPLE.live) {
      const fixes = synthesize(lv.from, lv.to, lv.seed, lv.cruiseKmh, lv.cruiseAltM);
      const cutoff = fixes[fixes.length - 1][0] * lv.progress;
      const flown = fixes.filter(p => p[0] <= cutoff);
      const start = NOW - lv.ageSec - flown[flown.length - 1][0];
      LIVE_FLIGHTS.push(makeFlight(lv.id, lv.trackerId, lv.pilotId, start, flown, SAMPLE.places[lv.from][0], null, false));
      LIVE_LABELS[lv.trackerId] = lv.locationLabel;
    }

    const COMPLETED_FLIGHTS = [];
    for (const [id, trackerId, pilotId, daysAgo, startMin, from, to, seed, kmh, altM] of SAMPLE.flights) {
      COMPLETED_FLIGHTS.push(makeFlight(id, trackerId, pilotId, localMidnight(daysAgo) + startMin * 60 + SHIFT,
        synthesize(from, to, seed, kmh, altM), SAMPLE.places[from][0], SAMPLE.places[to][0], true));
    }

    // Newest first, like the dashboard's allFlights.
    const ALL_FLIGHTS = [...LIVE_FLIGHTS, ...COMPLETED_FLIGHTS].sort((a, b) => b.start_time - a.start_time);
    COMPLETED_FLIGHTS.sort((a, b) => a.start_time - b.start_time);

    const LATEST_BY_TRACKER = {};
    for (const f of ALL_FLIGHTS) if (!LATEST_BY_TRACKER[f.tracker_id]) LATEST_BY_TRACKER[f.tracker_id] = f;

    // Per-tracker live data: the last fix of the tracker's latest flight. A tracker on the
    // ground keeps reporting from where it landed, so its newest fix is recent too.
    const LIVE_BY_TRACKER = {};
    for (const t of ACTIVE_TRACKERS) {
      const f = LATEST_BY_TRACKER[t.id];
      if (!f) continue;
      const lp = f.points[f.points.length - 1];
      const parked = f.end_time != null;
      LIVE_BY_TRACKER[t.id] = {
        lat: lp.lat, lon: lp.lon,
        velocity_kmh: parked ? 0 : lp.v, elevation_m: lp.e, course_deg: lp.c,
        garmin_time: parked ? NOW - SAMPLE.groundFixAgeSec : lp.t,
        location_label: LIVE_LABELS[t.id] ?? f.destination_label,
      };
    }

    function colorFor(trackerId) { return trackerColorFor(ACTIVE_TRACKERS, trackerId); }
    function tailFor(trackerId) {
      const t = TRACKERS_BY_ID[trackerId];
      return t ? (t.assigned_aircraft || t.name) : 'Tracker ' + trackerId;
    }

    // ── Demo hosts ────────────────────────────────────────────────────────────

    const SHEETS = {};
    function sheet(key) {
      if (!SHEETS[key]) {
        SHEETS[key] = new CSSStyleSheet();
        SHEETS[key].replaceSync(DEMO_CSS[key]);
      }
      return SHEETS[key];
    }

    const HOSTS = [];
    function syncHostThemes() {
      const theme = document.documentElement.getAttribute('data-theme') || 'light';
      HOSTS.forEach(h => h.setAttribute('data-theme', theme));
    }
    new MutationObserver(syncHostThemes)
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Opens a shadow root on host with the page stylesheet (dashboard or analytics) and
    // the demo layout sheet, fills it with markup and starts rendering its icons.
    function attachDemo(host, pageSheet, markup) {
      const root = host.attachShadow({ mode: 'open' });
      root.adoptedStyleSheets = [sheet(pageSheet), sheet('demo')];
      root.innerHTML = markup;
      HOSTS.push(host);
      syncHostThemes();
      if (window.wbObserveIcons) window.wbObserveIcons(root);
      return root;
    }

    // Resolves once the shadow root's Leaflet stylesheet has loaded, so maps measure
    // their container with the right CSS in place.
    function leafletCssReady(root) {
      const link = root.querySelector('link[rel="stylesheet"]');
      if (!link || link.sheet) return Promise.resolve();
      return new Promise(resolve => {
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 4000);
      });
    }

    // Leaflet only re-measures on window resize; a frame can change size on its own
    // (layout breakpoints, the sidebar drawer), so re-measure whenever the container does.
    function watchMapSize(mapObj) {
      const el = mapObj.getContainer();
      // Skip while hidden (the stream graph view): a zero-size map breaks the heat layers.
      new ResizeObserver(debounce(() => { if (el.offsetWidth && el.offsetHeight) mapObj.invalidateSize(); }, 50)).observe(el);
    }

    function debounce(fn, ms) {
      let timer = null;
      return () => { clearTimeout(timer); timer = setTimeout(fn, ms); };
    }

    // ── Status bar ────────────────────────────────────────────────────────────

    function mountStatus(host) {
      const root = attachDemo(host, 'dashboard', DEMO_MARKUP.status);
      const bar = root.getElementById('aircraft-status-bar');
      const container = root.getElementById('aircraft-cards');

      function render() {
        container.innerHTML = '';
        for (const t of ACTIVE_TRACKERS) {
          const d = LIVE_BY_TRACKER[t.id] ?? null;
          container.appendChild(buildAircraftCard({
            trackerId: t.id,
            label: t.assigned_aircraft || t.name,
            live: d,
            inFlight: !!d && (d.velocity_kmh ?? 0) >= FLIGHT_THRESHOLD_KMH,
            color: colorFor(t.id),
            showMetrics: true,
          }));
        }
        layoutAircraftCards(bar, container);
      }
      render();
      new ResizeObserver(debounce(() => layoutAircraftCards(bar, container), 50)).observe(bar);
      // Card widths are measured, so lay out again once the web fonts are in.
      if (document.fonts) document.fonts.ready.then(() => layoutAircraftCards(bar, container));
      // Keep "GPS n min ago" honest while the page stays open.
      setInterval(render, 60000);
    }

    // ── Flight list + map ─────────────────────────────────────────────────────

    async function mountFlights(host) {
      const root = attachDemo(host, 'dashboard', DEMO_MARKUP.flights);
      await leafletCssReady(root);

      const sidebar = root.querySelector('aside');
      const map = L.map(root.getElementById('map'), { zoomControl: false, attributionControl: false, scrollWheelZoom: false })
        .setView([window.APP_SETTINGS.mapDefaultLat, window.APP_SETTINGS.mapDefaultLng], window.APP_SETTINGS.mapDefaultZoom);
      watchMapSize(map);

      ${sharedTileLayerDefs('map')}
      ${sharedMapControlsScripts('map', '', 'tileLayers', 'currentTileLayer', 'root')}

      // Track data read by the map-level hover handler (hover.ts).
      let activeLatlngs = [];
      let activePointData = [];
      let activePointLabels = [];
      let hoverDot = null;
      let pinnedTip = false;
      // Point-picker state (dashboard: state.ts); allFlights is what it looks pilots up in.
      let pointPickerActive = false;
      let pickerDot = null;
      const allFlights = ALL_FLIGHTS;

      ${dashboardScriptsHover()}
      ${dashboardScriptsPointPicker('root')}
      ${elevationToolScript('root')}
      wireLinkCopyButtons(root);

      ${sharedSidebarToggleScripts('map', 'flight list', 'root')}

      let layers = [];
      let endMarkers = [];
      let dayEndInfos = null;
      let legend = null;

      function clearMap() {
        layers.forEach(l => l && l.remove());
        endMarkers.forEach(m => m.remove());
        layers = [];
        endMarkers = [];
        dayEndInfos = null;
        if (legend) { legend.remove(); legend = null; }
        activeLatlngs = [];
        activePointData = [];
        activePointLabels = [];
        hoverTip.remove();
        if (hoverDot) { hoverDot.remove(); hoverDot = null; }
        pinnedTip = false;
        root.querySelectorAll('.flight-item.active').forEach(e => e.classList.remove('active'));
      }

      function showFlight(flight, el) {
        clearMap();
        if (el) el.classList.add('active');
        const isLatest = LATEST_BY_TRACKER[flight.tracker_id]?.id === flight.id;
        const inProgress = flight.end_time == null;
        const live = LIVE_BY_TRACKER[flight.tracker_id];
        const drawn = drawFlightTrack(map, flight, {
          inProgress,
          showEndMarker: !inProgress && !isLatest,
          plane: isLatest && live ? { lat: live.lat, lon: live.lon, course_deg: live.course_deg, color: colorFor(flight.tracker_id) } : null,
        });
        if (!drawn) return;
        layers.push(drawn.track, drawn.startMarker, drawn.endMarker, drawn.planeMarker);
        activeLatlngs = drawn.latlngs;
        activePointData = drawn.pointData;
        activePointLabels = drawn.labels;
        map.fitBounds(drawn.track.getBounds(), { padding: [40, 40] });
      }

      function showDay(flights) {
        clearMap();
        const drawn = drawDayTracks(map, flights, {
          colorFor,
          isInProgress: f => f.end_time == null,
          livePosition: tid => LIVE_BY_TRACKER[tid] ?? null,
        });
        layers.push(...drawn.layers, ...Object.values(drawn.planes));
        activeLatlngs = drawn.latlngs;
        activePointData = drawn.pointData;
        activePointLabels = drawn.labels;
        dayEndInfos = drawn.endInfos;
        endMarkers = placeEndMarkers(map, dayEndInfos);
        if (drawn.trackerIds.length > 1) {
          legend = buildDayViewLegend(drawn.trackerIds.map(tid => ({ label: tailFor(tid), color: colorFor(tid) })));
          root.getElementById('map').appendChild(legend);
        }
        if (drawn.allPoints.length) map.fitBounds(L.latLngBounds(drawn.allPoints), { padding: [40, 40] });
      }

      map.on('zoomend', () => {
        if (!dayEndInfos) return;
        endMarkers.forEach(m => m.remove());
        endMarkers = placeEndMarkers(map, dayEndInfos);
      });

      // The last two weeks, grouped by day; the two most recent days start expanded.
      const list = root.getElementById('flight-list');
      const recent = ALL_FLIGHTS.filter(f => f.start_time >= localMidnight(13));
      const groups = groupFlightsByDay(recent);
      groups.forEach((group, gi) => {
        const chrono = [...group.flights].reverse();
        let expanded = gi < 2;
        const { heading, chevron } = buildFlightDayHeading(group, {
          expanded,
          onMapAll: () => { showDay(chrono); sidebar.classList.remove('open'); },
        });
        const body = document.createElement('div');
        body.className = 'day-flights-body';
        if (!expanded) body.style.display = 'none';
        for (const f of group.flights) {
          const el = buildFlightItem(f, { active: false, hasAircraft: true, hasPilots: true });
          el.addEventListener('click', () => { showFlight(f, el); sidebar.classList.remove('open'); });
          body.appendChild(el);
        }
        heading.addEventListener('click', () => {
          expanded = !expanded;
          body.style.display = expanded ? '' : 'none';
          chevron.setAttribute('data-open', expanded ? 'true' : 'false');
        });
        list.appendChild(heading);
        list.appendChild(body);
      });

      // Open on every in-progress flight, like the dashboard's default view.
      showDay([...LIVE_FLIGHTS].sort((a, b) => a.start_time - b.start_time));
    }

    // ── Maintenance ───────────────────────────────────────────────────────────

    function mountMaintenance(host) {
      const root = attachDemo(host, 'dashboard', DEMO_MARKUP.maintenance);
      const m = SAMPLE.maintenance;
      const aircraft = SAMPLE.aircraft.find(a => a.tail_number === m.tail);
      const recordedAt = NOW - m.recorded_days_ago * 86400;
      const estHobbs = _estimatedMeter(m.hobbs_time, recordedAt, m.hobbs_correction, m.tail, COMPLETED_FLIGHTS);
      const estTach = _estimatedMeter(m.tach_time, recordedAt, m.tach_correction, m.tail, COMPLETED_FLIGHTS);
      const a = {
        tail_number: m.tail,
        hobbs_time: m.hobbs_time, hobbs_recorded_at: recordedAt, hobbs_correction: m.hobbs_correction,
        tach_time: m.tach_time, tach_recorded_at: recordedAt, tach_correction: m.tach_correction,
        // Meter items are stored as "hours left"; turn that back into a last-done reading
        // against today's estimate so the schedule reads the same whenever it's viewed.
        maintenance_schedule: m.items.map(it => it.schedule_type === 'calendar'
          ? { id: it.id, name: it.name, schedule_type: it.schedule_type, interval_months: it.interval_months,
              last_done_at: NOW - it.last_done_days_ago * 86400 }
          : { id: it.id, name: it.name, schedule_type: it.schedule_type, interval_hours: it.interval_hours,
              last_done_value: (it.schedule_type === 'hobbs' ? estHobbs : estTach) - it.interval_hours + it.remaining_hours }),
      };
      root.getElementById('sc-ac-tail').textContent = m.tail;
      root.getElementById('sc-ac-name').textContent = aircraft ? aircraft.name : '';
      root.getElementById('aircraft-info-body').innerHTML =
        _acTimerHtml('hobbs', a, estHobbs, false) +
        _acTimerHtml('tach', a, estTach, false) +
        _acScheduleHtml(a, estHobbs, estTach, false);
    }

    // ── Pilot duty log ────────────────────────────────────────────────────────

    function mountDuty(host) {
      const root = attachDemo(host, 'dashboard', DEMO_MARKUP.duty);
      const pilot = PILOTS_BY_ID[SAMPLE.dutyPilotId];
      const prevBtn = root.getElementById('pilot-duty-prev');
      const nextBtn = root.getElementById('pilot-duty-next');
      const exportBtn = root.getElementById('pilot-duty-export');
      const firstMonthKey = unixToTzMonthKey(COMPLETED_FLIGHTS[0].start_time);
      let [year, month] = currentDutyMonth();
      let data = null;

      function load() {
        data = computeDutyData(ALL_FLIGHTS, pilot.id, pilot.name, year, month);
        root.getElementById('pilot-duty-period').textContent = dutyPeriodLabel(data);
        nextBtn.disabled = data.isCurrentMonth;
        prevBtn.disabled = (year + '-' + String(month).padStart(2, '0')) <= firstMonthKey;
        renderDutyLog(data, {
          content: root.getElementById('pilot-duty-content'),
          totalsEl: root.getElementById('pilot-duty-totals'),
          bodyEl: root.querySelector('.pilot-duty-body'),
        });
      }

      prevBtn.addEventListener('click', () => {
        if (month === 1) { year--; month = 12; } else { month--; }
        load();
      });
      nextBtn.addEventListener('click', () => {
        if (month === 12) { year++; month = 1; } else { month++; }
        load();
      });
      exportBtn.addEventListener('click', () => {
        if (!data) return;
        runDutyExport(data, {
          exportBtn,
          overlay: root.getElementById('typst-load-overlay'),
          progressFill: root.getElementById('typst-progress-fill'),
          progressPct: root.getElementById('typst-progress-pct'),
          statusLabel: root.getElementById('typst-load-label'),
        });
      });
      load();
    }

    // ── Analytics ─────────────────────────────────────────────────────────────

    async function mountAnalytics(host) {
      const root = attachDemo(host, 'analytics', DEMO_MARKUP.analytics);
      await leafletCssReady(root);

      const analyticsMap = L.map(root.getElementById('analytics-map'), { zoomControl: false, attributionControl: false, scrollWheelZoom: false })
        .setView([window.APP_SETTINGS.mapDefaultLat, window.APP_SETTINGS.mapDefaultLng], window.APP_SETTINGS.mapDefaultZoom);
      watchMapSize(analyticsMap);

      ${sharedTileLayerDefs('analyticsMap')}
      ${sharedMapControlsScripts('analyticsMap', '', 'tileLayers', 'currentTileLayer', 'root')}

      const layerControls = root.getElementById('layer-controls');
      const sgContainer = root.getElementById('streamgraph-container');
      const sgChart = root.getElementById('streamgraph-chart');
      const sgOpts = { mode: 'time', normalized: false, interval: 'auto', showHomeBase: true };

      // Region boundaries on by default here: they're what the totals are split by.
      layerControls.querySelector('.layer-item[data-layer="region-bounds"]').classList.add('active');

      let filters = { dateFrom: null, dateTo: null, trackerIds: [], pilotIds: [], aircraftTails: [] };
      let filteredFlights = COMPLETED_FLIGHTS;
      let selectedMonthKey = null;
      let heatmapWeightMode = 'time';
      let endpointHeatLayer = null, pathDensityLayer = null, flightLinesGroup = null, regionBoundLayer = null;

      function updateEndpointHeatmap() {
        if (endpointHeatLayer) { analyticsMap.removeLayer(endpointHeatLayer); endpointHeatLayer = null; }
        if (!getLayerToggles(layerControls).endpointHeat || !filteredFlights.length) return;
        endpointHeatLayer = buildEndpointHeatLayer(filteredFlights, heatmapWeightMode, analyticsMap.getZoom());
        if (endpointHeatLayer) endpointHeatLayer.addTo(analyticsMap);
      }

      function updatePointLayers() {
        if (pathDensityLayer) { analyticsMap.removeLayer(pathDensityLayer); pathDensityLayer = null; }
        if (flightLinesGroup) { analyticsMap.removeLayer(flightLinesGroup); flightLinesGroup = null; }
        const toggles = getLayerToggles(layerControls);
        if (!filteredFlights.length) return;
        if (toggles.pathDensity) pathDensityLayer = buildRouteHeatLayer(filteredFlights).addTo(analyticsMap);
        if (toggles.flightLines) flightLinesGroup = buildFlightLinesLayer(filteredFlights).addTo(analyticsMap);
      }

      function updateRegionBoundaries() {
        if (regionBoundLayer) { analyticsMap.removeLayer(regionBoundLayer); regionBoundLayer = null; }
        if (getLayerToggles(layerControls).regionBounds) regionBoundLayer = buildRegionBoundsLayer(REGIONS).addTo(analyticsMap);
      }

      function updateStreamGraph() {
        if (sgContainer.style.display === 'none') return;
        renderStreamGraph(sgChart, filteredFlights, sgOpts);
      }

      function renderAccounting() {
        renderAccountingInto(root.getElementById('accounting-table-container'), filteredFlights, selectedMonthKey, key => {
          selectedMonthKey = selectedMonthKey === key ? null : key;
          renderAccounting();
        });
      }

      function rerender() {
        filteredFlights = COMPLETED_FLIGHTS.filter(f => filterStore.matchesFlight(f, filters));
        renderOverallTotals(root.getElementById('overall-totals-container'), filteredFlights);
        renderAccounting();
        updateEndpointHeatmap();
        updateRegionBoundaries();
        updatePointLayers();
        updateStreamGraph();
      }

      // Aircraft filter: the segmented control stands in for the full filter section.
      const filterRow = root.getElementById('sc-aircraft-filter');
      [['', 'All'], ...SAMPLE.aircraft.map(a => [a.tail_number, a.tail_number])].forEach(([tail, label]) => {
        const btn = document.createElement('button');
        btn.className = 'page-nav-tab' + (tail === '' ? ' active' : '');
        btn.setAttribute('aria-pressed', tail === '' ? 'true' : 'false');
        btn.textContent = label;
        btn.addEventListener('click', () => {
          filterRow.querySelectorAll('.page-nav-tab').forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
          filters = { ...filters, aircraftTails: tail ? [tail] : [] };
          rerender();
        });
        filterRow.appendChild(btn);
      });

      function setView(view) {
        const isMap = view === 'map';
        sgContainer.style.display = isMap ? 'none' : 'flex';
        layerControls.style.display = isMap ? '' : 'none';
        // Like the analytics page: the stream graph covers the map, not its controls bar.
        root.getElementById('map-controls').style.display = isMap ? '' : 'none';
        root.querySelectorAll('.view-tab').forEach(t => { t.classList.toggle('active', t.dataset.view === view); t.setAttribute('aria-pressed', t.dataset.view === view ? 'true' : 'false'); });
        if (isMap) analyticsMap.invalidateSize();
        else updateStreamGraph();
      }
      root.querySelectorAll('.view-tab').forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));

      wireStreamGraphToolbar(root.getElementById('streamgraph-toolbar'), sgOpts, updateStreamGraph);
      new ResizeObserver(debounce(updateStreamGraph, 100)).observe(sgChart);
      // The stream graph draws theme colors into its SVG, so redraw on a theme change.
      new MutationObserver(updateStreamGraph)
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

      wireLayerControls(layerControls, {
        onLayerToggle: (layerId) => {
          if (layerId === 'endpoint-heat') updateEndpointHeatmap();
          else if (layerId === 'path-density' || layerId === 'flight-lines') updatePointLayers();
          else updateRegionBoundaries();
        },
        onWeightMode: (mode) => { heatmapWeightMode = mode; updateEndpointHeatmap(); },
      });
      analyticsMap.on('zoomend', updateEndpointHeatmap);

      // Frame where the flights go (before the first draw, so fitting doesn't redraw the heat).
      analyticsMap.fitBounds(L.latLngBounds(COMPLETED_FLIGHTS.map(f => [f.end_lat, f.end_lon])), { padding: [30, 30], animate: false });
      rerender();
    }

    // ── Mounting ──────────────────────────────────────────────────────────────

    const MOUNTS = {
      status: mountStatus,
      flights: mountFlights,
      maintenance: mountMaintenance,
      duty: mountDuty,
      analytics: mountAnalytics,
    };

    // ── Notification mockup ───────────────────────────────────────────────────
    // The page carries the messages; only their times depend on the visitor's clock.

    function renderNotificationTimes() {
      document.querySelectorAll('[data-notif-ago]').forEach(el => {
        const t = NOW - Number(el.dataset.notifAgo);
        el.textContent = el.dataset.notifFormat === 'relative' ? relTime(t) : formatLocalDateTime(t, SAMPLE.timezone);
      });
      const clock = document.querySelector('[data-phone-clock]');
      if (clock) {
        clock.textContent = new Date().toLocaleTimeString('en-US', { timeZone: SAMPLE.timezone, hour: 'numeric', minute: '2-digit' }).replace(/\\s?[AP]M$/, '');
      }
    }
    renderNotificationTimes();
    setInterval(renderNotificationTimes, 30000);

    function mount(host) {
      const fn = MOUNTS[host.dataset.demo];
      if (!fn || host.shadowRoot) return;
      Promise.resolve(fn(host)).catch(err => console.error('showcase demo "' + host.dataset.demo + '" failed', err));
    }

    _syncThemeButtons();

    // Maps and charts only once they're about to scroll into view.
    const hosts = [...document.querySelectorAll('[data-demo]')];
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          mount(e.target);
        }
      }, { rootMargin: '400px 0px' });
      hosts.forEach(h => io.observe(h));
    } else {
      hosts.forEach(mount);
    }
  `;
}
