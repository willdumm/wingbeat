import { maplibreMapControlsScripts, sharedMapControlsMarkup } from './map-controls';
import { icon } from './icons';

/**
 * "Set from map" picker for the tenant's default map view (#1): a full-screen settings
 * view (same shell as the named-points / regions editors) where the admin pans and zooms
 * to the view everyone should land on, then confirms to copy the center and zoom into
 * the lat / lng / zoom fields of the Global Settings form. Saving still goes through that
 * form's Save button, so the numeric fields stay the source of truth.
 *
 * Include mapViewPickerMarkup() inside `.settings-views`, mapViewPickerStyles() with the
 * settings styles, and mapViewPickerScript() inside settingsModalScript() (it uses
 * _settingsNavigateTo / _settingsNavigateBack from there).
 */

export function mapViewPickerMarkup(): string {
  return `
        <div class="settings-view settings-view-detail" id="settings-view-map-view-picker" data-fullscreen-editor>
          <div class="map-editor-body">
            <div class="map-editor-map-wrap">
              <div id="mvp-map"></div>
              <div class="map-view-picker-crosshair">${icon('crosshair', { size: 28 })}</div>
              ${sharedMapControlsMarkup(undefined, 'mvp-')}
            </div>
            <div class="map-editor-panel visible">
              <p class="settings-section-desc">Pan and zoom to the view everyone should see when they open the map.</p>
              <p class="settings-msg" id="mvp-readout"></p>
              <div class="settings-add-actions">
                <button id="mvp-use" class="btn-primary">Use this view</button>
                <button id="mvp-cancel" class="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>`;
}

export function mapViewPickerStyles(): string {
  return `
    .map-view-picker-crosshair {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 500;
      pointer-events: none;
      color: var(--accent);
      display: flex;
    }
  `;
}

export function mapViewPickerScript(): string {
  return `
    // ── Default map view picker (#1) ──────────────────────────────────────────

    let _mvpMap = null;

    // map_default_zoom's scale is MapLibre's plus one (_ftDefaultView()), to a tenth.
    function _mvpZoom() { return Math.round((_mvpMap.getZoom() + 1) * 10) / 10; }

    function _mvpUpdateReadout() {
      if (_mvpMap._ftNoMap) return;
      const c = _mvpMap.getCenter();
      document.getElementById('mvp-readout').textContent =
        c.lat.toFixed(4) + ', ' + c.lng.toFixed(4) + ' · zoom ' + _mvpZoom();
    }

    function _openMapViewPicker() {
      const lat = parseFloat(document.getElementById('settings-tenant-lat').value);
      const lng = parseFloat(document.getElementById('settings-tenant-lng').value);
      const zoom = parseFloat(document.getElementById('settings-tenant-zoom').value);
      const view = _ftDefaultView();
      if (!isNaN(lat) && !isNaN(lng)) view.center = [lng, lat];
      if (!isNaN(zoom)) view.zoom = zoom - 1;

      _settingsNavigateTo('settings-view-map-view-picker', 'Default map view');
      if (!_mvpMap) {
        _mvpMap = createMap(document.getElementById('mvp-map'), view);
        ${maplibreMapControlsScripts('_mvpMap', 'mvp-')}
        _mvpMap.on('move', _mvpUpdateReadout);
      }
      _mvpMap.resize();
      _mvpMap.jumpTo(view);
      _mvpUpdateReadout();
    }

    document.getElementById('settings-tenant-map-pick').addEventListener('click', _openMapViewPicker);
    document.getElementById('mvp-cancel').addEventListener('click', _settingsNavigateBack);
    document.getElementById('mvp-use').addEventListener('click', () => {
      if (_mvpMap._ftNoMap) { _settingsNavigateBack(); return; }
      const c = _mvpMap.getCenter();
      document.getElementById('settings-tenant-lat').value = c.lat.toFixed(5);
      document.getElementById('settings-tenant-lng').value = c.lng.toFixed(5);
      document.getElementById('settings-tenant-zoom').value = String(_mvpZoom());
      _settingsNavigateBack();
      const status = document.getElementById('settings-tenant-status');
      status.textContent = 'Map view filled in. Save to apply.';
      status.style.display = '';
    });
  `;
}
