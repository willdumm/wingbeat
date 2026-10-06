import { sharedMapControlsMarkup, tileOverlayLegendButtonMarkup, tileOverlayLegendPanelMarkup } from '../shared/map-controls';
import { settingsModalMarkup } from '../shared/settings';
import { elevationToolMarkup } from '../shared/elevation';
import { logoLockupMarkup } from '../shared/brand';
import { icon } from '../shared/icons';

/** Returns the HTML body fragment for the dashboard (header through end of .main). */
export function dashboardMarkup(appName: string): string {
  return /* html */ `
  <div id="ptr-indicator" aria-hidden="true">
    <span id="ptr-icon">↓</span>
    <span id="ptr-label">Pull to refresh</span>
  </div>

  <div id="ptr-content">

  <div id="mobile-topnav" class="mobile-topnav">
    <div class="mobile-topnav-tabs-row">
      <div class="page-nav-tabs">
        <a href="/" class="page-nav-tab active">Flight Tracker</a>
        <a href="/analytics" class="page-nav-tab">Flight Trends</a>
      </div>
    </div>
  </div>

  ${dashboardHeaderMarkup(appName)}

  <!-- Location details popup -->
  <div id="location-popup" class="info-popup hidden" role="dialog" aria-modal="true" aria-label="Current location details">
    <div id="location-popup-backdrop" class="info-popup-backdrop"></div>
    <div id="location-popup-content" class="info-popup-content">
      <div id="location-popup-header" class="info-popup-header">
        <span id="location-popup-title" class="info-popup-title">Current Location</span>
        <button id="location-popup-close" class="info-popup-close" aria-label="Close">&times;</button>
      </div>
      <div id="location-popup-coords-row" class="info-popup-coords-row">
        <span id="location-popup-latlng" class="info-popup-latlng">No data</span>
        <button id="location-popup-copy" class="info-popup-copy" title="Copy coordinates">
          <span id="location-popup-copy-label">Copy</span>
        </button>
      </div>
      <div id="location-popup-details" class="info-popup-details"></div>
      <div id="location-popup-links" class="info-popup-links">
        <div class="info-popup-link-row">
          <a id="location-popup-gmaps" href="#" target="_blank" rel="noopener noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Open in Google Maps
          </a>
          <button class="info-popup-copy info-popup-link-copy" title="Copy link">
            <span class="info-popup-link-copy-lbl">Copy link</span>
          </button>
        </div>
        <div id="location-popup-garmin-row" class="info-popup-link-row" style="display:none">
          <a id="location-popup-garmin" href="#" target="_blank" rel="noopener noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            Open Garmin MapShare
          </a>
          <button class="info-popup-copy info-popup-link-copy" title="Copy link">
            <span class="info-popup-link-copy-lbl">Copy link</span>
          </button>
        </div>
      </div>
    </div>
  </div>

  ${pointPickerPopupMarkup()}

  ${settingsModalMarkup()}

  <div class="main">
    <aside>
      <div class="aside-toolbar">
        <div class="aside-nav-tabs">
          <div class="page-nav-tabs">
            <a href="/" class="page-nav-tab active">Flight Tracker</a>
            <a href="/analytics" class="page-nav-tab">Flight Trends</a>
          </div>
        </div>
      </div>
      <div id="alerts-strip" class="alerts-strip hidden">
          <div id="alerts-strip-bar" class="alerts-strip-bar">
            <span class="chevron">${icon('chevron-right', { size: 14 })}</span>
            <span id="alerts-summary"></span>
          </div>
          <div id="alerts-list" class="alerts-list" style="display:none"></div>
        </div>
      <div id="filter-section-root"></div>
      <div id="show-recent-row">
        <button id="show-recent-btn" class="btn-secondary">Map Current Flights</button>
      </div>
      <div id="flight-list">
        <div id="empty-msg">Loading flights…</div>
      </div>
      <div class="sidebar-footer">
        <button id="bulk-edit-btn" class="settings-btn btn-secondary">Bulk Edit</button>
        <button id="settings-btn" class="settings-btn btn-secondary" data-doc-shot="settings.settings-button">Settings</button>
      </div>
    </aside>

    <div class="map-wrapper">
      <button id="sidebar-toggle" class="show-sidebar-btn">&#8592; Hide flight list</button>
      <div id="map"></div>
      <div id="loading-overlay" class="hidden">Loading track…</div>
      ${elevationToolMarkup()}
      ${tileOverlayLegendPanelMarkup()}
      ${sharedMapControlsMarkup(mapToolButtonsMarkup() + tileOverlayLegendButtonMarkup())}
    </div>
  </div>

  </div>`;
}

/** The point-picker result popup, opened by point-picker.ts. The showcase's flights
 * demo uses it too. */
export function pointPickerPopupMarkup(): string {
  return /* html */ `
  <div id="point-picker-popup" class="info-popup hidden" role="dialog" aria-modal="true" aria-label="Map location">
    <div id="point-picker-backdrop" class="info-popup-backdrop"></div>
    <div id="point-picker-content" class="info-popup-content">
      <div id="point-picker-header" class="info-popup-header">
        <div class="info-popup-title-group">
          <span id="point-picker-title" class="info-popup-title">Selected Location</span>
          <span id="point-picker-route-status" class="point-picker-route-status"></span>
        </div>
        <button id="point-picker-close" class="info-popup-close" aria-label="Close">&times;</button>
      </div>
      <div id="point-picker-coords-row" class="info-popup-coords-row">
        <span id="point-picker-latlng" class="info-popup-latlng"></span>
        <button id="point-picker-copy" class="info-popup-copy" title="Copy coordinates">
          <span id="point-picker-copy-label">Copy</span>
        </button>
      </div>
      <div id="point-picker-details" class="info-popup-details"></div>
      <div id="point-picker-links" class="info-popup-links">
        <div class="info-popup-link-row">
          <a id="point-picker-gmaps" href="#" target="_blank" rel="noopener noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Open in Google Maps
          </a>
          <button class="info-popup-copy info-popup-link-copy" title="Copy link">
            <span class="info-popup-link-copy-lbl">Copy link</span>
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

/** The point-picker and elevation-tool toggle buttons, for sharedMapControlsMarkup()'s
 * extraButtons slot. The showcase's flights demo uses them too. */
export function mapToolButtonsMarkup(): string {
  return `<button id="point-picker-btn" class="controls-btn" title="Pick a map location">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><line x1="12" y1="1" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="23"/><line x1="1" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="23" y2="12"/></svg>
            </button><button id="elevation-tool-btn" class="controls-btn" title="Elevation tint + cursor readout">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 20 9 8l4 6 3-4 5 10z"/></svg>
            </button>`;
}

/** Top bar: logo, per-aircraft status cards (filled by updateAircraftStatusCards) and refresh.
 *  The showcase status demo leaves out the logo (logo: false); its page has one already. */
export function dashboardHeaderMarkup(appName: string, { logo = true }: { logo?: boolean } = {}): string {
  return /* html */ `
  <header>
    ${logo ? logoLockupMarkup(appName, { size: 26, compact: true }) : ''}
    <div id="aircraft-status-bar">
      <div id="aircraft-cards">
        <!-- Populated at runtime by updateAircraftStatusCards() -->
      </div>
    </div>
    <div id="refresh-control">
      <button id="refresh-btn" aria-label="Refresh now" title="Refresh">
        <span id="refresh-icon">&#8635;</span>
        <span id="refresh-time">&mdash;</span>
      </button>
    </div>
  </header>`;
}
