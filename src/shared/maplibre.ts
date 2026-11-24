/**
 * MapLibre GL JS on the web's pages (docs/web-maplibre-plan.md): its script and stylesheet
 * tags, and the runtime that builds a map from core's mapStyle() with the tenant's basemaps
 * (raster and vector), the overlays that are on and this device's color correction.
 *
 * A map's basemap and overlays live on the map object (`_ftBasemapId`, `_ftOverlays`), and
 * _ftRestyle() rebuilds its style from them, keeping the page's own sources and layers
 * (tracks, markers, the elevation tint). The map chrome (basemap switcher, overlay legend,
 * credits) is sharedMapControlsScripts() and tileOverlayLegendMountScript() in
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

/** What a map shows where no tile has loaded. */
export const MAP_BACKGROUND = '#e8e4de';

/** The stylesheet `<link>` alone, for a shadow root (the showcase's demos). */
export function maplibreCssLink(): string {
  return `<link rel="stylesheet" href="${MAPLIBRE_CSS.url}" integrity="${MAPLIBRE_CSS.sri}" crossorigin="anonymous" />`;
}

/** The script tag alone (`window.maplibregl`). The showcase has no nonce. */
export function maplibreScriptTag(nonce?: string): string {
  const n = nonce ? ` nonce="${nonce}"` : '';
  return `<script${n} src="${MAPLIBRE_JS.url}" integrity="${MAPLIBRE_JS.sri}" crossorigin="anonymous"></script>`;
}

/** The `<head>` tags: the stylesheet and the script. */
export function maplibreHeadTags(nonce?: string): string {
  return `${maplibreCssLink()}
  ${maplibreScriptTag(nonce)}`;
}

/**
 * Runtime script for the page IIFE (once per page, after mapLayersRuntimeScript() and
 * mapLayerColorRuntimeScript(), and with pmtiles.js loaded). Defines:
 *   createMap(container, options) — a MapLibre map on the stored basemap; options are
 *                                   maplibregl.Map's (center, zoom, …)
 *   _ftDefaultView()              — the tenant's default center and zoom, for createMap() or
 *                                   jumpTo()
 *   _ftRestyle(map)               — rebuild map's style from its basemap and overlays
 *   _ftMapBasemaps()              — the basemaps a MapLibre map offers, in the tenant's order
 *   _ftLatLngBounds(latlngs)      — the bounds of [lat, lon] pairs, as MapLibre takes them
 *   _ftWhenStyleReady(map, fn)    — fn() now, or once the map's style has loaded
 *   addMapShape(map, features, layers, { z, source })
 *                                 — GeoJSON features drawn with core's layer specs, stacked
 *                                   by z; returns a handle with its source id,
 *                                   setFeatures() and remove()
 *   _ftFeatureAt(map, layerId, point, px)
 *                                 — the top feature of a layer within px of a screen point
 *   addHtmlMarker(map, latlng, html, zIndex), setHtmlMarker(marker, latlng, html)
 *                                 — a DOM marker (planes, end markers, the hover arrow)
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
      var basemap = chosenBasemap(basemaps, state._ftBasemapId);
      return mapStyle({
        basemap: basemap,
        overlays: state._ftOverlays,
        origin: location.origin,
        pixelRatio: window.devicePixelRatio || 1,
        background: '${MAP_BACKGROUND}',
        color: basemap && basemap.kind === 'raster' ? _ftLayerColor(basemap.id) : undefined,
      });
    }

    // A new style for the map's basemap, overlays and color correction. The page's own
    // sources and layers carry over, above the new basemap and overlays; MapLibre diffs the
    // two styles, so only what changed reloads.
    function _ftRestyle(mapObj) {
      mapObj.setStyle(_ftMapStyleFor(mapObj), {
        transformStyle: function(prev, next) {
          if (!prev) return next;
          var sources = Object.assign({}, next.sources);
          Object.keys(prev.sources).forEach(function(id) { if (!isStyleSource(id)) sources[id] = prev.sources[id]; });
          var own = prev.layers.filter(function(l) { return l.type !== 'background' && !isStyleSource(l.source); });
          return Object.assign({}, next, { sources: sources, layers: next.layers.concat(own) });
        },
      });
    }

    // Stands in for a map when MapLibre can't make one (no WebGL, or its script didn't
    // load): every method returns it again, so the page's other parts keep working.
    function _ftNoMap(container) {
      var stub = new Proxy(function() {}, {
        get: function(_, key) {
          if (key === '_ftNoMap') return true;
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
      var basemap = chosenBasemap(_ftMapBasemaps(), localStorage.getItem('${MAP_BASEMAP_KEY}'));
      var state = {
        _ftBasemapId: basemap && basemap.id,
        _ftOverlays: [],
      };
      var mapObj;
      try {
        // North up: no rotation or pitch.
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

    function _ftDefaultView() {
      var s = window.APP_SETTINGS;
      return defaultMapView({ lat: s.mapDefaultLat, lng: s.mapDefaultLng, zoom: s.mapDefaultZoom });
    }

    // The bounds of [lat, lon] pairs (the hover arrays').
    function _ftLatLngBounds(latlngs) {
      return lngLatBounds(latlngs.map(function(ll) { return [ll[1], ll[0]]; }));
    }

    // A style that's still loading (the first, or a restyle MapLibre couldn't diff) takes
    // no sources or layers yet.
    function _ftWhenStyleReady(mapObj, fn) {
      if (mapObj._ftNoMap || (mapObj.style && mapObj.style._loaded)) fn();
      else mapObj.once('style.load', fn);
    }

    // Draws GeoJSON features with core's layer specs (trackLayer(), positionLayer(), …) on
    // a source of their own: ids ft-shape-N and ft-shape-N-<layer id>, above every shape
    // drawn before at the same options.z or lower, below those at a higher z (default 0).
    // options.source adds to the GeoJSON source's options (clustering). Returns
    // { id, setFeatures(features), remove() }.
    var _ftShapeSeq = 0;
    function addMapShape(mapObj, features, layers, options) {
      var id = 'ft-shape-' + (++_ftShapeSeq);
      var removed = false;
      var z = (options && options.z) || 0;
      _ftWhenStyleReady(mapObj, function() {
        if (removed) return;
        mapObj.addSource(id, Object.assign({ type: 'geojson', data: { type: 'FeatureCollection', features: features } }, options && options.source));
        var above = mapObj.getStyle().layers.find(function(l) {
          return l.id.indexOf('ft-shape-') === 0 && ((l.metadata && l.metadata['ft:z']) || 0) > z;
        });
        layers.forEach(function(l) {
          mapObj.addLayer(Object.assign({}, l, { id: id + '-' + l.id, source: id, metadata: { 'ft:z': z } }), above && above.id);
        });
      });
      function drop() {
        layers.forEach(function(l) { if (mapObj.getLayer(id + '-' + l.id)) mapObj.removeLayer(id + '-' + l.id); });
        if (mapObj.getSource(id)) mapObj.removeSource(id);
      }
      return {
        id: id,
        setFeatures: function(next) {
          features = next;
          _ftWhenStyleReady(mapObj, function() {
            if (!removed && mapObj.getSource(id)) mapObj.getSource(id).setData({ type: 'FeatureCollection', features: features });
          });
        },
        remove: function() {
          removed = true;
          // A restyle in flight would carry it over (_ftRestyle()), so it goes once that's in.
          _ftWhenStyleReady(mapObj, drop);
        },
      };
    }

    // The topmost feature of a layer within px (default 0) of a screen point, or null.
    function _ftFeatureAt(mapObj, layerId, point, px) {
      if (mapObj._ftNoMap || !mapObj.getLayer(layerId)) return null;
      var box = px ? [[point.x - px, point.y - px], [point.x + px, point.y + px]] : point;
      return mapObj.queryRenderedFeatures(box, { layers: [layerId] })[0] || null;
    }

    // A DOM marker centered on latlng ([lat, lon]), its content html. Not interactive:
    // the map's own events (hover, the point picker) see through it. Above the map's
    // layers, and above lower-zIndex markers.
    function addHtmlMarker(mapObj, latlng, html, zIndex) {
      if (mapObj._ftNoMap) return mapObj;
      var el = document.createElement('div');
      el.className = 'map-html-marker';
      el.innerHTML = html;
      el._ftHtml = html;
      if (zIndex) el.style.zIndex = String(zIndex);
      return new maplibregl.Marker({ element: el }).setLngLat([latlng[1], latlng[0]]).addTo(mapObj);
    }

    // Moves a marker from addHtmlMarker() and, when it changed, replaces its content.
    function setHtmlMarker(marker, latlng, html) {
      marker.setLngLat([latlng[1], latlng[0]]);
      var el = marker.getElement();
      if (el._ftHtml !== html) { el.innerHTML = html; el._ftHtml = html; }
    }
  `;
}

/**
 * CSS for the MapLibre maps: DOM markers, the track hover tip (hover.ts), a map that has
 * no view yet (`map-pending`, the dashboard's until its first fit), and a map MapLibre
 * couldn't make.
 */
export function maplibreStyles(): string {
  return `
    .map-html-marker { pointer-events: none; }
    .map-pending .maplibregl-canvas-container { visibility: hidden; }

    /* Above the markers (addHtmlMarker's zIndex). */
    .map-hover-tip { pointer-events: none; z-index: 4; }
    .map-hover-tip .maplibregl-popup-content {
      padding: var(--space-1) var(--space-2);
      font-family: var(--font-body);
      font-size: var(--size-xs);
      color: var(--text-primary);
      background: var(--surface-1);
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-md);
    }
    .map-hover-tip.maplibregl-popup-anchor-bottom .maplibregl-popup-tip { border-top-color: var(--surface-1); }

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
