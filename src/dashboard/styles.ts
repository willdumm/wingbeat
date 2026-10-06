import { sharedMapControlsStyles, tileOverlayLegendStyles } from '../shared/map-controls';
import { sharedSidebarToggleStyles } from '../shared/sidebar';
import { settingsModalStyles } from '../shared/settings';
import { filterStyles } from '../shared/filters';
import { pilotDutyStyles } from '../shared/pilot-duty';
import { aircraftInfoStyles } from '../shared/aircraft-info';
import { sharedButtonStyles } from '../shared/buttons';
import { elevationToolStyles } from '../shared/elevation';

export function dashboardStyles(): string {
  return `
    ${sharedButtonStyles()}

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    input, select, textarea { font-size: 16px !important; }

    html {
      height: 100%;
      overflow: hidden;
    }

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

    header {
      background: var(--surface-1);
      border-bottom: 1px solid var(--border-structural);
      padding: 0.4rem 0.75rem 0.4rem 1.25rem;
      padding-top: calc(0.4rem + constant(safe-area-inset-top, 0px));
      padding-top: calc(0.4rem + env(safe-area-inset-top, 0px));
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-shrink: 0;
      position: relative;
      z-index: 1001;
      min-height: 0;
      box-shadow: var(--shadow-sm);
    }

    header .wb-logo {
      flex-shrink: 0;
    }

    /* ── Pull-to-refresh indicator (mobile only) ────────────────────────── */
    #ptr-indicator {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 44px;
      background: var(--surface-1);
      border-bottom: 1px solid var(--border-structural);
      display: none;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 0.8rem;
      color: var(--text-muted);
      z-index: 0;
      pointer-events: none;
      user-select: none;
    }

    @media (max-width: 640px) {
      #ptr-indicator { display: flex; }
    }

    /* ── PTR content wrapper: slides down to reveal #ptr-indicator ───────── */
    #ptr-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
      position: relative;
      z-index: 1;
    }

    #ptr-icon {
      font-size: 1.1rem;
      display: inline-block;
    }

    #ptr-icon.ptr-spin {
      animation: spin 0.8s linear infinite;
    }

    /* ── Aircraft status bar ─────────────────────────────────────────────── */
    #aircraft-status-bar {
      flex: 1;
      min-width: 0;
      overflow-x: auto;
      touch-action: pan-x;
    }

    #aircraft-cards {
      display: flex;
      gap: 0.5rem;
      padding: 0.25rem 0.5rem;
      justify-content: center;
    }

    /* A card is a wrapping row: tail+status, gps, metrics, location. Its width, set by
       layoutAircraftCards(), decides where the items break into lines. */
    .aircraft-card {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      align-content: center;
      gap: 2px 8px;
      flex: none;
      padding: 5px 9px;
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--bg-base);
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }

    .aircraft-card:hover { background: var(--surface-hover); }
    .aircraft-card.in-flight { border-color: var(--live-dot); }

    .ac-row1 { display: flex; align-items: center; gap: 6px; }
    .ac-row2 { display: contents; }

    .ac-card-tail {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-primary);
      white-space: nowrap;
    }

    .ac-card-status { font-size: 0.72rem; display: flex; align-items: center; gap: 4px; white-space: nowrap; }
    .ac-card-gps { font-size: 0.68rem; color: var(--text-faint); display: flex; align-items: center; gap: 4px; white-space: nowrap; }
    .ac-card-metrics { font-size: 0.68rem; color: var(--text-muted); white-space: nowrap; }
    /* Only a card narrower than its location (the phone carousel) ellipsizes it. */
    .ac-card-location {
      font-size: 0.68rem;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      max-width: 100%;
    }

    /* Ticker tape */
    #aircraft-status-bar.ticker-active { overflow: hidden; }
    #aircraft-status-bar.ticker-active #aircraft-cards { justify-content: flex-start; }

    #aircraft-cards.ticker-animate {
      animation: ac-ticker linear infinite;
      will-change: transform;
    }

    @keyframes ac-ticker {
      from { transform: translateX(0); }
      to   { transform: translateX(var(--ac-ticker-offset, 0px)); }
    }

    /* Mobile card: full bar width, lines centred; margin-right is the inter-card gap */
    .aircraft-card.mobile-card { justify-content: center; }

    /* Mobile horizontal carousel */
    #aircraft-status-bar.vcarousel-active { overflow: hidden; }
    #aircraft-status-bar.vcarousel-active #aircraft-cards { justify-content: flex-start; gap: 0; padding: 0; }

    #aircraft-cards.vcarousel-animate {
      flex-wrap: nowrap;
      animation: ac-vcarousel linear infinite;
      will-change: transform;
    }

    @keyframes ac-vcarousel {
      from { transform: translateX(0); }
      to   { transform: translateX(var(--ac-vcarousel-offset, 0px)); }
    }

    /* ── Refresh button (right of header) ────────────────────────────────── */
    #refresh-control { flex-shrink: 0; }

    #refresh-btn {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      background: none;
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-muted);
      line-height: 1;
      cursor: pointer;
      padding: 0.25rem 0.6rem;
      white-space: nowrap;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }

    #refresh-btn:hover {
      background: var(--surface-hover);
      color: var(--text-secondary);
      border-color: var(--border-strong);
    }
    #refresh-btn:disabled { cursor: not-allowed; opacity: 0.6; }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    #refresh-icon {
      font-size: 1.0rem;
      display: inline-block;
    }

    #refresh-btn.refreshing #refresh-icon {
      animation: spin 0.8s linear infinite;
    }

    #refresh-time {
      font-size: 0.68rem;
      color: var(--text-faint);
    }

    @media (max-width: 540px) {
      header .wb-logo__word { display: none; }
    }

    @media (max-width: 640px) {
      #refresh-control { display: none; }
    }

    .main {
      display: flex;
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    aside {
      width: 320px;
      flex-shrink: 0;
      background: var(--surface-1);
      border-right: 1px solid var(--border-structural);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: var(--shadow-right);
    }

    .aside-toolbar {
      border-bottom: 1px solid var(--border-structural);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    @media (max-width: 640px) {
      .aside-toolbar { display: none; }
      /* mobile-topnav handles safe-area-inset-top above the header */
      header { padding: 0.15rem 0.5rem; }
      #aircraft-cards { padding: 0.1rem 0.5rem; }
    }

    #show-recent-row {
      padding: 0.4rem 0.75rem;
      border-bottom: 1px solid var(--border-structural);
      flex-shrink: 0;
    }

    /* Visual props from .btn-secondary on this element */
    #show-recent-btn {
      width: 100%;
      padding: 0.4rem 0.6rem;
      font-size: 0.82rem;
      font-weight: 600;
    }

    #flight-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem 0;
    }

    ${filterStyles()}


    .flight-item {
      padding: 0.65rem 0.9rem;
      cursor: pointer;
      border-left: 3px solid transparent;
      transition: background 0.15s, border-color 0.15s;
    }

    .flight-item:hover { background: var(--surface-hover); }

    .flight-item.active {
      background: var(--accent-surface);
      border-left-color: var(--accent-text);
    }

    .flight-date {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .flight-item-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .flight-item-header .flight-date { flex: 1; }

    .flight-route {
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-top: 0.15rem;
    }

    .flight-assign {
      font-size: 0.72rem;
      color: var(--text-faint);
      margin-top: 0.1rem;
    }

    .assignment-modal {
      position: fixed;
      inset: 0;
      z-index: 3000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .assignment-modal-backdrop {
      position: absolute;
      inset: 0;
      background: var(--scrim);
    }

    .assignment-modal-panel {
      position: relative;
      background: var(--surface-1);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-lg);
      width: min(340px, calc(100vw - 2rem));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    }

    .assignment-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
    }

    .assignment-modal-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .assignment-modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.3rem;
      line-height: 1;
      cursor: pointer;
      padding: 0.1rem 0.3rem;
      border-radius: var(--radius-md);
      transition: color 0.15s;
    }

    .assignment-modal-close:hover { color: var(--text-secondary); }

    .assignment-modal-body {
      padding: 0.85rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }

    .assignment-modal-empty {
      font-size: 0.82rem;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .assignment-field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .assignment-field label {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }

    .assignment-field select {
      padding: 0.4rem 0.5rem;
      background: var(--input-bg);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: 0.875rem;
      width: 100%;
    }

    .assignment-modal-footer {
      padding: 0.65rem 1rem;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    /* Visual props from .btn-primary / .btn-secondary on these elements */
    .assignment-save-btn { padding: 0.45rem 1rem; font-size: 0.85rem; min-height: 2.25rem; }
    .assignment-cancel-btn { padding: 0.45rem 0.85rem; font-size: 0.85rem; min-height: 2.25rem; }

    .flight-meta {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 0.2rem;
      display: flex;
      gap: 0.6rem;
    }

    .flight-meta span { display: flex; align-items: center; gap: 0.25rem; }

    .flight-day-heading {
      padding: 0.55rem 0.75rem 0.55rem 0.65rem;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-structural);
      background: var(--surface-0);
      display: flex;
      align-items: center;
      gap: 0.4rem;
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }

    .flight-day-heading:hover { background: var(--surface-hover); }

    /* .chevron styling comes from sharedButtonStyles() */

    .day-label { flex: 1; }

    .day-count {
      font-size: 0.7rem;
      font-weight: 400;
      color: var(--text-muted);
      flex-shrink: 0;
    }

    /* Visual props from .btn-secondary on this element */
    .day-view-btn {
      margin-left: 0.4rem;
      flex-shrink: 0;
      font-size: 0.68rem;
      padding: 0.2rem 0.5rem;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    #empty-msg {
      text-align: center;
      color: var(--text-faint);
      padding: 2rem 1rem;
      font-size: 0.875rem;
    }

    #map {
      position: absolute;
      inset: 0;
      background: #e8e4de;
    }

    .leaflet-container { background: #e8e4de; }

    #loading-overlay {
      position: absolute;
      inset: 0;
      background: var(--overlay);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.9rem;
      color: var(--accent-text);
      pointer-events: none;
      z-index: 1000;
    }

    #loading-overlay.hidden { display: none; }

    /* ── Day view aircraft legend ────────────────────────────────────────── */
    .day-view-legend {
      position: absolute;
      top: 10px;
      right: 10px;
      background: var(--surface-float);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      padding: 6px 10px;
      z-index: 500;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 4px;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }

    .dv-legend-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .dv-legend-swatch {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
      border: 1px solid rgba(128,128,128,0.3);
    }

    .dv-legend-label {
      font-size: 0.75rem;
      color: var(--text-primary);
      white-space: nowrap;
    }

    .map-wrapper {
      position: relative;
      flex: 1;
    }

    ${sharedSidebarToggleStyles('aside', '.map-wrapper')}

    ${sharedMapControlsStyles()}

    ${tileOverlayLegendStyles()}

    ${elevationToolStyles()}

    /* ── Shared info popup (location + point picker) ────────────────────── */
    .info-popup {
      position: fixed;
      inset: 0;
      z-index: 3000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .info-popup.hidden { display: none; }

    .info-popup-backdrop {
      position: absolute;
      inset: 0;
      background: var(--scrim);
    }

    .info-popup-content {
      position: relative;
      background: var(--surface-1);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.1rem 1.25rem 1.25rem;
      min-width: 270px;
      max-width: 360px;
      width: 90vw;
      z-index: 1;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    }

    .info-popup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .info-popup-title {
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-secondary);
    }

    .info-popup-close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.25rem;
      line-height: 1;
      cursor: pointer;
      padding: 0.1rem 0.3rem;
      border-radius: var(--radius-md);
      transition: background 0.15s, color 0.15s;
    }

    .info-popup-close:hover { background: var(--surface-hover); color: var(--text-primary); }

    .info-popup-coords-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      background: var(--surface-0);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.55rem 0.75rem;
      margin-bottom: 0.85rem;
    }

    .info-popup-latlng {
      flex: 1;
      font-size: 0.9rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: var(--text-primary);
      letter-spacing: 0.02em;
    }

    .info-popup-copy {
      background: var(--surface-2);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      font-size: 0.75rem;
      cursor: pointer;
      padding: 0.3rem 0.6rem;
      flex-shrink: 0;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }

    .info-popup-copy:hover {
      background: var(--surface-hover);
      color: var(--text-primary);
      border-color: var(--border-strong);
    }
    .info-popup-copy.copied { color: var(--success-fg); border-color: var(--success-fg); }

    .info-popup-details {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.3rem 0.85rem;
      margin-bottom: 0.85rem;
      font-size: 0.85rem;
    }

    .info-popup-details:empty { display: none; margin-bottom: 0; }

    .info-popup-links {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .info-popup-links a {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.55rem 0.75rem;
      background: var(--surface-0);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--accent-text);
      text-decoration: none;
      font-size: 0.875rem;
      transition: background 0.15s, border-color 0.15s;
    }

    .info-popup-links a:hover {
      background: var(--accent-surface);
      border-color: var(--accent);
    }

    .info-popup-link-row {
      display: flex;
      align-items: stretch;
      background: var(--surface-0);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
      transition: border-color 0.15s;
    }

    .info-popup-link-row:hover { border-color: var(--accent); }

    .info-popup-link-row a {
      flex: 1;
      background: none;
      border: none;
      border-radius: 0;
      transition: background 0.15s;
    }

    .info-popup-link-row a:hover { background: var(--accent-surface); }

    .info-popup-link-row .info-popup-copy {
      margin: auto 0.5rem;
    }

    .popup-detail-label {
      color: var(--text-muted);
      text-align: right;
      white-space: nowrap;
    }

    .popup-detail-value {
      color: var(--text-primary);
    }

    .flight-dur {
      font-weight: 400;
      color: var(--text-muted);
    }

    .info-popup-title-group {
      display: flex;
      align-items: baseline;
      gap: 0.35rem;
    }

    .point-picker-route-status {
      font-size: 0.7rem;
      font-weight: 400;
      text-transform: none;
      letter-spacing: normal;
      color: var(--text-muted);
    }

    /* ── Point picker button ────────────────────────────────────────────── */
    #point-picker-btn {
      padding: 0.45rem 0.65rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* ── Bulk edit modal ────────────────────────────────────────────────── */
    .bulk-edit-modal {
      position: fixed;
      inset: 0;
      z-index: 3000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: var(--scrim);
    }

    .be-panel {
      background: var(--surface-1);
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 580px;
      max-height: min(90vh, 860px);
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-lg);
    }

    @media (max-width: 640px) {
      .bulk-edit-modal { padding: 0; align-items: stretch; }
      .be-panel { max-width: none; max-height: none; border-radius: 0; flex: 1; }
    }

    .be-sticky-top {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--surface-1);
    }

    .be-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--border);
    }

    .be-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .be-close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.3rem;
      line-height: 1;
      cursor: pointer;
      padding: 0.1rem 0.3rem;
      border-radius: var(--radius-md);
      transition: color 0.15s;
    }

    .be-close:hover { color: var(--text-secondary); }

    .be-filters {
      padding: 0.65rem 1rem 0.55rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .be-filter-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(10rem, 100%), 1fr));
      gap: 0.5rem;
    }

    .be-field {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .be-field label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .be-field input[type="date"],
    .be-field select {
      -webkit-appearance: none;
      appearance: none;
      padding: 0.35rem 0.5rem;
      min-height: 2.1rem;
      background: var(--input-bg);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: 0.82rem;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }

    .be-list-header {
      padding: 0.4rem 0.85rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .be-select-all-wrap {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      cursor: pointer;
      font-size: 0.82rem;
      color: var(--text-secondary);
      user-select: none;
    }

    .be-count-label {
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    .be-flight-list {
      padding: 0.25rem 0;
    }

    .be-flight-row {
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      padding: 0.45rem 0.85rem;
      cursor: pointer;
      transition: background 0.1s;
    }

    .be-flight-row:hover { background: var(--surface-hover); }

    .be-flight-check {
      flex-shrink: 0;
      margin-top: 0.15rem;
      cursor: pointer;
    }

    .be-flight-info {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      min-width: 0;
    }

    .be-flight-date {
      font-size: 0.85rem;
      color: var(--text-primary);
    }

    .be-flight-assign {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .be-empty-msg {
      padding: 1.5rem 1rem;
      text-align: center;
      font-size: 0.85rem;
      color: var(--text-faint);
    }

    .be-apply-section {
      position: sticky;
      bottom: 0;
      background: var(--surface-1);
      border-top: 1px solid var(--border);
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .be-apply-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .be-apply-fields {
      display: flex;
      gap: 0.5rem;
    }

    .be-apply-actions {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    /* Visual props from .btn-primary / .btn-secondary on these elements */
    .be-apply-btn { padding: 0.45rem 1rem; font-size: 0.85rem; min-height: 2.25rem; }
    .be-cancel-btn { padding: 0.45rem 0.85rem; font-size: 0.85rem; min-height: 2.25rem; }

    /* ── Bulk edit — custom checkbox styling ────────────────────────────── */
    input[type="checkbox"].be-flight-check,
    .be-list-header input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      width: 16px; height: 16px;
      border: 1.5px solid var(--border-strong);
      border-radius: 4px;
      background: var(--input-bg);
      cursor: pointer;
      flex-shrink: 0;
      position: relative;
      transition: background 0.1s, border-color 0.1s;
    }
    input[type="checkbox"].be-flight-check:checked,
    .be-list-header input[type="checkbox"]:checked {
      background: var(--accent);
      border-color: var(--accent);
    }
    input[type="checkbox"].be-flight-check:checked::after,
    .be-list-header input[type="checkbox"]:checked::after {
      content: '';
      position: absolute;
      left: 4px; top: 1px;
      width: 5px; height: 9px;
      border: 2px solid #fff;
      border-top: none; border-left: none;
      transform: rotate(45deg);
    }
    input[type="checkbox"].be-flight-check:focus-visible,
    .be-list-header input[type="checkbox"]:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    /* ── Alerts strip ───────────────────────────────────────────────────── */
    .alerts-strip {
      flex-shrink: 0;
      border-bottom: 1px solid var(--border-structural);
    }
    .alerts-strip.hidden { display: none; }

    .alerts-strip-bar {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.45rem 0.75rem;
      cursor: pointer;
      user-select: none;
      font-size: 0.8rem;
      color: var(--text-primary);
      transition: background 0.15s;
    }
    .alerts-strip-bar:hover { background: var(--surface-hover); }

    .alerts-imm  { color: var(--danger-fg); font-weight: 600; }
    .alerts-soon { color: var(--warning-fg); }
    /* .alerts-chevron now uses .chevron class — styling from sharedButtonStyles() */

    .alerts-list {
      overflow-y: auto;
      max-height: 40vh;
    }
    .alerts-list.hidden { display: none; }

    .alert-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.75rem 0.4rem 0.55rem;
      border-left: 3px solid transparent;
      border-bottom: 1px solid var(--border-structural);
      font-size: 0.8rem;
    }
    .alert-row:last-of-type { border-bottom: none; }
    .alert-row.immediate { border-left-color: var(--danger-fg); }
    .alert-row.due_soon  { border-left-color: var(--warning-fg); }

    .alert-icon {
      flex-shrink: 0;
      width: 1rem;
      text-align: center;
      font-size: 0.82rem;
    }

    .alert-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .alert-text {
      color: var(--text-primary);
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .alert-desc {
      font-size: 0.72rem;
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .alert-row-clickable { cursor: pointer; }
    .alert-row-clickable:hover { background: var(--surface-hover); }

    /* Visual props from .btn-secondary on this element */
    .alert-action-btn { flex-shrink: 0; font-size: 0.72rem; padding: 0.18rem 0.45rem; white-space: nowrap; }



    ${settingsModalStyles()}

    ${pilotDutyStyles()}

    ${aircraftInfoStyles()}
  `;
}
