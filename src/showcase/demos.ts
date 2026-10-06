/**
 * What goes inside each showcase demo's shadow root (see scripts.ts): the real page
 * stylesheet it adopts, the real markup fragments it's built from, and a small
 * showcase-only stylesheet that fits app-page layout (full-viewport flex columns,
 * off-canvas drawers) into a fixed-size frame on the landing page.
 */
import { dashboardPageStyles } from '../dashboard';
import { analyticsPageStyles } from '../analytics';
import { dashboardHeaderMarkup, mapToolButtonsMarkup, pointPickerPopupMarkup } from '../dashboard/markup';
import { elevationToolMarkup } from '../shared/elevation';
import { analyticsTotalsMarkup, analyticsViewTabsMarkup, analyticsLayerControlsMarkup, streamgraphMarkup } from '../analytics/markup';
import { pilotDutyMarkup, typstLoadOverlayMarkup } from '../shared/pilot-duty';
import { sharedMapControlsMarkup } from '../shared/map-controls';

const LEAFLET_CSS = '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />';

/**
 * Shadow roots don't see <html data-theme>, so the handful of `[data-theme="…"] X`
 * rules in the page stylesheets are rewritten to match the host element instead;
 * scripts.ts mirrors html[data-theme] onto every demo host. Theme tokens themselves
 * inherit into the shadow tree from <html> as usual.
 */
function hostThemeCss(css: string): string {
  return css.replace(/\[data-theme="(light|dark)"\]/g, ':host([data-theme="$1"])');
}

export function demoStylesheets(): { dashboard: string; analytics: string; demo: string } {
  return {
    dashboard: hostThemeCss(dashboardPageStyles()),
    analytics: hostThemeCss(analyticsPageStyles()),
    demo: demoStyles(),
  };
}

/** Layout glue for app UI inside a landing-page frame. Tokens only. */
function demoStyles(): string {
  return `
    :host {
      display: block;
      font-family: var(--font-body);
      color: var(--text-primary);
      background: var(--bg-base);
      -webkit-font-smoothing: antialiased;
    }

    /* Status bar: the dashboard header without its sticky-app positioning (or its logo). */
    header { box-shadow: none; padding-left: 0.75rem; }

    /* Flights: the dashboard's aside + map, filling the frame. */
    .main { height: 100%; }
    #flight-list { padding-top: 0; }
    /* The point-picker popup covers the frame, not the whole landing page. */
    .info-popup { position: absolute; }
    @media (max-width: 640px) {
      /* The open drawer covers the map; Leaflet's own controls would sit on top of it. */
      aside.open ~ .map-wrapper .map-controls-wrap { display: none; }
    }

    /* Maintenance: aircraft info view without the settings modal around it. */
    .sc-ac-title {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
      padding: var(--space-4) var(--space-4) var(--space-1);
      font-family: var(--font-ui);
    }
    .sc-ac-tail { font-family: var(--font-mono); font-weight: var(--weight-semibold); font-size: var(--size-lg); }
    .sc-ac-name { color: var(--text-muted); font-size: var(--size-sm); }
    .aircraft-info-body { padding: var(--space-3) var(--space-4) var(--space-4); }

    /* Duty log: scroll the table under the sticky toolbar; the export overlay covers the frame. */
    .sc-duty { position: relative; height: 100%; background: var(--surface-1); }
    .sc-duty-scroll { height: 100%; overflow: auto; }

    /* Analytics: panel + map/stream graph filling the frame. */
    .analytics-layout { height: 100%; }
    /* The panel never collapses here, and animating its width across the mobile
       breakpoint squeezes the map to zero mid-transition. */
    .analytics-panel { transition: none; }
    .info-btn { display: none; }
    .sc-filter { padding-bottom: var(--space-3); }
    .sc-filter .page-nav-tab { font-family: var(--font-mono); }
    @media (max-width: 640px) {
      /* No room for a drawer: stack the panel above the map instead. */
      .analytics-layout { flex-direction: column; }
      .analytics-panel {
        position: static;
        transform: none;
        width: 100%;
        height: 42%;
        flex: none;
        box-shadow: none;
        border-right: none;
        border-bottom: 1px solid var(--border);
      }
      .analytics-map-wrapper { flex: 1; min-height: 0; }
    }
  `;
}

export function demoMarkup(appName: string): Record<'status' | 'flights' | 'maintenance' | 'duty' | 'analytics', string> {
  return {
    status: dashboardHeaderMarkup(appName, { logo: false }),

    flights: /* html */ `${LEAFLET_CSS}
  <div class="main">
    <aside>
      <button class="sidebar-mobile-toggle" id="mobile-map-btn">View map &#8594;</button>
      <div id="flight-list"></div>
    </aside>
    <div class="map-wrapper">
      <button id="sidebar-toggle" class="show-sidebar-btn"></button>
      <div id="map"></div>
      ${elevationToolMarkup()}
      ${sharedMapControlsMarkup(mapToolButtonsMarkup())}
    </div>
  </div>
  ${pointPickerPopupMarkup()}`,

    // Filled by scripts.ts with _acTimerHtml / _acScheduleHtml.
    maintenance: /* html */ `
  <div class="sc-ac-title"><span class="sc-ac-tail" id="sc-ac-tail"></span><span class="sc-ac-name" id="sc-ac-name"></span></div>
  <div id="aircraft-info-body" class="aircraft-info-body"></div>`,

    duty: /* html */ `
  <div class="sc-duty">
    <div class="sc-duty-scroll">${pilotDutyMarkup()}</div>
    ${typstLoadOverlayMarkup()}
  </div>`,

    analytics: /* html */ `${LEAFLET_CSS}
  <div class="analytics-layout">
    <aside class="analytics-panel">
      <div class="analytics-panel-content">
        <div class="panel-section sc-filter">
          <div class="section-label">Aircraft</div>
          <div class="page-nav-tabs" id="sc-aircraft-filter" role="group" aria-label="Filter by aircraft"></div>
        </div>
        ${analyticsTotalsMarkup()}
      </div>
    </aside>
    <div class="analytics-map-wrapper">
      ${analyticsViewTabsMarkup()}
      <div class="view-body">
        <div id="analytics-map"></div>
        ${analyticsLayerControlsMarkup()}
        ${sharedMapControlsMarkup()}
        ${streamgraphMarkup()}
      </div>
    </div>
  </div>`,
  };
}
