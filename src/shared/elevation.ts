/**
 * Elevation tool: a toggleable tint of the MapLibre map relative to a click-set reference
 * elevation, plus a cursor elevation readout, both from Mapterhorn's public
 * Terrarium-encoded `planet.pmtiles` DEM archive. The tint is core's `color-relief` layer
 * (elevationReliefLayer()) on a `raster-dem` source (ELEVATION_DEM_SOURCE), under the
 * tracks, as in the app (apps/mobile/src/lib/elevation-tool.tsx); like the app's, it shows
 * once a reference is set. The readout and a reference set off-track decode the DEM tile
 * under the cursor themselves, through pmtiles.js's plain byte-fetch API
 * (`PMTiles.getZxy`). The DEM's credit comes from its source (the map's credits row).
 *
 * Exports mirror the shared/*.ts convention (Markup/Styles/Script) used throughout
 * this codebase (e.g. shared/pilot-duty.ts, shared/settings.ts):
 *   elevationToolMarkup()  — the cursor-readout + reference-readout + sliders panel
 *   elevationToolStyles()  — CSS for the panel and the toggle button
 *   elevationToolScript()  — DEM fetch/cache, the tint and reference layers,
 *                            cursor-readout wiring, reference-click handling, slider wiring
 *
 * The tile and pixel math, Terrarium decoding and the color ramp are @wingbeat/core's
 * (packages/core/src/elevation.ts, map-layers.ts), globals from the core bundle.
 *
 * The toggle button lives in dashboard/markup.ts's mapToolButtonsMarkup() (with
 * point-picker's), passed to sharedMapControlsMarkup()'s extraButtons slot.
 * `rootExpr` names the node the panel's elements are looked up in (a shadow root for
 * the showcase demos).
 *
 * Reads (does not modify): `map` (a MapLibre map, shared/maplibre.ts),
 * `nearestRouteIdx`/`activeLatlngs`/`activePointData` (hover.ts),
 * `pointPickerActive`/`deactivatePointPicker` (point-picker.ts), `toFeet` (helpers.ts).
 * point-picker.ts's `activatePointPicker()` calls `deactivateElevationTool()` back, so
 * only one "special click mode" tool is ever active at once.
 */

import { DEM_PMTILES_URL, DEM_TILE_SIZE, ELEVATION_OPACITY, ELEVATION_RANGE_M } from '@wingbeat/core/elevation';

const ELEV_RANGE_KEY = 'ft_elev_range_m';
const ELEV_OPACITY_KEY = 'ft_elev_opacity';

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
          <input type="range" id="elevation-range-slider" min="${ELEVATION_RANGE_M.min}" max="${ELEVATION_RANGE_M.max}" step="50" />
          <span id="elevation-range-value" class="elevation-slider-value"></span>
        </label>
        <label class="elevation-slider-row">
          <span>Opacity</span>
          <input type="range" id="elevation-opacity-slider" min="${ELEVATION_OPACITY.min}" max="${ELEVATION_OPACITY.max}" step="5" />
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
    // ── Elevation tool: DEM decode/cache for the readout (Mapterhorn planet.pmtiles, Terrarium) ─
    const _ftDemPmtiles = new pmtiles.PMTiles('${DEM_PMTILES_URL}');
    const _ftDemCache = new Map();     // "z/x/y" -> Float32Array(${DEM_TILE_SIZE}*${DEM_TILE_SIZE}) elevation meters
    const _ftDemInflight = new Map();  // "z/x/y" -> in-flight Promise, so concurrent
                                        // callers (mousemove, click) share one fetch

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
    // readout and the raw-map-click reference mode. The DEM zoom is the tint's: MapLibre's
    // zoom plus one (_FT_ELEV_DEM_SOURCE's tileSize).
    async function elevationAt(lat, lng, mapZoom) {
      const z = demZoomFor(mapZoom + 1);
      const { x, y, px, py } = latLngToTilePixel(lat, lng, z);
      const arr = await ensureDemTile(z, x, y);
      return arr ? arr[py * ${DEM_TILE_SIZE} + px] : null;
    }

    // ── Elevation tool: tint and reference layers ───────────────────────────────
    let elevationToolActive = false;
    let elevationReference = null; // { latlng: [lat, lon], m }; null until one is set
    let elevationRangeM = elevationSetting(parseInt(localStorage.getItem('${ELEV_RANGE_KEY}'), 10), ${JSON.stringify(ELEVATION_RANGE_M)});
    let elevationOpacity = elevationSetting(parseInt(localStorage.getItem('${ELEV_OPACITY_KEY}'), 10), ${JSON.stringify(ELEVATION_OPACITY)});

    const _FT_ELEV_DEM = 'ft-elevation-dem';
    // pmtiles.js's protocol reads the tile's z/x/y from the end of its URL (the app's
    // MapLibre Native takes core's archive URL as it is). Its 512 px tiles are declared as
    // 256, so MapLibre reads a zoom level deeper: two DEM pixels to a CSS pixel,
    // rather than one, which blurs on a high-density screen.
    const _FT_ELEV_DEM_SOURCE = Object.assign({}, ELEVATION_DEM_SOURCE, {
      tiles: [ELEVATION_DEM_SOURCE.tiles[0] + '/{z}/{x}/{y}'],
      tileSize: 256,
    });
    const _FT_ELEV_TINT = 'ft-elevation';
    const _FT_ELEV_REF = 'ft-elevation-reference';

    // Under the tracks and markers (addMapShape()'s layers), above the basemap and overlays.
    function _ftElevBeforeId() {
      const first = map.getStyle().layers.find(l => l.id.startsWith('ft-shape-'));
      return first ? first.id : undefined;
    }

    // Brings the map's tint and reference dot in line with the tool: there while it's on
    // with a reference, at its range and opacity; gone otherwise.
    function _ftSyncElevationLayers() {
      _ftWhenStyleReady(map, () => {
        const show = elevationToolActive && elevationReference;
        if (!show) {
          [_FT_ELEV_TINT, _FT_ELEV_REF].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
          [_FT_ELEV_DEM, _FT_ELEV_REF].forEach(id => { if (map.getSource(id)) map.removeSource(id); });
          return;
        }
        const relief = elevationReliefLayer(elevationReference.m, elevationRangeM, elevationOpacity);
        const refData = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [elevationReference.latlng[1], elevationReference.latlng[0]] } };
        if (!map.getSource(_FT_ELEV_DEM)) map.addSource(_FT_ELEV_DEM, _FT_ELEV_DEM_SOURCE);
        if (map.getLayer(_FT_ELEV_TINT)) {
          map.setPaintProperty(_FT_ELEV_TINT, 'color-relief-color', relief.paint['color-relief-color']);
          map.setPaintProperty(_FT_ELEV_TINT, 'color-relief-opacity', relief.paint['color-relief-opacity']);
        } else {
          map.addLayer(Object.assign({}, relief, { id: _FT_ELEV_TINT, source: _FT_ELEV_DEM }), _ftElevBeforeId());
        }
        if (map.getSource(_FT_ELEV_REF)) {
          map.getSource(_FT_ELEV_REF).setData(refData);
        } else {
          map.addSource(_FT_ELEV_REF, { type: 'geojson', data: refData });
          const ref = elevationReferenceLayer(getInkColor(), getSurfaceColor());
          map.addLayer(Object.assign({}, ref, { id: _FT_ELEV_REF, source: _FT_ELEV_REF }), _ftElevBeforeId());
        }
      });
    }

    function _ftSetElevationReference(latlng, elevM) {
      elevationReference = { latlng, m: elevM };
      elevationReferenceReadout.textContent = toFeet(elevM);
      _ftSyncElevationLayers();
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
      _ftSyncElevationLayers();
    });

    elevationOpacitySlider.addEventListener('input', () => {
      elevationOpacity = parseInt(elevationOpacitySlider.value, 10);
      elevationOpacityValue.textContent = elevationOpacity + '%';
      localStorage.setItem('${ELEV_OPACITY_KEY}', String(elevationOpacity));
      _ftSyncElevationLayers();
    });

    function activateElevationTool() {
      elevationToolActive = true;
      elevationBtn.classList.add('active');
      map.getCanvas().style.cursor = 'crosshair';
      elevationPanel.classList.remove('hidden');
      // The reference survives a toggle off/on, so the tint and its dot come back with it.
      _ftSyncElevationLayers();
      if (pointPickerActive) deactivatePointPicker();
    }

    function deactivateElevationTool() {
      elevationToolActive = false;
      elevationBtn.classList.remove('active');
      map.getCanvas().style.cursor = '';
      elevationPanel.classList.add('hidden');
      _ftSyncElevationLayers();
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
      elevationAt(e.lngLat.lat, e.lngLat.lng, map.getZoom()).then((m) => {
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
      const idx = nearestRouteIdx(e.point);
      if (idx !== -1 && activePointData[idx].elevation_m != null) {
        _ftSetElevationReference(activeLatlngs[idx], activePointData[idx].elevation_m);
        return;
      }
      const clickLatLng = [e.lngLat.lat, e.lngLat.lng];
      elevationAt(clickLatLng[0], clickLatLng[1], map.getZoom()).then((m) => {
        if (m == null) return;
        _ftSetElevationReference(clickLatLng, m);
      });
    });
  `;
}
