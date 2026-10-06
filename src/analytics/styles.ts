import { sharedMapControlsStyles, tileOverlayLegendStyles } from '../shared/map-controls';
import { sharedSidebarToggleStyles } from '../shared/sidebar';
import { settingsModalStyles } from '../shared/settings';
import { filterStyles } from '../shared/filters';
import { pilotDutyStyles } from '../shared/pilot-duty';
import { aircraftInfoStyles } from '../shared/aircraft-info';
import { sharedButtonStyles } from '../shared/buttons';

export function analyticsStyles(): string {
  return `
    ${sharedButtonStyles()}

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    input, select, textarea { font-size: 16px !important; }

    html { height: 100%; overflow: hidden; }

    h1, h2, h3, h4 { font-family: var(--font-display); letter-spacing: var(--tracking-heading); }

    body {
      font-family: var(--font-body);
      background: var(--bg-base);
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
      height: 100vh;
      height: 100svh;
      overflow: hidden;
      padding-bottom: constant(safe-area-inset-bottom, 0px);
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }

    /* ── Header ─────────────────────────────────────────────────────────────── */
    .analytics-header {
      background: var(--surface-1);
      border-bottom: 1px solid var(--border-structural);
      padding: 0.75rem 1.25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-shrink: 0;
      z-index: 100;
      box-shadow: var(--shadow-sm);
    }

    .analytics-header-sep {
      width: 1px;
      align-self: stretch;
      background: var(--border);
    }

    .analytics-header-title {
      font-family: var(--font-display);
      font-size: 1.0rem;
      font-weight: var(--weight-semibold);
      letter-spacing: var(--tracking-heading);
      color: var(--text-secondary);
      white-space: nowrap;
    }

    @media (max-width: 540px) {
      .analytics-header .wb-logo__word,
      .analytics-header-sep { display: none; }
    }

    /* ── Two-column layout ───────────────────────────────────────────────────── */
    .analytics-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    .analytics-panel {
      width: 320px;
      flex-shrink: 0;
      background: var(--surface-1);
      border-right: 1px solid var(--border-structural);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: var(--shadow-right);
    }

    .analytics-panel-content {
      flex: 1;
      overflow-y: auto;
    }

    .analytics-panel-footer {
      flex-shrink: 0;
    }

    .analytics-map-wrapper {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }

    /* ── View tabs (Map / Stream Graph) ─────────────────────────────────────── */
    #view-tabs {
      display: flex;
      justify-content: center;
      flex-shrink: 0;
      background: var(--surface-1);
      border-bottom: 1px solid var(--border-structural);
    }

    .view-tab {
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-faint);
      font-size: 0.82rem;
      font-weight: 600;
      padding: 0.5rem 1rem;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      line-height: 1;
    }

    .view-tab:hover { color: var(--text-secondary); }

    .view-tab.active {
      color: var(--accent-text);
      border-bottom-color: var(--accent-text);
    }

    /* ── View body (contains both map and stream graph) ──────────────────────── */
    .view-body {
      position: relative;
      flex: 1;
      overflow: hidden;
    }

    /* ── Analytics panel toolbar ─────────────────────────────────────────────── */
    .panel-toolbar {
      border-bottom: 1px solid var(--border-structural);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    @media (max-width: 640px) {
      .panel-toolbar { display: none; }
      .analytics-header { display: none; }
    }

    /* ── Left panel sections ─────────────────────────────────────────────────── */
    .panel-section {
      border-bottom: 1px solid var(--border-structural);
      padding: 0.75rem;
    }

    .section-label {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      margin-bottom: 0.6rem;
      display: flex;
      align-items: center;
    }

    /* ── Accounting table ────────────────────────────────────────────────────── */
    .panel-accounting { flex: 1; }

    .month-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.55rem 0.6rem;
      cursor: pointer;
      border-left: 3px solid transparent;
      transition: background 0.15s, border-color 0.15s;
      font-size: 0.875rem;
    }

    .month-row:hover { background: var(--surface-hover); }

    .month-row.selected {
      background: var(--accent-surface);
      border-left-color: var(--accent);
    }

    /* .month-chevron now uses .chevron class — styling from sharedButtonStyles() */

    .month-label { flex: 1; min-width: 0; font-weight: 600; color: var(--text-primary); }

    .month-hours { flex-shrink: 0; color: var(--text-secondary); font-size: 0.82rem; }

    .month-stops { flex-shrink: 0; color: var(--text-faint); font-size: 0.78rem; min-width: 1.5rem; text-align: right; }

    .region-row {
      display: flex;
      align-items: center;
      padding: 0.3rem 0.6rem 0.3rem 2rem;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .region-name { flex: 1; min-width: 0; }
    .region-hours { flex-shrink: 0; color: var(--text-muted); display: flex; align-items: center; gap: 0.4rem; }
    .region-stops { flex-shrink: 0; color: var(--text-muted); display: flex; align-items: center; gap: 0.4rem; min-width: 4rem; justify-content: flex-end; }
    .region-pct { color: var(--text-faint); font-size: 0.75rem; min-width: 2.2rem; text-align: right; }

    .totals-total {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.6rem 0.3rem;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-primary);
      border-bottom: 1px solid var(--border-structural);
      margin-bottom: 0.25rem;
    }

    .totals-total span:first-child { flex: 1; }
    .totals-stops { color: var(--text-muted); min-width: 4rem; text-align: right; }

    .empty-msg {
      text-align: center;
      color: var(--text-faint);
      padding: 1.5rem 1rem;
      font-size: 0.875rem;
    }

    ${filterStyles()}

    /* ── Map ─────────────────────────────────────────────────────────────────── */
    #analytics-map {
      position: absolute;
      inset: 0;
      background: #e8e4de;
    }

    .leaflet-container { background: #e8e4de; }

    #analytics-loading {
      position: absolute;
      inset: 0;
      background: var(--overlay);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.9rem;
      color: var(--accent-text);
      pointer-events: none;
      z-index: 600;
    }

    #analytics-loading.hidden { display: none; }

    #analytics-notice {
      position: absolute;
      top: 0.75rem;
      left: 50%;
      transform: translateX(-50%);
      background: var(--surface-float);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.45rem 0.85rem;
      font-size: 0.8rem;
      color: var(--text-secondary);
      z-index: 500;
      max-width: 380px;
      text-align: center;
      pointer-events: none;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }

    /* ── Layer toggle controls ───────────────────────────────────────────────── */
    #layer-controls {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      background: var(--surface-float);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.6rem 0.75rem;
      z-index: 500;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      min-width: 160px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.10);
    }

    .layer-controls-label {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
    }

    .legend-toggle {
      margin-left: auto;
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .legend-toggle:hover .chevron { color: var(--text-secondary); }

    #layer-controls.collapsed .layer-item,
    #layer-controls.collapsed #heat-weight-toggle { display: none; }

    #layer-controls.collapsed { min-width: 0; padding-bottom: 0.35rem; }

    .layer-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.78rem;
      color: var(--text-faint);
      cursor: pointer;
      padding: 0.2rem 0;
      user-select: none;
      transition: color 0.15s, opacity 0.15s;
      opacity: 0.5;
    }

    .layer-item.active { color: var(--text-secondary); opacity: 1; }

    /* ── Heatmap weight toggle ────────────────────────────────────────────────── */
    #heat-weight-toggle {
      display: flex;
      gap: 0.25rem;
      padding: 0.3rem 0 0.15rem 1.6rem;
    }

    .heat-weight-btn {
      background: none;
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-faint);
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      cursor: pointer;
      padding: 0.2rem 0.5rem;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }

    .heat-weight-btn.active {
      background: var(--accent-surface);
      color: var(--accent-text);
      border-color: var(--accent-text);
    }

    .heat-weight-btn:not(.active):hover {
      background: var(--surface-hover);
      color: var(--text-secondary);
    }

    .layer-swatch {
      flex-shrink: 0;
      width: 22px;
      height: 8px;
      border-radius: 2px;
    }

    .swatch-heat    { background: linear-gradient(to right, #9a3412, #ea580c, #fde68a); }
    .swatch-density { background: linear-gradient(to right, #164e63, #0891b2, #a5f3fc); }

    .swatch-lines {
      height: 2px;
      margin: 3px 0;
      background: var(--accent-text);
      border-radius: 1px;
    }

    .swatch-bounds {
      height: 8px;
      background: transparent;
      border: 1.5px solid var(--accent);
      border-radius: 2px;
    }

    /* ── Info button ─────────────────────────────────────────────────────────── */
    .info-btn {
      margin-left: auto;
      flex-shrink: 0;
      background: none;
      border: none;
      color: var(--text-faint);
      font-size: 0.85rem;
      line-height: 1;
      cursor: pointer;
      padding: 0 0.1rem;
      transition: color 0.15s;
    }

    .info-btn:hover { color: var(--text-secondary); }

    .info-btn-sm {
      font-size: 0.75rem;
      margin-left: auto;
    }

    /* ── Attribution popup ───────────────────────────────────────────────────── */
    #info-popup-overlay {
      position: fixed;
      inset: 0;
      background: var(--scrim);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    #info-popup-card {
      position: relative;
      background: var(--surface-1);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem 1.4rem 1.4rem;
      max-width: 380px;
      width: calc(100vw - 3rem);
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    }

    #info-popup-close {
      position: absolute;
      top: 0.6rem;
      right: 0.75rem;
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.2rem;
      line-height: 1;
      cursor: pointer;
      padding: 0.1rem 0.3rem;
      border-radius: var(--radius-md);
      transition: color 0.15s;
    }

    #info-popup-close:hover { color: var(--text-primary); }

    .info-popup-title {
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      margin-bottom: 0.85rem;
    }

    .info-popup-body {
      font-size: 0.85rem;
      color: var(--text-secondary);
      line-height: 1.55;
    }

    .info-popup-body p { margin-bottom: 0.75rem; }

    .info-popup-body ul {
      list-style: none;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }

    .info-popup-body li {
      padding-left: 1rem;
      position: relative;
    }

    .info-popup-body li::before {
      content: "–";
      position: absolute;
      left: 0;
      color: var(--text-faint);
    }

    .info-popup-body strong { color: var(--text-primary); font-weight: 600; }

    /* ── Stream graph ────────────────────────────────────────────────────────── */
    #streamgraph-container {
      position: absolute;
      inset: 0;
      display: none;
      flex-direction: column;
      background: var(--bg-base);
      z-index: 510;
    }

    #streamgraph-toolbar {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.4rem 0.75rem;
      background: var(--surface-1);
      border-top: 1px solid var(--border);
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .sg-ctrl-group {
      display: flex;
      align-items: center;
      gap: 0.2rem;
    }

    .sg-ctrl-label {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-faint);
      margin-right: 0.1rem;
      white-space: nowrap;
    }

    .sg-ctrl-sep {
      width: 1px;
      height: 18px;
      background: var(--border);
      margin: 0 0.2rem;
      flex-shrink: 0;
    }

    .sg-toggle {
      background: none;
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-faint);
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      cursor: pointer;
      padding: 0.2rem 0.5rem;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
      white-space: nowrap;
      line-height: 1.4;
    }

    .sg-toggle.active {
      background: var(--accent-surface);
      color: var(--accent-text);
      border-color: var(--accent-text);
    }

    .sg-toggle:not(.active):hover {
      background: var(--surface-hover);
      color: var(--text-secondary);
    }

    #streamgraph-chart {
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    .sg-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-faint);
      font-size: 0.875rem;
    }

    #sg-tooltip {
      background: var(--surface-float);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.45rem 0.6rem;
      font-size: 0.78rem;
      color: var(--text-secondary);
      z-index: 10;
      min-width: 120px;
      max-width: 180px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }

    .sg-tt-header {
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 0.3rem;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .sg-tt-row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.1rem 0;
    }

    .sg-tt-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .sg-tt-name { flex: 1; color: var(--text-muted); }

    .sg-tt-val { color: var(--text-secondary); font-weight: 600; }

    ${sharedSidebarToggleStyles('.analytics-panel', '.analytics-map-wrapper')}

    ${sharedMapControlsStyles()}

    ${tileOverlayLegendStyles()}

    ${settingsModalStyles()}

    ${pilotDutyStyles()}

    ${aircraftInfoStyles()}
  `;
}
