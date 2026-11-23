/**
 * MapLibre GL JS on the web's pages (docs/web-maplibre-plan.md): its script and stylesheet
 * tags, and the runtime that builds a map from core's mapStyle() with the tenant's basemaps
 * (raster and vector), the overlays that are on and this device's color correction.
 *
 * A map's basemap and overlays live on the map object (`_ftBasemapId`, `_ftOverlays`), and
 * _ftRestyle() rebuilds its style from them, keeping the page's own sources and layers
 * (tracks, markers, the elevation tint). The map chrome (basemap switcher, overlay legend,
 * credits) is maplibreMapControlsScripts() and maplibreOverlayLegendMountScript() in
 * map-controls.ts.
 *
 * 5.x, not 6.x: 6.x ships no UMD build, and the pages' scripts are classic inline scripts
 * that run before a module would.
 */
import { MAP_BASEMAP_KEY } from './map-controls';

const MAPLIBRE_JS = {
  url: 'https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl.js',
  sri: 'sha384-nXMl9YiLoSG5KBPTFgvxVuIqQQcqIvo0bFrvoEaGJC6r7IibIzF1S36Zbf/sKBtL',
};
const MAPLIBRE_CSS = {
  url: 'https://unpkg.com/maplibre-gl@5.24.1/dist/maplibre-gl.css',
  sri: 'sha384-uTttxo/aOKbdE5RlD/SPzSDoDmNvGlUYPjONi2MN/b7c9HPSvW07OIuyP7uL6jxK',
};

/** What a map shows where no tile has loaded (the Leaflet maps' container color). */
export const MAP_BACKGROUND = '#e8e4de';

/** The stylesheet `<link>` alone, for a shadow root (the showcase's demos). */
export function maplibreCssLink(): string {
  return `<link rel="stylesheet" href="${MAPLIBRE_CSS.url}" integrity="${MAPLIBRE_CSS.sri}" crossorigin="anonymous" />`;
}

/** The `<head>` tags: the stylesheet and the script (`window.maplibregl`). The showcase has no nonce. */
export function maplibreHeadTags(nonce?: string): string {
  const n = nonce ? ` nonce="${nonce}"` : '';
  return `${maplibreCssLink()}
  <script${n} src="${MAPLIBRE_JS.url}" integrity="${MAPLIBRE_JS.sri}" crossorigin="anonymous"></script>`;
}

/**
 * Runtime script for the page IIFE (once per page, after mapLayersRuntimeScript() and
 * mapLayerColorRuntimeScript(), and with pmtiles.js loaded). Defines:
 *   createMap(container, options) — a MapLibre map on the stored basemap; options are
 *                                   maplibregl.Map's (center, zoom, …)
 *   _ftRestyle(map)               — rebuild map's style from its basemap and overlays
 *   _ftMapBasemaps()              — the basemaps a MapLibre map offers, in the tenant's order
 *   _ftLatLngBounds(latlngs)      — the bounds of [lat, lon] pairs, as MapLibre takes them
 * createMap() adds each map to mapLayersRuntimeScript()'s `_ftMaplibreMaps`, with its
 * `_ftRestyle()`, which _ftApplyActiveLayerColor() calls.
 */
export function maplibreRuntimeScript(): string {
  return `
    // ── MapLibre maps ─────────────────────────────────────────────────────────

    // pmtiles:// sources (a vector basemap, the elevation DEM) read through pmtiles.js. Once
    // per window: the protocol is MapLibre's, not the map's.
    if (typeof maplibregl !== 'undefined' && typeof pmtiles !== 'undefined' && !window._ftPmtilesProtocol) {
      window._ftPmtilesProtocol = new pmtiles.Protocol();
      maplibregl.addProtocol('pmtiles', window._ftPmtilesProtocol.tile);
    }

    // The tenant's raster basemaps (or core's fallback) and its vector ones, in its order.
    function _ftMapBasemaps() {
      return availableBasemaps({ basemaps: _ftActiveLayerDefs(), vector_basemaps: _ftVectorBasemaps });
    }

    function _ftMapStyleFor(state) {
      var basemaps = _ftMapBasemaps();
      var basemap = basemaps.find(function(b) { return b.id === state._ftBasemapId; }) || basemaps[0] || null;
      return mapStyle({
        basemap: basemap,
        overlays: state._ftOverlays,
        origin: location.origin,
        pixelRatio: window.devicePixelRatio || 1,
        background: '${MAP_BACKGROUND}',
        color: basemap && basemap.kind === 'raster' ? _ftLayerColor(basemap.id) : undefined,
      });
    }

    // The basemap's and the overlays' sources (core's basemapSourceId/overlaySourceId).
    function _ftIsBaseSource(id) { return /^(basemap|overlay)-/.test(id || ''); }

    // A new style for the map's basemap, overlays and color correction. The page's own
    // sources and layers carry over, above the new basemap and overlays; MapLibre diffs the
    // two styles, so only what changed reloads.
    function _ftRestyle(mapObj) {
      mapObj.setStyle(_ftMapStyleFor(mapObj), {
        transformStyle: function(prev, next) {
          if (!prev) return next;
          var sources = Object.assign({}, next.sources);
          Object.keys(prev.sources).forEach(function(id) { if (!_ftIsBaseSource(id)) sources[id] = prev.sources[id]; });
          var own = prev.layers.filter(function(l) { return l.type !== 'background' && !_ftIsBaseSource(l.source); });
          return Object.assign({}, next, { sources: sources, layers: next.layers.concat(own) });
        },
      });
    }

    // Stands in for a map when MapLibre can't make one (no WebGL, or its script didn't
    // load): every method returns it again, so the page's other parts keep working.
    function _ftNoMap(container) {
      var stub = new Proxy(function() {}, {
        get: function(_, key) {
          if (key === 'getContainer') return function() { return container; };
          if (key === 'project') return function() { return { x: NaN, y: NaN }; };
          if (key === 'then' || typeof key === 'symbol') return undefined;
          return stub;
        },
        apply: function() { return stub; },
      });
      return stub;
    }

    function createMap(container, options) {
      var basemaps = _ftMapBasemaps();
      var stored = localStorage.getItem('${MAP_BASEMAP_KEY}');
      var state = {
        _ftBasemapId: basemaps.some(function(b) { return b.id === stored; }) ? stored : (basemaps[0] ? basemaps[0].id : null),
        _ftOverlays: [],
      };
      var mapObj;
      try {
        // North up, as the Leaflet maps were: no rotation or pitch.
        mapObj = new maplibregl.Map(Object.assign({
          container: container,
          style: _ftMapStyleFor(state),
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        }, options));
        mapObj.touchZoomRotate.disableRotation();
        mapObj.keyboard.disableRotation();
      } catch (err) {
        console.error('No map:', err);
        var msg = document.createElement('div');
        msg.className = 'map-unavailable';
        msg.textContent = 'The map needs WebGL, which this browser doesn\\'t have turned on.';
        container.appendChild(msg);
        return _ftNoMap(container);
      }
      Object.assign(mapObj, state, { _ftRestyle: function() { _ftRestyle(mapObj); } });
      container.setAttribute('data-basemap', state._ftBasemapId || '');
      _ftMaplibreMaps.push(mapObj);
      return mapObj;
    }

    // MapLibre's bounds ([[west, south], [east, north]]) around [lat, lon] pairs.
    function _ftLatLngBounds(latlngs) {
      var w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      latlngs.forEach(function(ll) {
        if (ll[1] < w) w = ll[1];
        if (ll[1] > e) e = ll[1];
        if (ll[0] < s) s = ll[0];
        if (ll[0] > n) n = ll[0];
      });
      return [[w, s], [e, n]];
    }
  `;
}

/** CSS for a map MapLibre couldn't make. */
export function maplibreStyles(): string {
  return `
    .map-unavailable {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
      text-align: center;
      font-family: var(--font-body);
      font-size: 0.875rem;
      color: var(--text-muted);
      background: var(--bg-base);
    }
  `;
}
