import { sharedMapControlsMarkup, tileOverlayLegendButtonMarkup, tileOverlayLegendPanelMarkup } from '../shared/map-controls';
import { settingsModalMarkup } from '../shared/settings';
import { mobileTopnavMarkup } from '../shared/sidebar';
import { logoLockupMarkup } from '../shared/brand';
import { icon } from '../shared/icons';

export function analyticsMarkup(appName: string): string {
  return /* html */ `
  ${mobileTopnavMarkup(appName, 'Flight Trends', 'panel')}

  <header class="analytics-header">
    ${logoLockupMarkup(appName, { size: 26, compact: true })}
    <span class="analytics-header-sep" aria-hidden="true"></span>
    <span class="analytics-header-title">Flight Trends</span>
  </header>

  <div class="analytics-layout">
    <aside class="analytics-panel">
      <div class="panel-toolbar">
        <div class="aside-nav-tabs">
          <div class="page-nav-tabs">
            <a href="/" class="page-nav-tab">Flight Tracker</a>
            <a href="/analytics" class="page-nav-tab active">Flight Trends</a>
          </div>
        </div>
      </div>
      <div class="analytics-panel-content">
        <div id="filter-section-root"></div>

        ${analyticsTotalsMarkup()}
      </div>
      <div class="analytics-panel-footer sidebar-footer">
        <button id="settings-btn" class="settings-btn btn-secondary" data-doc-shot="settings.settings-button">Settings</button>
      </div>
    </aside>

    <div class="analytics-map-wrapper">
      ${analyticsViewTabsMarkup()}
      <div class="view-body">
        <button id="sidebar-toggle" class="show-sidebar-btn">&#8592; Hide panel</button>
        <div id="analytics-map"></div>

        <div id="analytics-loading" class="hidden">Loading path data…</div>
        <div id="analytics-notice" style="display:none"></div>

        ${analyticsLayerControlsMarkup()}

        ${tileOverlayLegendPanelMarkup()}
        ${sharedMapControlsMarkup(tileOverlayLegendButtonMarkup())}

        ${streamgraphMarkup()}
      </div>
    </div>
  </div>

  ${settingsModalMarkup()}

  <div id="info-popup-overlay" style="display:none">
    <div id="info-popup-card">
      <button id="info-popup-close" aria-label="Close">&times;</button>
      <div class="info-popup-title">Flight Hour Attribution</div>
      <div class="info-popup-body">
        <p>Flight hours are attributed to geographic regions based on where each flight starts and ends relative to your home bases (regions whose name ends in &ldquo;(Base)&rdquo;):</p>
        <ul>
          <li><strong>Both endpoints at a home base</strong> &mdash; flight not counted</li>
          <li><strong>Start at a home base only</strong> &mdash; all hours go to the end location&rsquo;s region</li>
          <li><strong>End at a home base only</strong> &mdash; all hours go to the start location&rsquo;s region</li>
          <li><strong>Neither endpoint at a home base</strong> &mdash; hours split equally between start and end regions</li>
        </ul>
        <p>Stops at a home base are listed separately and left out of the other regions&rsquo; stop percentages.</p>
      </div>
    </div>
  </div>`;
}

/** Overall Totals and Monthly Accounting panel sections (filled by accounting.ts). */
export function analyticsTotalsMarkup(): string {
  return /* html */ `
  <div class="panel-section panel-totals">
    <div class="section-label">Overall Totals</div>
    <div id="overall-totals-container"></div>
  </div>

  <div class="panel-section panel-accounting">
    <div class="section-label">Monthly Accounting <button class="info-btn" aria-label="Attribution info">ⓘ</button></div>
    <div id="accounting-table-container">
      <div class="empty-msg">Loading…</div>
    </div>
  </div>`;
}

/** Map / Stream Graph view switcher. */
export function analyticsViewTabsMarkup(): string {
  return /* html */ `
  <div id="view-tabs">
    <button class="view-tab active" data-view="map" aria-pressed="true">Map</button>
    <button class="view-tab" data-view="streamgraph" aria-pressed="false">Stream Graph</button>
  </div>`;
}

/** Map legend with the layer toggles (wired by wireLayerControls in scripts/layers.ts). */
export function analyticsLayerControlsMarkup(): string {
  return /* html */ `
  <div id="layer-controls" class="map-legend-card collapsed">
    <div class="layer-controls-label map-legend-label">Legend<button id="legend-toggle" class="legend-toggle" aria-label="Toggle legend"><span class="chevron" data-open="false">${icon('chevron-right', { size: 14 })}</span></button></div>
    <div class="layer-item active" data-layer="endpoint-heat">
      <span class="layer-swatch swatch-heat"></span>
      <span>Endpoint heatmap</span>
      <button class="info-btn info-btn-sm" aria-label="Attribution info">ⓘ</button>
    </div>
    <div id="heat-weight-toggle">
      <button class="heat-weight-btn active" data-mode="time">Time</button>
      <button class="heat-weight-btn" data-mode="stops">Stops</button>
    </div>
    <div class="layer-item" data-layer="path-density">
      <span class="layer-swatch swatch-density"></span>
      <span>Route heatmap</span>
    </div>
    <div class="layer-item" data-layer="flight-lines">
      <span class="layer-swatch swatch-lines"></span>
      <span>Flight lines</span>
    </div>
    <div class="layer-item" data-layer="region-bounds">
      <span class="layer-swatch swatch-bounds"></span>
      <span>Region boundaries</span>
    </div>
  </div>`;
}

/** Stream graph chart + toolbar, hidden until the Stream Graph view is picked. */
export function streamgraphMarkup(): string {
  return /* html */ `
  <div id="streamgraph-container" style="display:none">
    <div id="streamgraph-chart"></div>
    <div id="streamgraph-toolbar">
      <div class="sg-ctrl-group">
        <span class="sg-ctrl-label">Mode</span>
        <button class="sg-toggle active" data-sg-mode="time">Time</button>
        <button class="sg-toggle" data-sg-mode="stops">Stops</button>
      </div>
      <div class="sg-ctrl-sep"></div>
      <div class="sg-ctrl-group">
        <span class="sg-ctrl-label">Scale</span>
        <button class="sg-toggle active" data-sg-norm="abs">Absolute</button>
        <button class="sg-toggle" data-sg-norm="pct">%</button>
      </div>
      <div class="sg-ctrl-sep"></div>
      <div class="sg-ctrl-group">
        <span class="sg-ctrl-label">Interval</span>
        <button class="sg-toggle active" data-sg-iv="auto">Auto</button>
        <button class="sg-toggle" data-sg-iv="day">Day</button>
        <button class="sg-toggle" data-sg-iv="week">Wk</button>
        <button class="sg-toggle" data-sg-iv="month">Mo</button>
      </div>
      <div class="sg-ctrl-sep" data-sg-home-base></div>
      <div class="sg-ctrl-group" data-sg-home-base>
        <span class="sg-ctrl-label" id="sg-home-base-label">Home base</span>
        <button class="sg-toggle active" id="sg-home-base-btn">On</button>
      </div>
    </div>
  </div>`;
}
