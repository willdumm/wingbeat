import {
  sharedTileLayerDefs,
  sharedMapControlsMarkup,
  sharedMapControlsScripts,
} from './map-controls';
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
    let _mvpTileLayers = null;
    let _mvpCurrentTileLayer = null;

    function _mvpUpdateReadout() {
      const c = _mvpMap.getCenter();
      document.getElementById('mvp-readout').textContent =
        c.lat.toFixed(4) + ', ' + c.lng.toFixed(4) + ' · zoom ' + _mvpMap.getZoom();
    }

    function _openMapViewPicker() {
      const lat = parseFloat(document.getElementById('settings-tenant-lat').value);
      const lng = parseFloat(document.getElementById('settings-tenant-lng').value);
      const zoom = parseInt(document.getElementById('settings-tenant-zoom').value, 10);
      const center = isNaN(lat) || isNaN(lng)
        ? [window.APP_SETTINGS.mapDefaultLat, window.APP_SETTINGS.mapDefaultLng]
        : [lat, lng];
      const z = isNaN(zoom) ? window.APP_SETTINGS.mapDefaultZoom : zoom;

      _settingsNavigateTo('settings-view-map-view-picker', 'Default map view');
      if (!_mvpMap) {
        const mvpMap = L.map('mvp-map', { zoomControl: false, attributionControl: false, zoomSnap: 1 })
          .setView(center, z);
        ${sharedTileLayerDefs('mvpMap', '_mvpTileLayers', '_mvpCurrentTileLayer', false)}
        _mvpMap = mvpMap;
        ${sharedMapControlsScripts('_mvpMap', 'mvp-', '_mvpTileLayers', '_mvpCurrentTileLayer')}
        _mvpMap.on('moveend zoomend', _mvpUpdateReadout);
      }
      _mvpMap.invalidateSize();
      _mvpMap.setView(center, z, { animate: false });
      _mvpUpdateReadout();
    }

    document.getElementById('settings-tenant-map-pick').addEventListener('click', _openMapViewPicker);
    document.getElementById('mvp-cancel').addEventListener('click', _settingsNavigateBack);
    document.getElementById('mvp-use').addEventListener('click', () => {
      const c = _mvpMap.getCenter();
      document.getElementById('settings-tenant-lat').value = c.lat.toFixed(5);
      document.getElementById('settings-tenant-lng').value = c.lng.toFixed(5);
      document.getElementById('settings-tenant-zoom').value = String(_mvpMap.getZoom());
      _settingsNavigateBack();
      const status = document.getElementById('settings-tenant-status');
      status.textContent = 'Map view filled in. Save to apply.';
      status.style.display = '';
    });
  `;
}
