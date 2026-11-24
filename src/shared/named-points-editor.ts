import {
  maplibreMapControlsScripts,
  maplibreOverlayLegendMountScript,
  sharedMapControlsMarkup,
  tileOverlayLegendButtonMarkup,
  tileOverlayLegendPanelMarkup,
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
                <button id="np-editor-delete" class="btn-danger">Delete</button>
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
      _downloadGeoJSON(fetchNamedPoints, 'named-points.geojson');
    });

    document.getElementById('settings-named-points-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await _importGeoJSON(file, 'settings-named-points-status', importNamedPoints);
      e.target.value = '';
    });

    // ── Named points map editor ───────────────────────────────────────────────

    let _npMap = null;
    let _npShape = null;            // the points and their radius circles (addMapShape)
    let _npPoints = new Map();      // id → { name, maxKm, lat, lng }
    let _npEditorMode = 'edit';
    let _npSelectedId = null;
    let _npAddLatLng = null;
    let _npShowAllRadii = false; // radius circles: selected point only by default

    function _npShowPanel(name, maxKm, showDelete) {
      document.getElementById('np-editor-name').value = name ?? '';
      document.getElementById('np-editor-radius').value = maxKm != null ? maxKm : '';
      document.getElementById('np-editor-delete').style.display = showDelete ? '' : 'none';
      document.getElementById('np-editor-delete').disabled = false;
      document.getElementById('np-editor-msg').style.display = 'none';
      document.getElementById('np-editor-panel').classList.add('visible');
    }

    function _npHidePanel() {
      document.getElementById('np-editor-panel').classList.remove('visible');
      _npSelectedId = null;
      _npAddLatLng = null;
      _npDraw();
    }

    // Redraws every point: its dot, and its radius circle if it's selected or all show.
    function _npDraw() {
      if (!_npShape) return;
      const dot = (p, color) => _ftPointFeature([p.lat, p.lng], { color, radius: 6, opacity: 0.85, width: 2, id: p.id });
      const features = [];
      for (const [id, p] of _npPoints) {
        const selected = id === _npSelectedId;
        const color = selected ? MAP_EDITOR_SELECTED : getAccentColor();
        if (p.maxKm > 0 && (selected || _npShowAllRadii)) {
          features.push({
            type: 'Feature',
            properties: { color, opacity: selected ? 0.2 : 0.1, width: 1 },
            geometry: { type: 'Polygon', coordinates: [circleRing(p.lat, p.lng, p.maxKm)] },
          });
        }
        features.push(dot({ ...p, id }, color));
      }
      if (_npAddLatLng) features.push(dot(_npAddLatLng, MAP_EDITOR_ADDING));
      _npShape.setFeatures(features);
    }

    // The named point at a screen point, or undefined. A few px around it, for touch.
    function _npPointAt(point) {
      return _ftFeatureAt(_npMap, _npShape.id + '-editor-dots', point, 5)?.properties.id;
    }

    function _npSelect(id) {
      // Selecting an existing point always works — in add mode, drop back to edit mode
      // instead of ignoring the click.
      if (_npEditorMode !== 'edit') _npSetMode('edit');
      _npHidePanel();
      _npSelectedId = id;
      _npDraw();
      const { name, maxKm } = _npPoints.get(id);
      _npShowPanel(name, maxKm, true);
    }

    async function _npLoadPoints() {
      _setEditorStatus('np-editor-status', 'Loading…', false);
      _npPoints.clear();
      _npDraw();
      try {
        const geojson = await fetchNamedPoints();
        for (const f of geojson.features) {
          const [lng, lat] = f.geometry.coordinates;
          _npPoints.set(f.properties.id, { name: f.properties.name, maxKm: f.properties.maxKm, lat, lng });
        }
        _npDraw();
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
        _npMap = createMap(document.getElementById('np-editor-map'), _ftDefaultView());
        ${maplibreMapControlsScripts('_npMap', 'np-')}
        ${maplibreOverlayLegendMountScript('_npMap', 'np-')}
        _npShape = addMapShape(_npMap, [], [regionFillLayer(), regionOutlineLayer(), editorDotLayer()]);
        _npMap.on('click', (e) => {
          const id = _npPointAt(e.point);
          if (id !== undefined) { _npSelect(id); return; }
          if (_npEditorMode !== 'add') return;
          _npHidePanel();
          _npAddLatLng = e.lngLat;
          _npDraw();
          _npShowPanel('', null, false);
        });
        _npMap.on('mousemove', (e) => {
          _npMap.getCanvas().style.cursor = _npPointAt(e.point) !== undefined ? 'pointer' : '';
        });
      }
      _npMap.resize();
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
      _npDraw();
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
          const saved = await updateNamedPoint(_npSelectedId, { name, max_km: maxKm }).then(() => true, (err) => {
            msgEl.textContent = apiErrorMessage(err, 'Failed to save.');
            msgEl.style.display = '';
            return false;
          });
          if (saved) {
            const savedId = _npSelectedId;
            const point = _npPoints.get(savedId);
            if (point) Object.assign(point, { name, maxKm });
            _npHidePanel();
            if (!point) await _npLoadPoints();
            _setEditorStatus('np-editor-status', 'Saved.', false);
            setTimeout(() => _setEditorStatus('np-editor-status', '', false), 2000);
          }
        } else if (_npAddLatLng) {
          const data = await createNamedPoint({ name, lat: _npAddLatLng.lat, lon: _npAddLatLng.lng, max_km: maxKm }).catch((err) => {
            msgEl.textContent = apiErrorMessage(err, 'Failed to add.');
            msgEl.style.display = '';
            return null;
          });
          if (data) {
            _npPoints.set(data.id, { name, maxKm, lat: _npAddLatLng.lat, lng: _npAddLatLng.lng });
            _npHidePanel();
            _setEditorStatus('np-editor-status', 'Added.', false);
            setTimeout(() => _setEditorStatus('np-editor-status', _npEditorMode === 'add' ? 'Click map to place point.' : '', false), 2000);
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
        const deleted = await deleteNamedPoint(_npSelectedId).then(() => true, (err) => {
          msgEl.textContent = apiErrorMessage(err, 'Failed to delete.');
          msgEl.style.display = '';
          deleteBtn.disabled = false;
          return false;
        });
        if (deleted) {
          _npPoints.delete(_npSelectedId);
          _npHidePanel();
          _setEditorStatus('np-editor-status', 'Deleted.', false);
          setTimeout(() => _setEditorStatus('np-editor-status', '', false), 2000);
        }
      } catch (_) {
        msgEl.textContent = 'Error deleting.';
        msgEl.style.display = '';
        deleteBtn.disabled = false;
      }
    });
  `;
}
