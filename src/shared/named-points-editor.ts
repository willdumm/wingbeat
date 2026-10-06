import {
  sharedTileLayerDefs,
  sharedMapControlsMarkup,
  sharedMapControlsScripts,
  tileOverlayLegendButtonMarkup,
  tileOverlayLegendPanelMarkup,
  tileOverlayLegendMountScript,
} from './map-controls';

export function namedPointsEditorMarkup(): string {
  return `
        <div class="settings-view settings-view-detail" id="settings-view-named-points-editor" data-fullscreen-editor>
          <div class="map-editor-body">
            <div class="map-editor-map-wrap">
              <div id="np-editor-map"></div>
              <div class="map-tool-overlay">
                <button class="map-tool-btn active" id="np-mode-edit" title="Edit points">&#9998;</button>
                <button class="map-tool-btn" id="np-mode-add" title="Add point">&#43;</button>
                <button class="map-tool-btn" id="np-toggle-radii" title="Show all radius circles">&#9678;</button>
              </div>
              <div class="map-editor-status-overlay">
                <span id="np-editor-status" class="settings-msg"></span>
              </div>
              ${tileOverlayLegendPanelMarkup('np-')}
              ${sharedMapControlsMarkup(tileOverlayLegendButtonMarkup('np-'), 'np-')}
            </div>
            <div class="map-editor-panel" id="np-editor-panel">
              <div class="settings-form-row">
                <div class="settings-form-label">Name</div>
                <input type="text" id="np-editor-name" autocomplete="off" />
              </div>
              <div class="settings-form-row">
                <div class="settings-form-label">Radius (km)</div>
                <input type="number" id="np-editor-radius" step="any" min="0" autocomplete="off" />
              </div>
              <div class="settings-add-actions">
                <button id="np-editor-save" class="btn-primary">Save</button>
                <button id="np-editor-delete" class="settings-danger-btn">Delete</button>
                <button id="np-editor-cancel" class="btn-secondary">Cancel</button>
              </div>
              <p id="np-editor-msg" class="settings-msg" style="display:none"></p>
            </div>
          </div>
        </div>`;
}

export function namedPointsEditorScript(): string {
  return `
    // ── Named points export / import ──────────────────────────────────────────

    document.getElementById('settings-named-points-export').addEventListener('click', () => {
      _downloadGeoJSON('/api/named-points', 'named-points.geojson');
    });

    document.getElementById('settings-named-points-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await _importGeoJSON(file, 'settings-named-points-status', '/api/named-points/import');
      e.target.value = '';
    });

    // ── Named points map editor ───────────────────────────────────────────────

    let _npMap = null;
    let _npTileLayers = null;
    let _npCurrentTileLayer = null;
    let _npPointLayers = new Map(); // id → { marker, circle }
    let _npEditorMode = 'edit';
    let _npSelectedId = null;
    let _npAddLatLng = null;
    let _npAddMarker = null;
    let _npShowAllRadii = false; // radius circles: selected point only by default

    function _npShowPanel(name, maxKm, showDelete) {
      document.getElementById('np-editor-name').value = name ?? '';
      document.getElementById('np-editor-radius').value = maxKm != null ? maxKm : '';
      document.getElementById('np-editor-delete').style.display = showDelete ? '' : 'none';
      document.getElementById('np-editor-delete').disabled = false;
      document.getElementById('np-editor-msg').style.display = 'none';
      document.getElementById('np-editor-panel').classList.add('visible');
      if (_npMap) setTimeout(() => _npMap.invalidateSize(), 0);
    }

    function _npHidePanel() {
      if (_npSelectedId !== null) {
        const layers = _npPointLayers.get(_npSelectedId);
        if (layers) {
          const color = getAccentColor();
          layers.marker.setStyle({ color, fillColor: color });
          if (layers.circle) {
            layers.circle.setStyle({ color, fillColor: color, fillOpacity: 0.1 });
            if (!_npShowAllRadii) layers.circle.remove();
          }
        }
      }
      document.getElementById('np-editor-panel').classList.remove('visible');
      _npSelectedId = null;
      _npAddLatLng = null;
      if (_npAddMarker) { _npAddMarker.remove(); _npAddMarker = null; }
      if (_npMap) setTimeout(() => _npMap.invalidateSize(), 0);
    }

    function _npRenderPoint(feature) {
      const { id, name, maxKm } = feature.properties;
      const [lng, lat] = feature.geometry.coordinates;
      const existing = _npPointLayers.get(id);
      if (existing) { existing.marker.remove(); if (existing.circle) existing.circle.remove(); }
      const color = getAccentColor();
      // bubblingMouseEvents: false — otherwise a marker click also fires the map's click
      // handler, which in add mode would drop a temp marker on top of this point and
      // open the blank add panel over the selection.
      const marker = L.circleMarker([lat, lng], {
        radius: 6, color, fillColor: color, fillOpacity: 0.85, weight: 2, bubblingMouseEvents: false,
      }).addTo(_npMap);
      let circle = null;
      if (maxKm && maxKm > 0) {
        circle = L.circle([lat, lng], {
          radius: maxKm * 1000, color, fillColor: color, fillOpacity: 0.1, weight: 1, interactive: false,
        });
        if (_npShowAllRadii) circle.addTo(_npMap);
      }
      _npPointLayers.set(id, { marker, circle });
      marker.on('click', () => {
        // Selecting an existing point always works — in add mode, drop back to edit mode
        // instead of ignoring the click.
        if (_npEditorMode !== 'edit') _npSetMode('edit');
        _npHidePanel();
        _npSelectedId = id;
        marker.setStyle({ color: '#f59e0b', fillColor: '#f59e0b' });
        if (circle) {
          circle.addTo(_npMap);
          circle.setStyle({ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.2 });
        }
        _npShowPanel(name, maxKm, true);
      });
    }

    async function _npLoadPoints() {
      _setEditorStatus('np-editor-status', 'Loading…', false);
      for (const { marker, circle } of _npPointLayers.values()) {
        marker.remove();
        if (circle) circle.remove();
      }
      _npPointLayers.clear();
      try {
        const resp = await fetch('/api/named-points', { cache: 'no-store' });
        if (!resp.ok) { _setEditorStatus('np-editor-status', 'Failed to load points.', true); return; }
        const geojson = await resp.json();
        for (const f of geojson.features) _npRenderPoint(f);
        _setEditorStatus('np-editor-status', '', false);
      } catch (_) {
        _setEditorStatus('np-editor-status', 'Failed to load points.', true);
      }
    }

    function _npSetMode(mode) {
      _npEditorMode = mode;
      document.getElementById('np-mode-edit').classList.toggle('active', mode === 'edit');
      document.getElementById('np-mode-add').classList.toggle('active', mode === 'add');
      _npHidePanel();
      _setEditorStatus('np-editor-status', mode === 'add' ? 'Click map to place point.' : '', false);
    }

    function _openNamedPointsEditor() {
      _settingsNavigateTo('settings-view-named-points-editor', 'Named Points');
      if (!_npMap) {
        const npMap = L.map('np-editor-map', { zoomControl: false, attributionControl: false })
          .setView(
            [window.APP_SETTINGS.mapDefaultLat, window.APP_SETTINGS.mapDefaultLng],
            window.APP_SETTINGS.mapDefaultZoom
          );
        ${sharedTileLayerDefs('npMap', '_npTileLayers', '_npCurrentTileLayer', false)}
        _npMap = npMap;
        ${sharedMapControlsScripts('_npMap', 'np-', '_npTileLayers', '_npCurrentTileLayer')}
        ${tileOverlayLegendMountScript('_npMap', 'np-')}
        _npMap.on('click', (e) => {
          if (_npEditorMode !== 'add') return;
          _npHidePanel();
          _npAddLatLng = e.latlng;
          _npAddMarker = L.circleMarker(e.latlng, {
            radius: 6, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.85, weight: 2,
          }).addTo(_npMap);
          _npShowPanel('', null, false);
        });
      }
      _npMap.invalidateSize();
      _npHidePanel();
      _npSetMode('edit');
      _npLoadPoints();
    }

    document.getElementById('settings-named-points-editor-btn').addEventListener('click', _openNamedPointsEditor);

    document.getElementById('np-mode-edit').addEventListener('click', () => _npSetMode('edit'));
    document.getElementById('np-mode-add').addEventListener('click', () => _npSetMode('add'));
    document.getElementById('np-editor-cancel').addEventListener('click', _npHidePanel);

    document.getElementById('np-toggle-radii').addEventListener('click', () => {
      _npShowAllRadii = !_npShowAllRadii;
      document.getElementById('np-toggle-radii').classList.toggle('active', _npShowAllRadii);
      for (const [pid, layers] of _npPointLayers) {
        if (!layers.circle) continue;
        if (_npShowAllRadii || pid === _npSelectedId) layers.circle.addTo(_npMap);
        else layers.circle.remove();
      }
    });

    document.getElementById('np-editor-save').addEventListener('click', async () => {
      const name = document.getElementById('np-editor-name').value.trim();
      const msgEl = document.getElementById('np-editor-msg');
      if (!name) { msgEl.textContent = 'Name is required.'; msgEl.style.display = ''; return; }
      const radiusRaw = document.getElementById('np-editor-radius').value;
      const maxKm = radiusRaw !== '' ? parseFloat(radiusRaw) : null;
      const saveBtn = document.getElementById('np-editor-save');
      saveBtn.disabled = true;
      try {
        if (_npSelectedId !== null) {
          const resp = await fetch('/api/named-points/' + _npSelectedId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, max_km: maxKm }),
          });
          if (resp.ok) {
            const savedId = _npSelectedId;
            const layers = _npPointLayers.get(savedId);
            const latlng = layers ? layers.marker.getLatLng() : null;
            _npHidePanel();
            if (latlng) {
              _npRenderPoint({
                type: 'Feature',
                properties: { id: savedId, name, maxKm },
                geometry: { type: 'Point', coordinates: [latlng.lng, latlng.lat] },
              });
            } else {
              await _npLoadPoints();
            }
            _setEditorStatus('np-editor-status', 'Saved.', false);
            setTimeout(() => _setEditorStatus('np-editor-status', '', false), 2000);
          } else {
            const d = await resp.json().catch(() => ({}));
            msgEl.textContent = d.error ?? 'Failed to save.';
            msgEl.style.display = '';
          }
        } else if (_npAddLatLng) {
          const resp = await fetch('/api/named-points', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, lat: _npAddLatLng.lat, lon: _npAddLatLng.lng, max_km: maxKm }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (_npAddMarker) { _npAddMarker.remove(); _npAddMarker = null; }
            _npRenderPoint({
              type: 'Feature',
              properties: { id: data.id, name, maxKm },
              geometry: { type: 'Point', coordinates: [_npAddLatLng.lng, _npAddLatLng.lat] },
            });
            _npAddLatLng = null;
            _npHidePanel();
            _setEditorStatus('np-editor-status', 'Added.', false);
            setTimeout(() => _setEditorStatus('np-editor-status', _npEditorMode === 'add' ? 'Click map to place point.' : '', false), 2000);
          } else {
            const d = await resp.json().catch(() => ({}));
            msgEl.textContent = d.error ?? 'Failed to add.';
            msgEl.style.display = '';
          }
        }
      } catch (_) {
        msgEl.textContent = 'Error saving.';
        msgEl.style.display = '';
      }
      saveBtn.disabled = false;
    });

    document.getElementById('np-editor-delete').addEventListener('click', async () => {
      if (_npSelectedId === null) return;
      if (!confirm('Delete this named point?')) return;
      const deleteBtn = document.getElementById('np-editor-delete');
      deleteBtn.disabled = true;
      const msgEl = document.getElementById('np-editor-msg');
      try {
        const resp = await fetch('/api/named-points/' + _npSelectedId, { method: 'DELETE' });
        if (resp.ok) {
          const layers = _npPointLayers.get(_npSelectedId);
          if (layers) { layers.marker.remove(); if (layers.circle) layers.circle.remove(); _npPointLayers.delete(_npSelectedId); }
          _npHidePanel();
          _setEditorStatus('np-editor-status', 'Deleted.', false);
          setTimeout(() => _setEditorStatus('np-editor-status', '', false), 2000);
        } else {
          const d = await resp.json().catch(() => ({}));
          msgEl.textContent = d.error ?? 'Failed to delete.';
          msgEl.style.display = '';
          deleteBtn.disabled = false;
        }
      } catch (_) {
        msgEl.textContent = 'Error deleting.';
        msgEl.style.display = '';
        deleteBtn.disabled = false;
      }
    });
  `;
}
