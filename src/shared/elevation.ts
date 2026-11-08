/**
 * Elevation tool: a toggleable Leaflet overlay that tints the map relative to a
 * click-set reference elevation, plus a cursor elevation readout — both backed by
 * Mapterhorn's public Terrarium-encoded `planet.pmtiles` DEM archive, read directly
 * via pmtiles.js's plain byte-fetch API (`PMTiles.getZxy`). No MapLibre, no WebGL —
 * just an `L.GridLayer` subclass painting a `<canvas>` per tile.
 *
 * Exports mirror the shared/*.ts convention (Markup/Styles/Script) used throughout
 * this codebase (e.g. shared/pilot-duty.ts, shared/settings.ts):
 *   elevationToolMarkup()  — the cursor-readout + reference-readout + sliders panel
 *   elevationToolStyles()  — CSS for the panel and the toggle button
 *   elevationToolScript()  — DEM fetch/cache, the tint GridLayer, cursor-readout
 *                            wiring, reference-click handling, slider wiring
 *
 * The tile and pixel math, Terrarium decoding and the color ramp are @wingbeat/core's
 * (packages/core/src/elevation.ts), globals from the core bundle.
 *
 * The toggle button lives in dashboard/markup.ts's mapToolButtonsMarkup() (with
 * point-picker's), passed to sharedMapControlsMarkup()'s extraButtons slot.
 * `rootExpr` names the node the panel's elements are looked up in (a shadow root for
 * the showcase demos).
 *
 * Reads (does not modify): `map`, `nearestRouteIdx`/`activeLatlngs`/`activePointData`
 * (hover.ts), `pointPickerActive`/`deactivatePointPicker` (point-picker.ts), `toFeet`
 * (helpers.ts). point-picker.ts's `activatePointPicker()` calls
 * `deactivateElevationTool()` back, so only one "special click mode" tool is ever
 * active at once — the one addition this doc's Touch points list didn't spell out.
 */

import { DEM_TILE_SIZE } from '@wingbeat/core/elevation';

const DEM_PMTILES_URL = 'https://download.mapterhorn.com/planet.pmtiles';
const ELEV_RANGE_KEY = 'ft_elev_range_m';
const ELEV_OPACITY_KEY = 'ft_elev_opacity';
const ELEV_DEFAULT_RANGE_M = 300;
const ELEV_DEFAULT_OPACITY = 55;

export function elevationToolMarkup(): string {
  return `
    <div id="elevation-panel" class="elevation-panel hidden">
      <div class="elevation-panel-row">
        <span class="elevation-panel-label">Cursor</span>
        <span id="elevation-cursor-readout" class="elevation-readout">Hover map</span>
      </div>
      <div class="elevation-panel-row">
        <span class="elevation-panel-label">Reference</span>
        <span id="elevation-reference-readout" class="elevation-readout">Click to set</span>
      </div>
      <div class="elevation-sliders">
        <label class="elevation-slider-row">
          <span>Range</span>
          <input type="range" id="elevation-range-slider" min="50" max="2000" step="50" />
          <span id="elevation-range-value" class="elevation-slider-value"></span>
        </label>
        <label class="elevation-slider-row">
          <span>Opacity</span>
          <input type="range" id="elevation-opacity-slider" min="0" max="100" step="5" />
          <span id="elevation-opacity-value" class="elevation-slider-value"></span>
        </label>
      </div>
    </div>
  `;
}

export function elevationToolStyles(): string {
  return `
    #elevation-tool-btn {
      padding: 0.45rem 0.65rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .elevation-panel {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 500;
      background: var(--surface-float);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      font-size: 0.78rem;
      color: var(--text-primary);
      pointer-events: auto;
      min-width: 180px;
    }

    .elevation-panel.hidden { display: none; }

    .elevation-panel-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .elevation-panel-label {
      color: var(--text-muted);
      white-space: nowrap;
    }

    .elevation-readout {
      font-weight: 600;
      white-space: nowrap;
    }

    .elevation-sliders {
      display: flex;
      flex-direction: column;
      gap: 4px;
      border-top: 1px solid var(--border);
      padding-top: 6px;
    }

    .elevation-slider-row { display: flex; align-items: center; gap: 6px; }

    .elevation-slider-row span:first-child {
      color: var(--text-muted);
      width: 3.2rem;
      flex-shrink: 0;
    }

    .elevation-slider-row input[type="range"] { flex: 1; accent-color: var(--accent); }

    .elevation-slider-value {
      color: var(--text-muted);
      min-width: 3.6rem;
      text-align: right;
    }
  `;
}

export function elevationToolScript(rootExpr = 'document'): string {
  return `
    // ── Elevation tool: DEM decode/cache (Mapterhorn planet.pmtiles, Terrarium) ─
    const _ftDemPmtiles = new pmtiles.PMTiles('${DEM_PMTILES_URL}');
    const _ftDemCache = new Map();     // "z/x/y" -> Float32Array(${DEM_TILE_SIZE}*${DEM_TILE_SIZE}) elevation meters
    const _ftDemInflight = new Map();  // "z/x/y" -> in-flight Promise, so concurrent
                                        // callers (mousemove + tile paint) share one fetch

    // Fetches+decodes DEM tile (z,x,y) into a cached Float32Array of elevation
    // meters, one entry per pixel (row-major). Returns null if the archive has no
    // data there (outside coverage) or the fetch/decode fails.
    function ensureDemTile(z, x, y) {
      const key = z + '/' + x + '/' + y;
      if (_ftDemCache.has(key)) return Promise.resolve(_ftDemCache.get(key));
      if (_ftDemInflight.has(key)) return _ftDemInflight.get(key);
      const p = (async () => {
        try {
          const tile = await _ftDemPmtiles.getZxy(z, x, y);
          if (!tile || !tile.data) return null;
          const bitmap = await createImageBitmap(new Blob([tile.data], { type: 'image/webp' }));
          const canvas = document.createElement('canvas');
          canvas.width = ${DEM_TILE_SIZE};
          canvas.height = ${DEM_TILE_SIZE};
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bitmap, 0, 0);
          const rgba = ctx.getImageData(0, 0, ${DEM_TILE_SIZE}, ${DEM_TILE_SIZE}).data;
          const out = decodeTerrarium(rgba);
          _ftDemCache.set(key, out);
          return out;
        } catch (_) {
          return null;
        } finally {
          _ftDemInflight.delete(key);
        }
      })();
      _ftDemInflight.set(key, p);
      return p;
    }

    // Promise<number|null> (meters) — the single function backing both the cursor
    // readout and the raw-map-click reference mode.
    async function elevationAt(lat, lng, mapZoom) {
      const z = demZoomFor(mapZoom);
      const { x, y, px, py } = latLngToTilePixel(lat, lng, z);
      const arr = await ensureDemTile(z, x, y);
      return arr ? arr[py * ${DEM_TILE_SIZE} + px] : null;
    }

    // ── Elevation tool: tint layer ──────────────────────────────────────────────
    let elevationToolActive = false;
    let elevationReferenceElevM = null; // meters; null until a reference is set
    let elevationReferenceMarker = null;
    let elevationRangeM = parseInt(localStorage.getItem('${ELEV_RANGE_KEY}'), 10);
    if (!elevationRangeM || isNaN(elevationRangeM)) elevationRangeM = ${ELEV_DEFAULT_RANGE_M};
    let elevationOpacity = parseInt(localStorage.getItem('${ELEV_OPACITY_KEY}'), 10);
    if (isNaN(elevationOpacity)) elevationOpacity = ${ELEV_DEFAULT_OPACITY};

    // canvas -> { elevArr, sub } (sub: demSubTile()) for currently-mounted tiles,
    // so a slider change can re-run just the color pass with no refetch/re-decode.
    // Cleaned up in ElevationTintLayer's _removeTile override.
    const _ftElevTileRegistry = new Map();

    function _ftPaintElevationTile(canvas, params) {
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(${DEM_TILE_SIZE}, ${DEM_TILE_SIZE});
      const alpha = Math.round(elevationOpacity / 100 * 255);
      paintElevationTint(imgData.data, params.elevArr, params.sub, elevationReferenceElevM, elevationRangeM, alpha);
      ctx.putImageData(imgData, 0, 0);
    }

    let _ftElevRecolorRAF = null;
    function _ftScheduleElevRecolor() {
      if (_ftElevRecolorRAF) return;
      _ftElevRecolorRAF = requestAnimationFrame(() => {
        _ftElevRecolorRAF = null;
        _ftElevTileRegistry.forEach((params, canvas) => _ftPaintElevationTile(canvas, params));
      });
    }

    // GridLayer (not TileLayer) subclass, modeled on pmtiles.js's own
    // leafletRasterLayer createTile shape. Each tile paints its sub-rectangle of its
    // z12 DEM parent (demSubTile(), §5 of the design doc).
    const ElevationTintLayer = L.GridLayer.extend({
      createTile: function(coords, done) {
        const canvas = document.createElement('canvas');
        canvas.width = ${DEM_TILE_SIZE};
        canvas.height = ${DEM_TILE_SIZE};
        const sub = demSubTile(coords);
        ensureDemTile(sub.demZ, sub.parentX, sub.parentY).then((arr) => {
          if (!arr) { done(undefined, canvas); return; }
          const params = { elevArr: arr, sub };
          _ftElevTileRegistry.set(canvas, params);
          _ftPaintElevationTile(canvas, params);
          done(undefined, canvas);
        }).catch(() => done(undefined, canvas));
        return canvas;
      },
      _removeTile: function(key) {
        const tile = this._tiles[key];
        if (tile) _ftElevTileRegistry.delete(tile.el);
        L.GridLayer.prototype._removeTile.call(this, key);
      },
    });

    // Added/removed from the map by activate/deactivateElevationTool below, so the
    // tint disappears along with the rest of the tool when toggled off.
    //
    // Deliberately no maxNativeZoom/maxZoom option here: those make Leaflet itself
    // clamp the tile zoom it hands to createTile and CSS-scale-transform the whole
    // tile pane to compensate, which fights with createTile's own manual z12 clamp
    // + sub-rect addressing above (coords.z would already be clamped by Leaflet,
    // and coords.x/y would live on a different, mismatched grid than the basemap's
    // own unclamped one) — that double-clamping is what caused the tint tiles to
    // render at the wrong zoom/offset relative to the basemap. Leaving zoom
    // unclamped means createTile always receives the same coords.z/x/y as the
    // basemap layer at the current zoom, and does 100% of the overzoom upscaling
    // itself, pixel by pixel.
    const elevationTintLayer = new ElevationTintLayer();

    function _ftSetElevationReference(latlng, elevM) {
      elevationReferenceElevM = elevM;
      if (elevationReferenceMarker) {
        elevationReferenceMarker.setLatLng(latlng);
      } else {
        elevationReferenceMarker = L.circleMarker(latlng, {
          radius: 5, color: '#fff', fillColor: '#0F1A24', fillOpacity: 1,
          weight: 2, interactive: false,
        }).addTo(map);
      }
      elevationReferenceReadout.textContent = toFeet(elevM);
      _ftScheduleElevRecolor();
    }

    // ── UI wiring ────────────────────────────────────────────────────────────
    const elevationBtn = ${rootExpr}.getElementById('elevation-tool-btn');
    const elevationPanel = ${rootExpr}.getElementById('elevation-panel');
    const elevationCursorReadout = ${rootExpr}.getElementById('elevation-cursor-readout');
    const elevationReferenceReadout = ${rootExpr}.getElementById('elevation-reference-readout');
    const elevationRangeSlider = ${rootExpr}.getElementById('elevation-range-slider');
    const elevationRangeValue = ${rootExpr}.getElementById('elevation-range-value');
    const elevationOpacitySlider = ${rootExpr}.getElementById('elevation-opacity-slider');
    const elevationOpacityValue = ${rootExpr}.getElementById('elevation-opacity-value');

    elevationRangeSlider.value = String(elevationRangeM);
    elevationRangeValue.textContent = '±' + toFeet(elevationRangeM);
    elevationOpacitySlider.value = String(elevationOpacity);
    elevationOpacityValue.textContent = elevationOpacity + '%';

    elevationRangeSlider.addEventListener('input', () => {
      elevationRangeM = parseInt(elevationRangeSlider.value, 10);
      elevationRangeValue.textContent = '±' + toFeet(elevationRangeM);
      localStorage.setItem('${ELEV_RANGE_KEY}', String(elevationRangeM));
      _ftScheduleElevRecolor();
    });

    elevationOpacitySlider.addEventListener('input', () => {
      elevationOpacity = parseInt(elevationOpacitySlider.value, 10);
      elevationOpacityValue.textContent = elevationOpacity + '%';
      localStorage.setItem('${ELEV_OPACITY_KEY}', String(elevationOpacity));
      _ftScheduleElevRecolor();
    });

    function activateElevationTool() {
      elevationToolActive = true;
      elevationBtn.classList.add('active');
      map.getContainer().style.cursor = 'crosshair';
      elevationPanel.classList.remove('hidden');
      elevationTintLayer.addTo(map);
      // The reference survives a toggle off/on, so its marker comes back with the tint.
      if (elevationReferenceMarker) elevationReferenceMarker.addTo(map);
      if (pointPickerActive) deactivatePointPicker();
    }

    function deactivateElevationTool() {
      elevationToolActive = false;
      elevationBtn.classList.remove('active');
      map.getContainer().style.cursor = '';
      elevationPanel.classList.add('hidden');
      map.removeLayer(elevationTintLayer);
      if (elevationReferenceMarker) map.removeLayer(elevationReferenceMarker);
    }

    elevationBtn.addEventListener('click', () => {
      if (elevationToolActive) { deactivateElevationTool(); } else { activateElevationTool(); }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elevationToolActive) deactivateElevationTool();
    });

    // Cursor elevation readout — fixed-position label, not cursor-following.
    // Tokened so a slow tile fetch from an earlier position can't overwrite a
    // faster one that landed after it.
    let _ftElevMoveToken = 0;
    map.on('mousemove', (e) => {
      if (!elevationToolActive) return;
      const token = ++_ftElevMoveToken;
      elevationAt(e.latlng.lat, e.latlng.lng, map.getZoom()).then((m) => {
        if (token !== _ftElevMoveToken) return;
        elevationCursorReadout.textContent = m == null ? 'No data' : toFeet(m);
      });
    });

    map.on('mouseout', () => {
      if (!elevationToolActive) return;
      elevationCursorReadout.textContent = 'Hover map';
    });

    // Click / tap: set the reference. Snaps to a track point within 30px (using its
    // own recorded GPS elevation_m, no DEM lookup) same as point-picker.ts; falls
    // back to a raw DEM lookup at the clicked lat/lng otherwise.
    map.on('click', (e) => {
      if (!elevationToolActive) return;
      const idx = nearestRouteIdx(e.containerPoint);
      if (idx !== -1) {
        _ftSetElevationReference(L.latLng(activeLatlngs[idx]), activePointData[idx].elevation_m);
        return;
      }
      const clickLatLng = e.latlng;
      elevationAt(clickLatLng.lat, clickLatLng.lng, map.getZoom()).then((m) => {
        if (m == null) return;
        _ftSetElevationReference(clickLatLng, m);
      });
    });
  `;
}
