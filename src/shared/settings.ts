import { namedPointsEditorMarkup, namedPointsEditorScript } from './named-points-editor';
import { regionsEditorMarkup, regionsEditorScript } from './regions-editor';
import { mapLayersSettingsRowsMarkup, mapLayersSettingsScript } from './map-controls';
import { icon } from './icons';
import { pilotDutyMarkup, typstLoadOverlayMarkup } from './pilot-duty';
import { aircraftInfoMarkup } from './aircraft-info';
import { mapViewPickerMarkup, mapViewPickerStyles, mapViewPickerScript } from './map-view-picker';
import { setupGuideMarkup, setupGuideAdminRowMarkup, setupGuideStyles, setupGuideScript } from './setup-guide';

/**
 * Settings modal — shared between dashboard and analytics pages.
 *
 * Each page includes settingsModalMarkup() in its HTML, settingsModalStyles()
 * in its <style>, and settingsModalScript() inside its IIFE.
 *
 * The modal references these page-level variables (must be declared in scope):
 *   trackerList  — Array of tracker objects from /api/trackers
 *   flightStore  — The active per-tracker store instance
 *
 * Pages define two override hooks before the modal is opened:
 *   settingsAfterTrackerChange() — e.g. refresh the tracker <select>
 *   settingsOnClearCache(result) — e.g. re-render the flight list
 */

export function settingsModalMarkup(): string {
  return `
  <div id="settings-modal" class="settings-modal hidden" role="dialog" aria-modal="true">
    <div class="settings-modal-backdrop" id="settings-modal-backdrop"></div>
    <div class="settings-modal-panel">
      <div class="settings-nav">
        <button id="settings-nav-back" class="settings-nav-back hidden" aria-label="Back">${icon('chevron-left', { size: 14 })} Back</button>
        <span id="settings-nav-title" class="settings-modal-title">Settings</span>
        <button id="settings-modal-close" class="settings-modal-close" aria-label="Close">${icon('x', { size: 18 })}</button>
      </div>
      <div class="settings-views">
        <div class="settings-view" id="settings-view-main">
          <div class="settings-modal-body">
            ${setupGuideMarkup()}
            <div class="settings-section">
              <div class="settings-section-label">Aircraft</div>
              <div id="settings-aircraft-list"></div>
              <details id="settings-add-aircraft" class="settings-add-tracker">
                <summary>Add aircraft</summary>
                <div class="settings-add-inner">
                  <input type="text" id="settings-add-aircraft-tail" placeholder="Tail number (e.g. N12345)" autocomplete="off" />
                  <input type="text" id="settings-add-aircraft-name" placeholder="Display name (optional)" autocomplete="off" />
                  <div class="settings-add-actions">
                    <button id="settings-add-aircraft-submit" class="btn-primary">Add</button>
                    <button id="settings-add-aircraft-cancel" class="btn-secondary">Cancel</button>
                  </div>
                </div>
              </details>
            </div>
            <div class="settings-section">
              <div class="settings-section-label">Pilots</div>
              <div id="settings-pilots-list"></div>
              <details id="settings-add-pilot" class="settings-add-tracker">
                <summary>Add pilot</summary>
                <div class="settings-add-inner">
                  <input type="text" id="settings-add-pilot-name" placeholder="Pilot name" autocomplete="off" />
                  <div class="settings-add-actions">
                    <button id="settings-add-pilot-submit" class="btn-primary">Add</button>
                    <button id="settings-add-pilot-cancel" class="btn-secondary">Cancel</button>
                  </div>
                </div>
              </details>
            </div>
            <div class="settings-section" data-doc-shot="settings.add-tracker-dialog">
              <div class="settings-section-label">Trackers</div>
              <p class="settings-section-desc">Tip: add any active aircraft and pilots before adding trackers, so new flights are automatically assigned.</p>
              <div id="settings-tracker-list"></div>
              <details id="settings-add-tracker" class="settings-add-tracker">
                <summary>Add tracker</summary>
                <div class="settings-add-inner">
                  <div>
                    <div class="settings-form-label">Display name</div>
                    <input type="text" id="settings-add-name" autocomplete="off" />
                  </div>
                  <div>
                    <div class="settings-form-label">Tracker type</div>
                    <div class="settings-tracker-type-row">
                      <select id="settings-add-type">
                        <option value="inreach">InReach</option>
                      </select>
                      <button type="button" id="settings-add-type-help" class="settings-type-help-btn" aria-label="How to get this URL">?</button>
                    </div>
                  </div>
                  <div id="settings-add-tracker-instructions" class="tracker-instructions"></div>
                  <div>
                    <div class="settings-form-label">MapShare URL</div>
                    <input type="text" id="settings-add-source-url" autocomplete="off" />
                  </div>
                  <div id="settings-add-tracker-credentials"></div>
                  <div id="settings-add-tracker-assignments"></div>
                  <p id="settings-add-test-status" class="settings-msg" aria-live="polite"></p>
                  <div class="settings-add-actions">
                    <button id="settings-add-submit" class="btn-primary">Add</button>
                    <button id="settings-add-test" class="btn-secondary">Test feed</button>
                    <button id="settings-add-cancel" class="btn-secondary">Cancel</button>
                  </div>
                </div>
              </details>
            </div>
            <div class="settings-section">
              <div class="settings-section-label">Appearance</div>
              <div class="settings-row">
                <span class="settings-row-title">Theme</span>
                <div class="settings-theme-row" id="settings-theme-row">
                  <button class="settings-theme-btn" data-theme-val="light">Light</button>
                  <button class="settings-theme-btn" data-theme-val="dark">Dark</button>
                  <button class="settings-theme-btn" data-theme-val="system">System</button>
                </div>
              </div>
            </div>
            <div class="settings-section">
              <div class="settings-section-label">Map layers</div>
              ${mapLayersSettingsRowsMarkup()}
            </div>
            <div class="settings-section">
              <div class="settings-section-label">Overlays</div>
              <p class="settings-section-desc">Extra tile layers (e.g. a sectional chart or custom imagery) shown on top of the basemap. Listed for everyone in the map's overlay legend; each has a default on/off state a viewer can override there.</p>
              <div id="settings-overlay-list"></div>
              <details id="settings-add-overlay" class="settings-add-tracker">
                <summary>Add overlay</summary>
                <div class="settings-add-inner">
                  <input type="text" id="settings-add-overlay-label" placeholder="Label (e.g. Sectional chart)" autocomplete="off" />
                  <input type="text" id="settings-add-overlay-url" placeholder="Tile URL, e.g. https://example.com/{z}/{x}/{y}.png" autocomplete="off" />
                  <input type="text" id="settings-add-overlay-attribution" placeholder="Attribution (optional)" autocomplete="off" />
                  <input type="number" id="settings-add-overlay-maxzoom" placeholder="Max native zoom (optional)" min="1" max="22" step="1" autocomplete="off" />
                  <label><input type="checkbox" id="settings-add-overlay-default" /> On by default (fallback for basemaps not set below)</label>
                  <div class="settings-form-label">Default per basemap (optional)</div>
                  <div id="settings-add-overlay-basemap-defaults" class="settings-basemap-defaults"></div>
                  <p id="settings-add-overlay-lookup-status" class="settings-msg" aria-live="polite"></p>
                  <div class="settings-add-actions">
                    <button id="settings-add-overlay-submit" class="btn-primary">Add</button>
                    <button id="settings-add-overlay-lookup" class="btn-secondary">Look up details</button>
                    <button id="settings-add-overlay-cancel" class="btn-secondary">Cancel</button>
                  </div>
                </div>
              </details>
            </div>
            <div class="settings-section">
              <div class="settings-section-label">Data</div>
              <div class="settings-row">
                <div class="settings-row-info">
                  <div class="settings-row-title">Clear local cache</div>
                  <div class="settings-row-desc">Re-downloads all flight data from the server.</div>
                </div>
                <button id="settings-clear-cache" class="settings-danger-btn">Clear</button>
              </div>
            </div>
            <div class="settings-section" id="settings-section-devices">
              <div class="settings-section-label">My Devices</div>
              <div id="settings-devices-list"></div>
            </div>
            <div class="settings-section" id="settings-section-app" style="display:none">
              <div class="settings-section-label">Admin</div>
              <div class="settings-row">
                <div class="settings-row-info">
                  <span class="settings-row-title">Global Settings</span>
                  <span class="settings-row-desc">Timezone, regions, and named points</span>
                </div>
                <button class="settings-action-btn" id="settings-tenant-open-btn" aria-label="Open global settings">${icon('chevron-right', { size: 14 })}</button>
              </div>
              ${setupGuideAdminRowMarkup()}
            </div>
            <div class="settings-section" id="settings-section-users" style="display:none">
              <div class="settings-section-label">Users</div>
              <div id="settings-users-list"></div>
              <details id="settings-invite-form" class="settings-add-tracker">
                <summary>Invite someone</summary>
                <div class="settings-add-inner">
                  <input type="text" id="settings-invite-name" placeholder="Name" autocomplete="off" />
                  <select id="settings-invite-role">
                    <option value="viewer">Viewer</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div class="settings-add-actions">
                    <button id="settings-invite-submit" class="btn-primary">Create link</button>
                    <button id="settings-invite-cancel" class="btn-secondary">Cancel</button>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
        <div class="settings-view settings-view-detail" id="settings-view-pilot-duty">
          ${pilotDutyMarkup()}
        </div>
        <div class="settings-view settings-view-detail" id="settings-view-aircraft-info">
          ${aircraftInfoMarkup()}
        </div>
        <div class="settings-view settings-view-detail" id="settings-view-tenant">
          <div class="settings-modal-body">
            <div class="settings-section">
              <div class="settings-section-label">General</div>
              <div class="settings-form-row">
                <div class="settings-form-label">App name</div>
                <input type="text" id="settings-tenant-name" autocomplete="off" />
              </div>
              <div class="settings-form-row">
                <div class="settings-form-label">Timezone</div>
                <select id="settings-tenant-timezone"></select>
              </div>
              <div class="settings-form-row">
                <div class="settings-form-label">Map default lat</div>
                <input type="number" id="settings-tenant-lat" step="any" autocomplete="off" />
              </div>
              <div class="settings-form-row">
                <div class="settings-form-label">Map default lng</div>
                <input type="number" id="settings-tenant-lng" step="any" autocomplete="off" />
              </div>
              <div class="settings-form-row">
                <div class="settings-form-label">Map default zoom</div>
                <input type="number" id="settings-tenant-zoom" min="1" max="20" step="1" autocomplete="off" />
              </div>
              <div class="settings-add-actions">
                <button id="settings-tenant-map-pick" class="btn-secondary">Set from map</button>
              </div>
              <div class="settings-form-row">
                <div class="settings-form-label">Gap alert (minutes)</div>
                <input type="number" id="settings-tenant-gap-minutes" min="1" step="1" autocomplete="off" />
              </div>
              <div class="settings-add-actions">
                <button id="settings-tenant-save" class="btn-primary">Save</button>
              </div>
              <p id="settings-tenant-status" class="settings-msg" style="display:none"></p>
            </div>
            <div class="settings-section">
              <div class="settings-section-label">Notifications</div>
              <p class="settings-section-desc">Notification targets receive takeoff, landing, and in-flight signal-gap events (see the gap alert threshold above), delivered either as a JSON webhook POST or natively via Pushover. Signal-gap alerts repeat about once a minute while the silence continues, followed by a final &ldquo;signal restored&rdquo; notification when updates resume.</p>
              <p class="settings-section-desc">Pushover setup is two steps. <strong>First</strong>, register one free application at <code>pushover.net/apps/build</code> and paste its token below — this single token is shared by every Pushover target on this instance. <strong>Then</strong>, add a target below for each person who should get alerts, using <em>their own</em> Pushover user key (from their pushover.net dashboard) — not the token.</p>
              <div class="settings-form-row">
                <div class="settings-form-label">Pushover application token (shared)</div>
                <input type="text" id="settings-tenant-pushover-token" autocomplete="off" placeholder="from pushover.net/apps/build" />
              </div>
              <div class="settings-add-actions">
                <button id="settings-pushover-token-save" class="btn-secondary">Save token</button>
              </div>
              <p id="settings-pushover-token-status" class="settings-msg" style="display:none"></p>
              <div id="settings-webhooks-list"></div>
              <details id="settings-add-webhook" class="settings-add-tracker">
                <summary>Add notification target</summary>
                <div class="settings-add-inner">
                  <div class="settings-webhook-events" id="settings-add-webhook-type">
                    <label><input type="radio" name="settings-add-webhook-type-radio" value="webhook" checked /> Webhook</label>
                    <label><input type="radio" name="settings-add-webhook-type-radio" value="pushover" /> Pushover</label>
                  </div>
                  <input type="text" id="settings-add-webhook-url" placeholder="https://example.com/hook" autocomplete="off" />
                  <input type="text" id="settings-add-webhook-pushover-key" placeholder="Recipient's Pushover user key (not the app token)" autocomplete="off" style="display:none" />
                  <input type="text" id="settings-add-webhook-label" placeholder="Label (optional)" autocomplete="off" />
                  <div class="settings-webhook-events" id="settings-add-webhook-events">
                    <label><input type="checkbox" value="takeoff" checked /> Takeoff</label>
                    <label><input type="checkbox" value="landing" checked /> Landing</label>
                    <label><input type="checkbox" value="gap" checked /> Signal gap</label>
                  </div>
                  <div class="settings-add-actions">
                    <button id="settings-add-webhook-submit" class="btn-primary">Add</button>
                    <button id="settings-add-webhook-cancel" class="btn-secondary">Cancel</button>
                  </div>
                </div>
              </details>
              <p id="settings-webhooks-status" class="settings-msg" style="display:none"></p>
            </div>
            <div class="settings-section">
              <div class="settings-section-label">Regions</div>
              <p class="settings-section-desc">GeoJSON FeatureCollection with Polygon or MultiPolygon features. Each feature requires a <code>Name</code> property. Import replaces all existing regions.</p>
              <p class="settings-section-desc">End a region&rsquo;s name with <code>(Base)</code>, e.g. <code>Kodiak (Base)</code>, to make it a home base: analytics leaves out time spent flying to and from it, and lists its stops separately.</p>
              <div class="settings-add-actions">
                <button id="settings-regions-export" class="btn-secondary">Export</button>
                <label id="settings-regions-import-label" class="btn-secondary">
                  Import
                  <input type="file" id="settings-regions-import" accept=".json,.geojson" />
                </label>
                <button id="settings-regions-editor-btn" class="btn-secondary">Map Editor</button>
              </div>
              <p id="settings-regions-status" class="settings-msg" style="display:none"></p>
            </div>
            <div class="settings-section">
              <div class="settings-section-label">Named Points</div>
              <p class="settings-section-desc">GeoJSON FeatureCollection with Point features. Each feature requires a <code>name</code> property and optionally a <code>maxKm</code> radius in kilometers. Import replaces all existing named points.</p>
              <div class="settings-add-actions">
                <button id="settings-named-points-export" class="btn-secondary">Export</button>
                <label id="settings-named-points-import-label" class="btn-secondary">
                  Import
                  <input type="file" id="settings-named-points-import" accept=".json,.geojson" />
                </label>
                <button id="settings-named-points-editor-btn" class="btn-secondary">Map Editor</button>
              </div>
              <p id="settings-named-points-status" class="settings-msg" style="display:none"></p>
            </div>
          </div>
        </div>
        ${namedPointsEditorMarkup()}
        ${regionsEditorMarkup()}
        ${mapViewPickerMarkup()}
      </div>
      ${typstLoadOverlayMarkup()}
      <div id="aircraft-info-cf-overlay" class="aircraft-info-cf-overlay hidden">
        <div class="aircraft-info-cf-panel">
          <div id="aircraft-info-cf-message" class="aircraft-info-cf-message"></div>
          <div class="aircraft-info-cf-actions">
            <button id="aircraft-info-cf-update" class="aircraft-info-cf-update-btn btn-primary">Update</button>
            <button id="aircraft-info-cf-keep" class="aircraft-info-cf-keep-btn btn-secondary">Keep current</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

export function settingsModalStyles(): string {
  return `
    .settings-modal {
      position: fixed;
      inset: 0;
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .settings-modal.hidden { display: none; }

    .settings-modal-backdrop {
      position: absolute;
      inset: 0;
      background: var(--scrim);
    }

    .settings-modal-panel {
      position: relative;
      background: var(--surface-1);
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 520px;
      max-height: min(88vh, 760px);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: var(--shadow-lg);
    }

    .settings-nav {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0 0.75rem;
      min-height: 3rem;
      flex-shrink: 0;
      border-bottom: 1px solid var(--border);
    }

    .settings-nav-back {
      background: none;
      border: none;
      color: var(--accent-text);
      font-size: 0.875rem;
      cursor: pointer;
      padding: 0.3rem 0.5rem 0.3rem 0;
      border-radius: var(--radius-md);
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      transition: opacity var(--duration-fast) var(--ease-standard);
    }

    .settings-nav-back.hidden { display: none; }
    .settings-nav-back:hover { opacity: 0.7; }

    .settings-modal-title {
      flex: 1;
      text-align: center;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .settings-modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 0.35rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-md);
    }

    .settings-modal-close:hover { color: var(--text-secondary); }

    .settings-views {
      display: grid;
      grid-template-columns: 1fr;
      grid-template-rows: 1fr;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .settings-view {
      grid-column: 1;
      grid-row: 1;
      min-height: 0;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      transition: transform 0.22s cubic-bezier(0.4,0,0.2,1);
    }

    #settings-view-main { transform: translateX(0); }
    #settings-view-main.settings-view-pushed { transform: translateX(-100%); }
    .settings-view-detail { transform: translateX(100%); }
    .settings-view-detail.settings-view-active { transform: translateX(0); }
    .settings-view-detail.settings-view-pushed { transform: translateX(-100%); }

    @media (max-width: 640px) {
      .settings-modal { padding: 0; align-items: stretch; }
      .settings-modal-panel { max-width: none; max-height: none; border-radius: 0; flex: 1; height: 100%; }
    }

    .settings-modal.settings-modal-fullscreen {
      padding: 0;
      align-items: stretch;
    }
    .settings-modal.settings-modal-fullscreen .settings-modal-panel {
      max-width: none;
      max-height: none;
      border-radius: 0;
      flex: 1;
      height: 100%;
    }

    .settings-modal-body {
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .settings-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      background: var(--surface-0);
      border-radius: var(--radius-lg);
      padding: 0.65rem 0.75rem;
    }

    [data-theme="light"] .settings-section {
      background: var(--surface-2);
    }

    .settings-section-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .settings-section-desc {
      font-size: 0.8rem;
      color: var(--text-muted);
      line-height: 1.4;
    }

    .settings-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      justify-content: space-between;
    }

    .settings-row-info { flex: 1; min-width: 0; }

    .settings-row-title {
      font-size: 0.875rem;
      color: var(--text-primary);
      display: block;
    }

    .settings-row-desc {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
      line-height: 1.4;
      display: block;
    }

    .settings-aircraft-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0;
      border-bottom: 1px solid var(--border-structural);
    }

    .settings-aircraft-row:last-child { border-bottom: none; }

    .settings-aircraft-row.editing {
      flex-direction: column;
      align-items: stretch;
    }

    .settings-aircraft-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .settings-aircraft-name {
      font-size: 0.85rem;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .settings-aircraft-inactive .settings-aircraft-name { color: var(--text-muted); }

    .settings-aircraft-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .settings-aircraft-actions {
      display: flex;
      gap: 0.3rem;
      flex-shrink: 0;
    }

    /* .settings-action-btn: JS-generated small buttons in tracker/aircraft/pilot rows */
    .settings-action-btn {
      background: var(--surface-2);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-muted);
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
      padding: 0.25rem 0.55rem;
      font-size: 0.75rem;
    }
    .settings-action-btn:hover {
      background: var(--surface-hover);
      color: var(--text-secondary);
      border-color: var(--border-strong);
    }
    .settings-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    /* .settings-btn: visual props come from .btn-secondary on those elements */

    .settings-edit-form {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      padding: 0.4rem 0 0.2rem;
    }

    .settings-edit-form-actions { display: flex; gap: 0.3rem; }

    .settings-import-warning {
      background: var(--warning-surface);
      color: var(--warning-fg);
      border-radius: var(--radius-sm);
      padding: 0.35rem 0.5rem;
    }

    /* Color-only override; size comes from .settings-action-btn */
    .save-edit-btn {
      background: var(--accent-solid);
      border-color: transparent;
      border-radius: var(--radius-pill);
      color: var(--accent-fg);
    }

    .save-edit-btn:hover { background: var(--accent-solid-hover); color: var(--accent-fg); border-color: transparent; }

    .settings-add-tracker {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .settings-add-tracker summary {
      cursor: pointer;
      padding: 0.3rem 0;
      color: var(--text-muted);
      font-size: 0.8rem;
      list-style: none;
      user-select: none;
    }

    .settings-add-tracker summary::before { content: '+ '; }

    .settings-add-inner {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      padding-top: 0.5rem;
    }

    .settings-add-inner input:not([type="radio"]):not([type="checkbox"]),
    .settings-add-inner select,
    .settings-edit-form input:not([type="radio"]):not([type="checkbox"]),
    .settings-edit-form select,
    .settings-form-row input:not([type="radio"]):not([type="checkbox"]),
    .settings-form-row select {
      padding: 0.35rem 0.5rem;
      background: var(--input-bg);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: 0.8rem;
      font-family: inherit;
      width: 100%;
    }

    .settings-webhook-events {
      display: flex;
      gap: 0.75rem;
      font-size: 0.8rem;
      color: var(--text-secondary);
      padding: 0.2rem 0;
    }

    .settings-webhook-events label {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      cursor: pointer;
    }

    .settings-webhook-events input[type="radio"],
    .settings-webhook-events input[type="checkbox"] {
      width: auto;
      flex-shrink: 0;
      margin: 0;
      accent-color: var(--accent);
      cursor: pointer;
    }

    /* One "Default / On / Off" select per currently-enabled base layer in the
       "Add/Edit overlay" forms, letting an overlay's default on/off state lean
       differently depending on which basemap is active (see docs on
       TileOverlay.default_enabled_by_basemap). "Default" means inherit the general
       fallback checkbox above this list, rather than an explicit on/off for that
       basemap. */
    .settings-basemap-defaults {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.8rem;
      color: var(--text-secondary);
      padding: 0.2rem 0;
    }

    .settings-basemap-defaults label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.35rem;
      white-space: nowrap;
    }

    .settings-basemap-defaults select {
      width: auto !important;
      padding: 0.15rem 0.3rem !important;
    }

    .settings-add-actions {
      display: flex;
      gap: 0.4rem;
    }

    /* Buttons inside .settings-add-actions get compact modal sizing automatically.
       Visual appearance (color, border, radius) comes from .btn-primary / .btn-secondary /
       .settings-danger-btn. No per-ID overrides needed — just put the button in the right
       container and use the right class. */
    .settings-add-actions .btn-primary {
      padding: 0.45rem 1rem;
      font-size: 0.85rem;
      min-height: 2.25rem;
    }

    .settings-add-actions .btn-secondary,
    .settings-add-actions .settings-danger-btn {
      padding: 0.45rem 0.85rem;
      font-size: 0.85rem;
      min-height: 2.25rem;
    }

    #settings-regions-import-label,
    #settings-named-points-import-label {
      display: inline-flex;
      align-items: center;
    }

    #settings-regions-import,
    #settings-named-points-import {
      display: none;
    }

    .settings-msg {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .settings-devices-account {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border-structural);
    }

    .settings-devices-account-label {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
    }

    .settings-devices-account-name {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .settings-devices-account-role {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .settings-danger-btn {
      padding: 0.25rem 0.55rem;
      background: transparent;
      border: 1.5px solid var(--danger);
      border-radius: var(--radius-md);
      color: var(--danger-fg);
      font-size: 0.75rem;
      cursor: pointer;
      transition: background-color var(--duration-fast) var(--ease-standard);
    }

    .settings-danger-btn:hover { background: var(--danger-surface); }

    .sidebar-footer {
      flex-shrink: 0;
      padding: 0.5rem 0.75rem;
      border-top: 1px solid var(--border-structural);
      display: flex;
      gap: 0.5rem;
    }

    .settings-btn { width: 100%; padding: 0.45rem 0.6rem; font-size: 0.8rem; text-align: center; min-height: 2.25rem; }

    /* ── Appearance / theme toggle ─────────────────────────────────────────── */
    /* .settings-theme-row / .settings-theme-btn styling is the shared
       segmented-control primitive — see shared/segmented-control.ts. */

    .settings-map-color-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .settings-map-color-row input[type="range"] {
      width: 100px;
      accent-color: var(--accent);
    }

    .settings-map-color-value {
      font-size: 0.78rem;
      color: var(--text-muted);
      min-width: 2.4rem;
      text-align: right;
    }

    /* ── Link display card (device link / invite link) ──────────────────────── */
    .settings-link-card {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.5rem 0 0.25rem;
    }

    .settings-link-card-label {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .settings-link-url-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--input-bg);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.4rem 0.5rem;
    }

    .settings-link-url-text {
      flex: 1;
      min-width: 0;
      font-size: 0.72rem;
      font-family: var(--font-mono);
      letter-spacing: var(--tracking-wide);
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .settings-link-qr {
      display: flex;
      justify-content: center;
      padding: 0.75rem;
      background: #fff;
      border-radius: var(--radius-md);
    }

    /* qrcodejs creates a canvas + an img fallback; show only the canvas */
    .settings-link-qr canvas { display: block; }
    .settings-link-qr img { display: none; }

    /* ── Tracker form: labels + type row + instructions + credentials ─────── */
    .settings-form-label {
      font-size: 0.7rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.1rem;
      display: block;
    }

    .settings-form-row {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .settings-section-desc code {
      font-family: var(--font-mono);
      font-size: 0.8em;
      background: var(--surface-2);
      border-radius: var(--radius-xs);
      padding: 0.1em 0.3em;
    }


    .settings-tracker-type-row {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .settings-tracker-type-row select { flex: 1; }

    .settings-type-help-btn {
      flex-shrink: 0;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 50%;
      background: var(--surface-2);
      border: 1.5px solid var(--border);
      color: var(--text-muted);
      font-size: 0.8rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
      padding: 0;
    }

    .settings-type-help-btn:hover {
      background: var(--surface-hover);
      color: var(--text-secondary);
    }

    .tracker-instructions {
      display: none;
      font-size: 0.78rem;
      color: var(--text-secondary);
      line-height: 1.5;
      background: var(--surface-2);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0.6rem 0.7rem;
    }

    .tracker-instructions.visible { display: block; }

    .tracker-instructions ol {
      margin: 0.25rem 0 0;
      padding-left: 1.25rem;
    }

    .tracker-instructions li { margin-bottom: 0.2rem; }

    .tracker-instructions strong { color: var(--text-primary); }

    .tracker-instructions code {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      background: var(--surface-0);
      padding: 0.1em 0.3em;
      border-radius: var(--radius-xs);
    }

    .tracker-instructions p {
      margin: 0.4rem 0 0;
      color: var(--text-muted);
      font-size: 0.75rem;
    }

    .tracker-cred-clear-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .tracker-cred-clear-btn,
    .tracker-cred-undo-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 0.75rem;
      cursor: pointer;
      padding: 0;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .tracker-cred-clear-btn:hover,
    .tracker-cred-undo-btn:hover { color: var(--text-secondary); }

    .tracker-cred-clear-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      font-style: italic;
    }

    /* ── Full-screen map views (named points, regions, default-view picker) ── */
    /* The view is a flex column so .map-editor-body (and the map in it) fills it. */
    .settings-view[data-fullscreen-editor] {
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .rg-drag-handle {
      background: transparent;
      cursor: grab;
    }

    .map-editor-status-overlay {
      position: absolute;
      top: 0.5rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 500;
      pointer-events: none;
      display: flex;
      gap: 0.4rem;
      align-items: center;
    }

    .map-editor-status-overlay .map-editor-dirty,
    .map-editor-status-overlay .settings-msg:not(:empty) {
      background: var(--surface-float);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-sm);
      padding: 0.2rem 0.6rem;
      backdrop-filter: blur(14px) saturate(1.1);
      -webkit-backdrop-filter: blur(14px) saturate(1.1);
      box-shadow: var(--shadow-sm);
      white-space: nowrap;
    }

    .map-editor-body {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    @media (min-width: 641px) {
      .map-editor-body { flex-direction: row; }
    }

    .map-editor-map-wrap {
      flex: 1;
      min-height: 0;
      min-width: 0;
      position: relative;
    }

    #np-editor-map,
    #rg-editor-map,
    #mvp-map { position: absolute; inset: 0; }

    .map-editor-panel {
      display: none;
      flex-direction: column;
      gap: 0.4rem;
      padding: 0.5rem 0.75rem;
      border-top: 1px solid var(--border);
      flex-shrink: 0;
      background: var(--surface-1);
      overflow-y: auto;
    }

    @media (min-width: 641px) {
      .map-editor-panel {
        border-top: none;
        border-left: 1px solid var(--border);
        width: 240px;
        flex-shrink: 0;
      }
    }

    .map-editor-panel.visible { display: flex; }

    .map-tool-overlay {
      position: absolute;
      top: 0.5rem;
      left: 0.5rem;
      z-index: 500;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      pointer-events: none;
    }

    .map-tool-btn {
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      background: var(--surface-1);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 1rem;
      box-shadow: var(--shadow-sm);
      transition: background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
    }

    .map-tool-btn.active {
      background: var(--accent-solid);
      border-color: var(--accent-solid);
      color: var(--accent-fg);
    }

    .map-tool-btn:not(.active):hover {
      background: var(--surface-hover);
      color: var(--text-primary);
    }

    .map-editor-ctx-menu {
      position: fixed;
      z-index: 9000;
      background: var(--surface-1);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      min-width: 130px;
      overflow: hidden;
      display: none;
    }

    .map-editor-ctx-menu.visible { display: block; }

    .map-editor-ctx-menu-item {
      padding: 0.5rem 0.85rem;
      font-size: 0.82rem;
      color: var(--text-primary);
      cursor: pointer;
      transition: background-color var(--duration-fast) var(--ease-standard);
      user-select: none;
    }

    .map-editor-ctx-menu-item:hover { background: var(--surface-hover); }
    .map-editor-ctx-menu-item.danger { color: var(--danger-fg); }
    .map-editor-ctx-menu-item.danger:hover { background: var(--danger-surface); }

    .map-editor-dirty {
      font-size: 0.8rem;
      color: var(--warning-fg);
    }

    ${mapViewPickerStyles()}

    ${setupGuideStyles()}
  `;
}

export function settingsModalScript(): string {
  return `
    // ── Settings modal ────────────────────────────────────────────────────────

    ${mapLayersSettingsScript()}

    // Page-level hooks — each page reassigns these before the modal can open.
    let settingsAfterTrackerChange = () => {};
    // settingsOnClearCache is responsible for clearing the store(s) AND re-rendering.
    let settingsOnClearCache = async () => {};

    let _settingsUser = null;

    async function _loadSettingsUser() {
      if (_settingsUser) return _settingsUser;
      try {
        const resp = await fetch('/api/me');
        if (resp.ok) _settingsUser = await resp.json();
      } catch (_) {}
      return _settingsUser;
    }

    let _settingsViewStack = [];
    let _settingsBeforeBack = null;

    function _settingsNavigateTo(viewId, title) {
      if (_settingsViewStack.length === 0) {
        document.getElementById('settings-view-main').classList.add('settings-view-pushed');
      } else {
        const cur = _settingsViewStack[_settingsViewStack.length - 1];
        const curView = document.getElementById(cur.id);
        curView.classList.add('settings-view-pushed');
        curView.classList.remove('settings-view-active');
      }
      const view = document.getElementById(viewId);
      view.classList.add('settings-view-active');
      view.scrollTop = 0;
      document.getElementById('settings-nav-title').textContent = title;
      document.getElementById('settings-nav-back').classList.remove('hidden');
      _settingsViewStack.push({ id: viewId, title });
      if (view.dataset.fullscreenEditor !== undefined) {
        document.getElementById('settings-modal').classList.add('settings-modal-fullscreen');
      }
    }

    function _settingsNavigateBack() {
      if (_settingsViewStack.length === 0) return;
      const entry = _settingsViewStack.pop();
      const exitView = document.getElementById(entry.id);
      exitView.classList.remove('settings-view-active', 'settings-view-pushed');
      if (exitView.dataset.fullscreenEditor !== undefined) {
        document.getElementById('settings-modal').classList.remove('settings-modal-fullscreen');
      }
      if (_settingsViewStack.length === 0) {
        document.getElementById('settings-view-main').classList.remove('settings-view-pushed');
        document.getElementById('settings-nav-title').textContent = 'Settings';
        document.getElementById('settings-nav-back').classList.add('hidden');
      } else {
        const prev = _settingsViewStack[_settingsViewStack.length - 1];
        const prevView = document.getElementById(prev.id);
        prevView.classList.remove('settings-view-pushed');
        prevView.classList.add('settings-view-active');
        document.getElementById('settings-nav-title').textContent = prev.title;
      }
    }

    function _settingsReset() {
      while (_settingsViewStack.length > 0) {
        const entry = _settingsViewStack.pop();
        const v = document.getElementById(entry.id);
        v.classList.remove('settings-view-active', 'settings-view-pushed');
      }
      document.getElementById('settings-modal').classList.remove('settings-modal-fullscreen');
      document.getElementById('settings-view-main').classList.remove('settings-view-pushed');
      document.getElementById('settings-nav-title').textContent = 'Settings';
      document.getElementById('settings-nav-back').classList.add('hidden');
    }

    document.getElementById('settings-nav-back').addEventListener('click', async () => {
      if (_settingsBeforeBack) {
        const fn = _settingsBeforeBack;
        _settingsBeforeBack = null;
        try { await fn(); } catch (_) {}
      }
      _settingsNavigateBack();
    });
    document.getElementById('settings-modal-backdrop').addEventListener('click', closeSettings);

    async function openSettings() {
      _settingsReset();
      document.getElementById('settings-modal').classList.remove('hidden');
      _syncThemeButtons();
      renderMapLayersSettings();
      renderSettingsOverlaysList();
      renderSettingsTrackerList();
      renderSettingsAircraftList();
      renderSettingsPilotList();

      await _loadSettingsUser();

      // Show/hide admin-only sections
      const isAdmin = _settingsUser?.role === 'admin';
      const usersSection = document.getElementById('settings-section-users');
      if (usersSection) usersSection.style.display = isAdmin ? '' : 'none';
      const appSection = document.getElementById('settings-section-app');
      if (appSection) appSection.style.display = isAdmin ? '' : 'none';

      for (const id of ['settings-add-aircraft', 'settings-add-pilot', 'settings-add-tracker', 'settings-add-overlay']) {
        const el = document.getElementById(id);
        if (el) el.style.display = isAdmin ? '' : 'none';
      }
      // Anyone can add a per-device basemap, but the lookup fetches a URL server-side,
      // so /api/tile-metadata (and this button) is admin-only.
      const layerLookup = document.getElementById('settings-add-layer-lookup');
      if (layerLookup) layerLookup.style.display = isAdmin ? '' : 'none';

      // Re-render tracker/overlay lists now that role is known (action buttons depend on it)
      renderSettingsTrackerList();
      renderSettingsOverlaysList();

      // Load devices (all users) and users list (admin only)
      renderSettingsDevicesList();
      if (isAdmin) renderSettingsUsersList();

      // Refresh lists in case they changed since last load.
      try {
        const [ar, pr] = await Promise.all([fetch('/api/aircraft'), fetch('/api/pilots')]);
        if (ar.ok) { const d = await ar.json(); aircraftList = d.aircraft; renderSettingsAircraftList(); }
        if (pr.ok) { const d = await pr.json(); pilotList = d.pilots; renderSettingsPilotList(); }
        settingsResetAddForm();
      } catch (_) {}
      if (isAdmin) renderSetupGuide(false);
      else document.getElementById('settings-section-setup').style.display = 'none';
    }

    async function closeSettings() {
      if (_settingsBeforeBack) {
        const fn = _settingsBeforeBack;
        _settingsBeforeBack = null;
        try { await fn(); } catch (_) {}
      }
      document.getElementById('settings-modal').classList.add('hidden');
      _settingsReset();
    }

    document.getElementById('settings-btn').addEventListener('click', openSettings);
    document.getElementById('settings-modal-close').addEventListener('click', closeSettings);

    function renderSettingsTrackerList() {
      const container = document.getElementById('settings-tracker-list');
      container.innerHTML = '';

      if (!trackerList || trackerList.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'settings-msg';
        msg.textContent = 'No trackers configured.';
        container.appendChild(msg);
        return;
      }

      for (const t of trackerList.filter(t => !t.deleted)) {
        const row = document.createElement('div');
        row.className = 'settings-aircraft-row' + (t.active ? '' : ' settings-aircraft-inactive');

        const info = document.createElement('div');
        info.className = 'settings-aircraft-info';
        const nameEl = document.createElement('span');
        nameEl.className = 'settings-aircraft-name';
        nameEl.textContent = t.name;
        info.appendChild(nameEl);
        const sub = document.createElement('span');
        sub.className = 'settings-aircraft-sub';
        const subParts = [t.type];
        if (t.assigned_aircraft) subParts.push(t.assigned_aircraft);
        if (t.assigned_pilot != null) {
          const pilot = pilotList.find(p => p.id === t.assigned_pilot);
          if (pilot) subParts.push(pilot.name);
        }
        if (!t.active) subParts.push('paused');
        sub.textContent = subParts.join(' · ');
        if (sub.textContent) info.appendChild(sub);

        const actions = document.createElement('div');
        actions.className = 'settings-aircraft-actions';

        if (_settingsUser?.role === 'admin') {
          const editBtn = document.createElement('button');
          editBtn.className = 'settings-action-btn';
          editBtn.textContent = 'Edit';
          editBtn.addEventListener('click', () => settingsToggleEditForm(row, t));

          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'settings-action-btn';
          toggleBtn.textContent = t.active ? 'Pause' : 'Resume';
          toggleBtn.addEventListener('click', () => settingsToggleActive(t, toggleBtn));

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'settings-action-btn';
          deleteBtn.textContent = 'Delete';
          deleteBtn.addEventListener('click', () => settingsDeleteTracker(t));

          const importBtn = document.createElement('button');
          importBtn.className = 'settings-action-btn';
          importBtn.textContent = 'Import';
          importBtn.title = 'Import history from the feed';
          importBtn.addEventListener('click', () => settingsToggleImportForm(row, t));

          actions.appendChild(editBtn);
          actions.appendChild(importBtn);
          actions.appendChild(toggleBtn);
          actions.appendChild(deleteBtn);
        }
        row.appendChild(info);
        row.appendChild(actions);
        container.appendChild(row);
      }
    }

    // ── Overlays (tenant-scoped tile layers shown in the map's overlay legend) ──

    // Populates the given container with one "Default / On / Off" <select> per
    // currently-enabled base layer (from _ftActiveLayerDefs(), defined by
    // mapLayersRuntimeScript — presets and custom layers this device has active,
    // same set _ftOverlayDefaultEnabled in map-controls.ts resolves basemap ids
    // against). Deleted/disabled layers are excluded since an override keyed to
    // one would never match a live basemap id. "Default" means inherit the
    // general fallback checkbox rather than an explicit override for that basemap.
    function _buildBasemapDefaultsFields(container, existingDefaults) {
      container.innerHTML = '';
      _ftActiveLayerDefs().forEach(function(p) {
        const row = document.createElement('label');
        const span = document.createElement('span');
        span.textContent = p.label;
        const select = document.createElement('select');
        select.dataset.basemapId = p.id;
        for (const [v, text] of [['', 'Default'], ['on', 'On'], ['off', 'Off']]) {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = text;
          select.appendChild(opt);
        }
        select.value = existingDefaults && Object.prototype.hasOwnProperty.call(existingDefaults, p.id)
          ? (existingDefaults[p.id] ? 'on' : 'off') : '';
        row.appendChild(span);
        row.appendChild(select);
        container.appendChild(row);
      });
    }

    // Reads the selects built above back into a default_enabled_by_basemap object
    // (or null if every select is still "Default", i.e. no overrides were made).
    function _readBasemapDefaultsFields(container) {
      const result = {};
      let has = false;
      container.querySelectorAll('select').forEach((sel) => {
        if (sel.value === 'on') { result[sel.dataset.basemapId] = true; has = true; }
        else if (sel.value === 'off') { result[sel.dataset.basemapId] = false; has = true; }
      });
      return has ? result : null;
    }

    function _buildOverlayRow(ov) {
      const row = document.createElement('div');
      row.className = 'settings-aircraft-row';

      const info = document.createElement('div');
      info.className = 'settings-aircraft-info';
      const nameEl = document.createElement('span');
      nameEl.className = 'settings-aircraft-name';
      nameEl.textContent = ov.label;
      info.appendChild(nameEl);
      const sub = document.createElement('span');
      sub.className = 'settings-aircraft-sub';
      const overrideCount = ov.default_enabled_by_basemap ? Object.keys(ov.default_enabled_by_basemap).length : 0;
      sub.textContent = (ov.default_enabled ? 'On by default' : 'Off by default') +
        (overrideCount > 0 ? ' · ' + overrideCount + ' basemap override' + (overrideCount > 1 ? 's' : '') : '');
      info.appendChild(sub);

      const actions = document.createElement('div');
      actions.className = 'settings-aircraft-actions';

      if (_settingsUser?.role === 'admin') {
        const editBtn = document.createElement('button');
        editBtn.className = 'settings-action-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => settingsToggleOverlayEditForm(row, ov));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'settings-action-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => settingsDeleteOverlay(ov));

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
      }

      row.appendChild(info);
      row.appendChild(actions);
      return row;
    }

    function renderSettingsOverlaysList() {
      const container = document.getElementById('settings-overlay-list');
      if (!container) return;
      container.innerHTML = '';

      if (!overlayList || overlayList.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'settings-msg';
        msg.textContent = 'No overlays configured.';
        container.appendChild(msg);
        return;
      }

      for (const ov of overlayList) container.appendChild(_buildOverlayRow(ov));
    }

    function settingsToggleOverlayEditForm(row, ov) {
      const existing = row.querySelector('.settings-edit-form');
      if (existing) {
        existing.remove();
        row.querySelector('.settings-aircraft-actions').style.display = '';
        row.classList.remove('editing');
        return;
      }

      row.querySelector('.settings-aircraft-actions').style.display = 'none';
      row.classList.add('editing');

      const form = document.createElement('div');
      form.className = 'settings-edit-form';

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.value = ov.label;
      form.appendChild(_lbl('Label', labelInput));

      const urlInput = document.createElement('input');
      urlInput.type = 'text';
      urlInput.value = ov.url;
      form.appendChild(_lbl('Tile URL', urlInput));

      const attrInput = document.createElement('input');
      attrInput.type = 'text';
      attrInput.value = ov.attribution || '';
      form.appendChild(_lbl('Attribution', attrInput));

      const maxZoomInput = document.createElement('input');
      maxZoomInput.type = 'number';
      maxZoomInput.min = '1';
      maxZoomInput.max = '22';
      maxZoomInput.step = '1';
      maxZoomInput.value = ov.max_zoom != null ? String(ov.max_zoom) : '';
      form.appendChild(_lbl('Max native zoom', maxZoomInput));

      const defaultLabel = document.createElement('label');
      const defaultInput = document.createElement('input');
      defaultInput.type = 'checkbox';
      defaultInput.checked = !!ov.default_enabled;
      defaultLabel.appendChild(defaultInput);
      defaultLabel.appendChild(document.createTextNode(' On by default (fallback for basemaps not set below)'));
      form.appendChild(defaultLabel);

      const basemapDefaultsEl = document.createElement('div');
      basemapDefaultsEl.className = 'settings-basemap-defaults';
      _buildBasemapDefaultsFields(basemapDefaultsEl, ov.default_enabled_by_basemap);
      form.appendChild(_lbl('Default per basemap (optional)', basemapDefaultsEl));

      const lookupStatus = document.createElement('p');
      lookupStatus.className = 'settings-msg';
      lookupStatus.setAttribute('aria-live', 'polite');
      form.appendChild(lookupStatus);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'settings-edit-form-actions';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'settings-action-btn';
      saveBtn.textContent = 'Save';
      const lookupBtn = document.createElement('button');
      lookupBtn.className = 'settings-action-btn';
      lookupBtn.textContent = 'Look up details';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'settings-action-btn';
      cancelBtn.textContent = 'Cancel';
      actionsDiv.appendChild(saveBtn);
      actionsDiv.appendChild(lookupBtn);
      actionsDiv.appendChild(cancelBtn);
      form.appendChild(actionsDiv);

      lookupBtn.addEventListener('click', () => {
        _ftLookupTileMetadata(lookupBtn, lookupStatus, {
          url: urlInput, label: labelInput, attribution: attrInput, maxZoom: maxZoomInput,
        });
      });

      saveBtn.addEventListener('click', async () => {
        const label = labelInput.value.trim();
        const url = urlInput.value.trim();
        if (!label || !url) return;
        const body = {
          label, url,
          attribution: attrInput.value.trim() || null,
          max_zoom: maxZoomInput.value.trim() ? parseInt(maxZoomInput.value, 10) : null,
          default_enabled: defaultInput.checked,
          default_enabled_by_basemap: _readBasemapDefaultsFields(basemapDefaultsEl),
        };
        try {
          const resp = await fetch('/api/overlays/' + ov.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (resp.ok) {
            Object.assign(ov, body);
            renderSettingsOverlaysList();
            _ftRenderOverlayLegend();
          } else {
            const data = await resp.json().catch(() => ({}));
            alert(data.error ?? 'Failed to save overlay.');
          }
        } catch (_) {}
      });

      cancelBtn.addEventListener('click', () => {
        form.remove();
        row.querySelector('.settings-aircraft-actions').style.display = '';
        row.classList.remove('editing');
      });
      row.appendChild(form);
    }

    async function settingsDeleteOverlay(ov) {
      if (!confirm('Delete "' + ov.label + '"? This removes it from every viewer\\'s map.')) return;
      try {
        const resp = await fetch('/api/overlays/' + ov.id, { method: 'DELETE' });
        if (resp.ok) {
          overlayList = overlayList.filter(o => o.id !== ov.id);
          renderSettingsOverlaysList();
          _ftRenderOverlayLegend();
        } else {
          const data = await resp.json().catch(() => ({}));
          alert(data.error ?? 'Failed to delete overlay.');
        }
      } catch (_) {}
    }

    const _addOverlayBasemapDefaults = document.getElementById('settings-add-overlay-basemap-defaults');
    if (_addOverlayBasemapDefaults) _buildBasemapDefaultsFields(_addOverlayBasemapDefaults, null);

    const _addOverlaySubmit = document.getElementById('settings-add-overlay-submit');
    if (_addOverlaySubmit) {
      _addOverlaySubmit.addEventListener('click', async () => {
        const label = document.getElementById('settings-add-overlay-label').value.trim();
        const url = document.getElementById('settings-add-overlay-url').value.trim();
        const attribution = document.getElementById('settings-add-overlay-attribution').value.trim();
        const maxZoomRaw = document.getElementById('settings-add-overlay-maxzoom').value.trim();
        const defaultEnabled = document.getElementById('settings-add-overlay-default').checked;
        if (!label || !url) return;

        const body = {
          label, url,
          attribution: attribution || null,
          max_zoom: maxZoomRaw ? parseInt(maxZoomRaw, 10) : null,
          default_enabled: defaultEnabled,
          default_enabled_by_basemap: _addOverlayBasemapDefaults ? _readBasemapDefaultsFields(_addOverlayBasemapDefaults) : null,
        };
        try {
          const resp = await fetch('/api/overlays', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (resp.ok) {
            const data = await resp.json();
            overlayList.push({ id: data.id, ...body });
            renderSettingsOverlaysList();
            _ftRenderOverlayLegend();
            document.getElementById('settings-add-overlay-label').value = '';
            document.getElementById('settings-add-overlay-url').value = '';
            document.getElementById('settings-add-overlay-attribution').value = '';
            document.getElementById('settings-add-overlay-maxzoom').value = '';
            document.getElementById('settings-add-overlay-default').checked = false;
            if (_addOverlayBasemapDefaults) _buildBasemapDefaultsFields(_addOverlayBasemapDefaults, null);
            document.getElementById('settings-add-overlay-lookup-status').textContent = '';
            document.getElementById('settings-add-overlay').open = false;
          } else {
            const data = await resp.json().catch(() => ({}));
            alert(data.error ?? 'Failed to add overlay.');
          }
        } catch (_) {}
      });
    }
    const _addOverlayLookup = document.getElementById('settings-add-overlay-lookup');
    if (_addOverlayLookup) {
      _addOverlayLookup.addEventListener('click', () => {
        _ftLookupTileMetadata(_addOverlayLookup, document.getElementById('settings-add-overlay-lookup-status'), {
          url: document.getElementById('settings-add-overlay-url'),
          label: document.getElementById('settings-add-overlay-label'),
          attribution: document.getElementById('settings-add-overlay-attribution'),
          maxZoom: document.getElementById('settings-add-overlay-maxzoom'),
        });
      });
    }
    const _addOverlayCancel = document.getElementById('settings-add-overlay-cancel');
    if (_addOverlayCancel) {
      _addOverlayCancel.addEventListener('click', () => {
        document.getElementById('settings-add-overlay').open = false;
      });
    }

    let _addCredState = { getValue: () => '', isClear: () => false };

    function _lbl(text, el) {
      const wrap = document.createElement('div');
      const label = document.createElement('div');
      label.className = 'settings-form-label';
      label.textContent = text;
      wrap.appendChild(label);
      wrap.appendChild(el);
      return wrap;
    }

    function _renderInstructionsContent(panel, type) {
      panel.innerHTML = '';
      if (type === 'inreach') {
        panel.innerHTML =
          '<strong>Getting your MapShare URL</strong>' +
          '<ol>' +
          '<li>Log in to explore.garmin.com and click <strong>MAPSHARE</strong>.</li>' +
          '<li>Make sure MapShare is toggled on.</li>' +
          '<li>Click <strong>MapShare Settings</strong> to find or set your Access Code (it can be left blank).</li>' +
          '<li>Click <strong>Feeds</strong> → copy the <strong>Raw KML Data</strong> link. It looks like <code>https://share.garmin.com/Feed/Share/yourname</code>.</li>' +
          '<li>Enter this as the MapShare URL, and enter the access code if one is set.</li>' +
          '</ol>' +
          '<p>If you have a professional account or LiveTrack, see the Garmin documentation or contact the site admin.</p>';
      }
    }

    function _buildCredentialFields(container, type, mode) {
      container.innerHTML = '';
      let _realValue = '';

      if (type === 'inreach') {
        const label = document.createElement('div');
        label.className = 'settings-form-label';
        label.textContent = 'Access code';
        container.appendChild(label);

        const input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.setAttribute('data-field', 'access-code');

        if (mode === 'edit') {
          const DOTS = '••••••••';
          input.value = DOTS;

          input.addEventListener('focus', () => {
            if (!_realValue) input.value = '';
          });
          input.addEventListener('input', () => { _realValue = input.value; });
          input.addEventListener('blur', () => {
            if (_realValue) {
              input.value = '•'.repeat(_realValue.length);
            } else {
              input.value = DOTS;
            }
          });
        } else {
          input.addEventListener('input', () => { _realValue = input.value; });
          input.addEventListener('blur', () => {
            if (_realValue) input.value = '•'.repeat(_realValue.length);
          });
          input.addEventListener('focus', () => {
            input.value = '';
            _realValue = '';
          });
        }

        container.appendChild(input);
      }

      return { getValue: () => _realValue, isClear: () => false };
    }

    function settingsToggleEditForm(row, tracker) {
      const existing = row.querySelector('.settings-edit-form');
      if (existing) {
        existing.remove();
        row.querySelector('.settings-aircraft-actions').style.display = '';
        row.classList.remove('editing');
        return;
      }

      row.querySelector('.settings-aircraft-actions').style.display = 'none';
      row.classList.add('editing');

      const form = document.createElement('div');
      form.className = 'settings-edit-form';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'edit-name';
      nameInput.autocomplete = 'off';
      nameInput.value = tracker.name;
      form.appendChild(_lbl('Display name', nameInput));

      const typeRow = document.createElement('div');
      typeRow.className = 'settings-tracker-type-row';
      const typeSelect = document.createElement('select');
      const inreachOpt = document.createElement('option');
      inreachOpt.value = 'inreach';
      inreachOpt.textContent = 'InReach';
      typeSelect.appendChild(inreachOpt);
      typeSelect.value = tracker.type;
      typeSelect.disabled = true;
      const helpBtn = document.createElement('button');
      helpBtn.type = 'button';
      helpBtn.className = 'settings-type-help-btn';
      helpBtn.setAttribute('aria-label', 'How to get this URL');
      helpBtn.textContent = '?';
      typeRow.appendChild(typeSelect);
      typeRow.appendChild(helpBtn);
      form.appendChild(_lbl('Tracker type', typeRow));

      const instrPanel = document.createElement('div');
      instrPanel.className = 'tracker-instructions';
      _renderInstructionsContent(instrPanel, tracker.type);
      form.appendChild(instrPanel);
      helpBtn.addEventListener('click', () => instrPanel.classList.toggle('visible'));

      const urlInput = document.createElement('input');
      urlInput.type = 'text';
      urlInput.className = 'edit-source-url';
      urlInput.autocomplete = 'off';
      urlInput.value = tracker.source_url;
      form.appendChild(_lbl('MapShare URL', urlInput));

      const credContainer = document.createElement('div');
      form.appendChild(credContainer);
      let credState = _buildCredentialFields(credContainer, tracker.type, 'edit');

      const activePilots = pilotList.filter(p => p.active || p.id === tracker.assigned_pilot);
      if (aircraftList.length > 0) {
        const aircraftSel = document.createElement('select');
        aircraftSel.className = 'edit-aircraft';
        const noOpt = document.createElement('option');
        noOpt.value = '';
        noOpt.textContent = 'No aircraft';
        aircraftSel.appendChild(noOpt);
        for (const a of aircraftList) {
          const opt = document.createElement('option');
          opt.value = a.tail_number;
          opt.textContent = a.tail_number + (a.name ? ' – ' + a.name : '');
          if (a.tail_number === tracker.assigned_aircraft) opt.selected = true;
          aircraftSel.appendChild(opt);
        }
        form.appendChild(_lbl('Aircraft', aircraftSel));
      }
      if (activePilots.length > 0) {
        const pilotSel = document.createElement('select');
        pilotSel.className = 'edit-pilot';
        const noOpt = document.createElement('option');
        noOpt.value = '';
        noOpt.textContent = 'No pilot';
        pilotSel.appendChild(noOpt);
        for (const p of activePilots) {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name;
          if (p.id === tracker.assigned_pilot) opt.selected = true;
          pilotSel.appendChild(opt);
        }
        form.appendChild(_lbl('Pilot', pilotSel));
      }

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'settings-edit-form-actions';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'settings-action-btn save-edit-btn';
      saveBtn.textContent = 'Save';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'settings-action-btn settings-cancel-btn';
      cancelBtn.textContent = 'Cancel';
      actionsDiv.appendChild(saveBtn);
      actionsDiv.appendChild(cancelBtn);
      form.appendChild(actionsDiv);

      saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const source_url = urlInput.value.trim();
        if (!name || !source_url) return;
        const aircraftSel = form.querySelector('.edit-aircraft');
        const pilotSel = form.querySelector('.edit-pilot');
        const body = { name, source_url };
        if (aircraftSel) body.assigned_aircraft = aircraftSel.value || null;
        if (pilotSel) body.assigned_pilot = pilotSel.value ? parseInt(pilotSel.value, 10) : null;
        if (credState.isClear()) {
          body.credentials = null;
        } else if (credState.getValue()) {
          body.credentials = { password: credState.getValue() };
        }
        try {
          const resp = await fetch('/api/trackers/' + tracker.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (resp.ok) {
            const aircraftAdded = aircraftSel && body.assigned_aircraft && body.assigned_aircraft !== tracker.assigned_aircraft;
            const pilotAdded = pilotSel && body.assigned_pilot != null && body.assigned_pilot !== tracker.assigned_pilot;
            tracker.name = name;
            tracker.source_url = source_url;
            if (aircraftSel) tracker.assigned_aircraft = body.assigned_aircraft;
            if (pilotSel) tracker.assigned_pilot = body.assigned_pilot;
            renderSettingsTrackerList();
            settingsAfterTrackerChange();
            if (aircraftAdded || pilotAdded) await settingsOfferApplyAssignment(tracker, !!aircraftAdded, !!pilotAdded);
          }
        } catch (_) {}
      });

      cancelBtn.addEventListener('click', () => {
        form.remove();
        row.querySelector('.settings-aircraft-actions').style.display = '';
        row.classList.remove('editing');
      });
      row.appendChild(form);
    }

    // ── Tracker history import (#2) ──────────────────────────────────────────
    // A new tracker only fetches the last two days of its feed. This imports older history
    // in one-month windows (oldest first; the feed returns everything after d1 otherwise),
    // then labels flight origins/destinations a dozen boundary points at a time, paced for
    // the public Overpass API. Both loops run in this tab and stop if the form is closed.

    const _importIsoDate = (d) => d.toISOString().slice(0, 10);

    function _importWindows(fromIso) {
      const windows = [];
      let start = new Date(fromIso + 'T00:00:00Z');
      const now = new Date();
      while (start < now) {
        const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
        windows.push({ d1: _importIsoDate(start), d2: next < now ? _importIsoDate(next) : null, label: start });
        start = next;
      }
      return windows;
    }

    function settingsToggleImportForm(row, tracker) {
      const close = (el) => {
        el.remove();
        row.querySelector('.settings-aircraft-actions').style.display = '';
        row.classList.remove('editing');
      };
      const existing = row.querySelector('.settings-edit-form');
      if (existing) { close(existing); return; }

      row.querySelector('.settings-aircraft-actions').style.display = 'none';
      row.classList.add('editing');

      const form = document.createElement('div');
      form.className = 'settings-edit-form';

      const desc = document.createElement('p');
      desc.className = 'settings-section-desc';
      desc.textContent = 'Fetches older positions from this tracker\\'s feed and builds flights from them. Positions already stored are skipped, and no notifications are sent.';
      form.appendChild(desc);

      const unassigned = [];
      if (aircraftList.length > 0 && !tracker.assigned_aircraft) unassigned.push('aircraft');
      if (pilotList.length > 0 && tracker.assigned_pilot == null) unassigned.push('pilot');
      if (unassigned.length > 0) {
        const warn = document.createElement('p');
        warn.className = 'settings-section-desc settings-import-warning';
        warn.textContent = 'This tracker has no ' + unassigned.join(' or ') + ' assigned, so imported flights will be saved without one. Assign it with Edit first.';
        form.appendChild(warn);
      }

      const fromInput = document.createElement('input');
      fromInput.type = 'date';
      const yearAgo = new Date();
      yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
      fromInput.value = _importIsoDate(yearAgo);
      fromInput.max = _importIsoDate(new Date());
      form.appendChild(_lbl('Import from', fromInput));

      const status = document.createElement('p');
      status.className = 'settings-msg';
      status.setAttribute('aria-live', 'polite');
      form.appendChild(status);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'settings-edit-form-actions';
      const startBtn = document.createElement('button');
      startBtn.className = 'settings-action-btn save-edit-btn';
      startBtn.textContent = 'Import';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'settings-action-btn settings-cancel-btn';
      cancelBtn.textContent = 'Close';
      actionsDiv.appendChild(startBtn);
      actionsDiv.appendChild(cancelBtn);
      form.appendChild(actionsDiv);

      let cancelled = false;
      cancelBtn.addEventListener('click', () => { cancelled = true; close(form); });

      startBtn.addEventListener('click', async () => {
        if (!fromInput.value) return;
        startBtn.disabled = true;
        fromInput.disabled = true;
        let total = 0;
        const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
        for (const w of _importWindows(fromInput.value)) {
          if (cancelled || !form.isConnected) return;
          status.textContent = 'Importing ' + monthFmt.format(w.label) + '… ' + total.toLocaleString() + ' positions so far';
          try {
            const qs = 'd1=' + w.d1 + (w.d2 ? '&d2=' + w.d2 : '');
            const resp = await fetch('/api/trackers/' + tracker.id + '/import?' + qs, { method: 'POST' });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) throw new Error(data.error || ('HTTP ' + resp.status));
            total += data.inserted || 0;
          } catch (err) {
            status.textContent = 'Import stopped at ' + monthFmt.format(w.label) + ': ' + err.message + '. ' + total.toLocaleString() + ' positions imported; run it again from that month to continue.';
            startBtn.disabled = false;
            fromInput.disabled = false;
            fromInput.value = w.d1;
            return;
          }
        }
        if (total > 0) {
          try { await settingsOnClearCache(); } catch (_) {}
        }
        await _importDrainGeocoding(tracker, status, total, () => cancelled || !form.isConnected);
        startBtn.disabled = false;
        fromInput.disabled = false;
      });

      row.appendChild(form);
    }

    async function _importDrainGeocoding(tracker, status, imported, isCancelled) {
      const done = imported.toLocaleString() + ' positions imported. ';
      const PAUSE_MS = 20000;
      let last = null;
      let stalled = 0;
      while (!isCancelled()) {
        let remaining;
        try {
          const resp = await fetch('/api/trackers/' + tracker.id + '/geocode', { method: 'POST' });
          if (!resp.ok) break;
          remaining = (await resp.json()).remaining;
        } catch (_) { break; }
        if (remaining === 0) { status.textContent = done + 'All flights are labeled.'; return; }
        stalled = last !== null && remaining >= last ? stalled + 1 : 0;
        last = remaining;
        if (stalled >= 3) break;
        status.textContent = done + 'Labeling flight origins and destinations: ' + remaining.toLocaleString() + ' flights left. This is paced for the public place-lookup service, so keep this open; closing it pauses labeling.';
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
      if (!isCancelled()) {
        status.textContent = done + (last ? last.toLocaleString() + ' flights are still unlabeled (the place lookup found nothing nearby or is rate-limited). You can run the import again later to retry.' : '');
      }
    }

    // Points and flights are stamped with the tracker's assignment when they're ingested,
    // so after assigning an aircraft/pilot, offer to fill it in on the tracker's existing
    // flights that have none (deliberate per-flight assignments are left alone).
    async function settingsOfferApplyAssignment(tracker, aircraft, pilot) {
      try {
        const resp = await fetch('/api/trackers/' + tracker.id + '/unassigned');
        if (!resp.ok) return;
        const counts = await resp.json();
        const n = Math.max(aircraft ? counts.without_aircraft : 0, pilot ? counts.without_pilot : 0);
        if (n === 0) return;
        const parts = [];
        if (aircraft && counts.without_aircraft > 0) parts.push(tracker.assigned_aircraft);
        if (pilot && counts.without_pilot > 0) {
          const p = pilotList.find(p => p.id === tracker.assigned_pilot);
          parts.push(p ? p.name : 'the pilot');
        }
        const msg = n + ' existing flight' + (n === 1 ? '' : 's') + ' from ' + tracker.name
          + ' have no aircraft or pilot. Assign them to ' + parts.join(' / ') + ' too?';
        if (!confirm(msg)) return;
        const apply = await fetch('/api/trackers/' + tracker.id + '/apply-assignment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aircraft: aircraft && counts.without_aircraft > 0,
            pilot: pilot && counts.without_pilot > 0,
          }),
        });
        if (!apply.ok) alert('Failed to update existing flights.');
      } catch (_) {}
    }

    async function settingsToggleActive(tracker, btn) {
      btn.disabled = true;
      try {
        const resp = await fetch('/api/trackers/' + tracker.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: !tracker.active }),
        });
        if (resp.ok) {
          tracker.active = !tracker.active;
          renderSettingsTrackerList();
          settingsAfterTrackerChange();
        }
      } catch (_) {}
      btn.disabled = false;
    }

    async function settingsDeleteTracker(tracker) {
      if (!confirm('Delete ' + tracker.name + '? Historical data is preserved but the tracker will be hidden.')) return;
      try {
        const resp = await fetch('/api/trackers/' + tracker.id, { method: 'DELETE' });
        if (resp.ok) {
          const idx = trackerList.findIndex(t => t.id === tracker.id);
          if (idx !== -1) trackerList[idx] = { ...trackerList[idx], deleted: true, active: false };
          renderSettingsTrackerList();
          settingsAfterTrackerChange();
        } else {
          const data = await resp.json().catch(() => ({}));
          alert(data.error ?? 'Failed to delete tracker.');
        }
      } catch (_) {}
    }

    document.getElementById('settings-add-type').addEventListener('change', () => {
      const type = document.getElementById('settings-add-type').value;
      const credDiv = document.getElementById('settings-add-tracker-credentials');
      _addCredState = _buildCredentialFields(credDiv, type, 'add');
      const instrPanel = document.getElementById('settings-add-tracker-instructions');
      if (instrPanel.classList.contains('visible')) _renderInstructionsContent(instrPanel, type);
    });

    document.getElementById('settings-add-type-help').addEventListener('click', () => {
      const panel = document.getElementById('settings-add-tracker-instructions');
      panel.classList.toggle('visible');
      if (panel.classList.contains('visible')) {
        _renderInstructionsContent(panel, document.getElementById('settings-add-type').value);
      }
    });

    document.getElementById('settings-add-submit').addEventListener('click', async () => {
      const name = document.getElementById('settings-add-name').value.trim();
      const type = document.getElementById('settings-add-type').value.trim().toLowerCase();
      const sourceUrl = document.getElementById('settings-add-source-url').value.trim();
      if (!name || !type || !sourceUrl) return;
      const body = { name, type, source_url: sourceUrl };
      const credVal = _addCredState.getValue();
      if (credVal) body.credentials = { password: credVal };
      const aircraftSel = document.getElementById('settings-add-tracker-aircraft');
      const pilotSel = document.getElementById('settings-add-tracker-pilot');
      if (aircraftSel) body.assigned_aircraft = aircraftSel.value || null;
      if (pilotSel) body.assigned_pilot = pilotSel.value ? parseInt(pilotSel.value, 10) : null;
      // Polling starts right away and stamps points with the assignment at ingest (#3).
      const missing = [];
      if (aircraftSel && !body.assigned_aircraft) missing.push('aircraft');
      if (pilotSel && body.assigned_pilot == null) missing.push('pilot');
      if (missing.length > 0 && !confirm('No ' + missing.join(' or ') + ' selected. Flights from this tracker will be saved without one until you assign it. Add anyway?')) return;
      try {
        const resp = await fetch('/api/trackers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.ok) {
          const data = await resp.json();
          trackerList.push({
            id: data.id, name, type, source_url: sourceUrl, active: true, deleted: false,
            assigned_aircraft: body.assigned_aircraft ?? null,
            assigned_pilot: body.assigned_pilot ?? null,
          });
          settingsResetAddForm();
          document.getElementById('settings-add-tracker').open = false;
          renderSettingsTrackerList();
          settingsAfterTrackerChange();
        } else {
          const data = await resp.json().catch(() => ({}));
          alert(data.error ?? 'Failed to add tracker.');
        }
      } catch (_) {}
    });

    document.getElementById('settings-clear-cache').addEventListener('click', async () => {
      if (!flightStore) return;
      if (!confirm('Clear the local flight cache and re-download all data?')) return;
      try {
        closeSettings();
        await settingsOnClearCache();
      } catch (_) {}
    });

    function settingsResetAddForm() {
      document.getElementById('settings-add-name').value = '';
      document.getElementById('settings-add-type').selectedIndex = 0;
      document.getElementById('settings-add-source-url').value = '';
      document.getElementById('settings-add-test-status').textContent = '';
      document.getElementById('settings-add-tracker-instructions').classList.remove('visible');

      const credDiv = document.getElementById('settings-add-tracker-credentials');
      _addCredState = _buildCredentialFields(credDiv, 'inreach', 'add');

      const assignDiv = document.getElementById('settings-add-tracker-assignments');
      assignDiv.innerHTML = '';
      const activePilots = pilotList.filter(p => p.active);
      if (aircraftList.length > 0) {
        const sel = document.createElement('select');
        sel.id = 'settings-add-tracker-aircraft';
        const noOpt = document.createElement('option');
        noOpt.value = '';
        noOpt.textContent = 'No aircraft';
        sel.appendChild(noOpt);
        for (const a of aircraftList) {
          const opt = document.createElement('option');
          opt.value = a.tail_number;
          opt.textContent = a.tail_number + (a.name ? ' – ' + a.name : '');
          sel.appendChild(opt);
        }
        assignDiv.appendChild(_lbl('Aircraft', sel));
      }
      if (activePilots.length > 0) {
        const sel = document.createElement('select');
        sel.id = 'settings-add-tracker-pilot';
        const noOpt = document.createElement('option');
        noOpt.value = '';
        noOpt.textContent = 'No pilot';
        sel.appendChild(noOpt);
        for (const p of activePilots) {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name;
          sel.appendChild(opt);
        }
        assignDiv.appendChild(_lbl('Pilot', sel));
      }
    }

    document.getElementById('settings-add-tracker').addEventListener('toggle', () => {
      if (document.getElementById('settings-add-tracker').open) settingsResetAddForm();
    });

    document.getElementById('settings-add-test').addEventListener('click', async () => {
      const sourceUrl = document.getElementById('settings-add-source-url').value.trim();
      const status = document.getElementById('settings-add-test-status');
      if (!sourceUrl) { status.textContent = 'Enter the MapShare URL first.'; return; }
      const btn = document.getElementById('settings-add-test');
      btn.disabled = true;
      status.textContent = 'Checking the feed…';
      const body = { source_url: sourceUrl };
      const credVal = _addCredState.getValue();
      if (credVal) body.credentials = { password: credVal };
      try {
        const resp = await fetch('/api/trackers/test-feed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.ok) {
          status.textContent = 'The feed didn\\'t work: ' + (data.error || ('HTTP ' + resp.status)) + '. Check the URL and, if the MapShare page has one, the password.';
        } else if (data.points === 0) {
          status.textContent = 'The feed works, but it has no positions from the last 30 days.';
        } else {
          status.textContent = 'The feed works: ' + data.points.toLocaleString() + ' positions in the last 30 days, latest '
            + new Date(data.latest * 1000).toLocaleString() + '.';
        }
      } catch (_) {
        status.textContent = 'Couldn\\'t reach the server.';
      }
      btn.disabled = false;
    });

    document.getElementById('settings-add-cancel').addEventListener('click', () => {
      settingsResetAddForm();
      document.getElementById('settings-add-tracker').open = false;
    });

    // ── Aircraft section ──────────────────────────────────────────────────────

    function renderSettingsAircraftList() {
      const container = document.getElementById('settings-aircraft-list');
      if (!container) return;
      container.innerHTML = '';
      if (!aircraftList || aircraftList.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'settings-msg';
        msg.textContent = 'No aircraft configured.';
        container.appendChild(msg);
        return;
      }
      for (const a of aircraftList) {
        const row = document.createElement('div');
        row.className = 'settings-aircraft-row' + (a.active ? '' : ' settings-aircraft-inactive');
        const info = document.createElement('div');
        info.className = 'settings-aircraft-info';
        const nameEl = document.createElement('span');
        nameEl.className = 'settings-aircraft-name';
        nameEl.textContent = a.tail_number + (a.name ? ' – ' + a.name : '');
        info.appendChild(nameEl);
        const actions = document.createElement('div');
        actions.className = 'settings-aircraft-actions';
        const infoBtn = document.createElement('button');
        infoBtn.className = 'settings-action-btn';
        infoBtn.textContent = 'Info';
        infoBtn.addEventListener('click', () => openAircraftInfo(a));
        actions.appendChild(infoBtn);
        row.appendChild(info);
        row.appendChild(actions);
        container.appendChild(row);
      }
    }

    document.getElementById('settings-add-aircraft-submit').addEventListener('click', async () => {
      const tail = document.getElementById('settings-add-aircraft-tail').value.trim().toUpperCase();
      const name = document.getElementById('settings-add-aircraft-name').value.trim() || null;
      if (!tail) return;
      try {
        const resp = await fetch('/api/aircraft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tail_number: tail, name }),
        });
        if (resp.ok) {
          aircraftList.push({ tail_number: tail, name, active: true });
          document.getElementById('settings-add-aircraft-tail').value = '';
          document.getElementById('settings-add-aircraft-name').value = '';
          document.getElementById('settings-add-aircraft').open = false;
          renderSettingsAircraftList();
        } else {
          const d = await resp.json().catch(() => ({}));
          alert(d.error ?? 'Failed to add aircraft.');
        }
      } catch (_) {}
    });

    document.getElementById('settings-add-aircraft-cancel').addEventListener('click', () => {
      document.getElementById('settings-add-aircraft-tail').value = '';
      document.getElementById('settings-add-aircraft-name').value = '';
      document.getElementById('settings-add-aircraft').open = false;
    });

    // ── Pilots section ────────────────────────────────────────────────────────

    function renderSettingsPilotList() {
      const container = document.getElementById('settings-pilots-list');
      if (!container) return;
      container.innerHTML = '';
      if (!pilotList || pilotList.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'settings-msg';
        msg.textContent = 'No pilots configured.';
        container.appendChild(msg);
        return;
      }
      for (const p of pilotList) {
        const row = document.createElement('div');
        row.className = 'settings-aircraft-row' + (p.active ? '' : ' settings-aircraft-inactive');
        const info = document.createElement('div');
        info.className = 'settings-aircraft-info';
        const nameEl = document.createElement('span');
        nameEl.className = 'settings-aircraft-name';
        nameEl.textContent = p.name;
        info.appendChild(nameEl);
        const actions = document.createElement('div');
        actions.className = 'settings-aircraft-actions';
        const infoBtn = document.createElement('button');
        infoBtn.className = 'settings-action-btn';
        infoBtn.textContent = 'Info';
        infoBtn.addEventListener('click', () => openPilotDuty(p.id, p.name));
        actions.appendChild(infoBtn);
        if (_settingsUser?.role === 'admin') {
          const editBtn = document.createElement('button');
          editBtn.className = 'settings-action-btn';
          editBtn.textContent = 'Rename';
          editBtn.addEventListener('click', () => settingsTogglePilotEdit(row, p));
          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'settings-action-btn';
          toggleBtn.textContent = p.active ? 'Hide' : 'Show';
          toggleBtn.addEventListener('click', async () => {
            toggleBtn.disabled = true;
            try {
              const resp = await fetch('/api/pilots/' + p.id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: !p.active }),
              });
              if (resp.ok) { p.active = !p.active; renderSettingsPilotList(); }
            } catch (_) {}
            toggleBtn.disabled = false;
          });
          actions.appendChild(editBtn);
          actions.appendChild(toggleBtn);
        }
        row.appendChild(info);
        row.appendChild(actions);
        container.appendChild(row);
      }
    }

    function settingsTogglePilotEdit(row, pilot) {
      const existing = row.querySelector('.settings-edit-form');
      if (existing) {
        existing.remove();
        row.querySelector('.settings-aircraft-actions').style.display = '';
        row.classList.remove('editing');
        return;
      }
      row.querySelector('.settings-aircraft-actions').style.display = 'none';
      row.classList.add('editing');
      const form = document.createElement('div');
      form.className = 'settings-edit-form';
      form.innerHTML =
        '<input type="text" class="edit-pilot-name" placeholder="Pilot name" value="' + settingsEscAttr(pilot.name) + '" />' +
        '<div class="settings-edit-form-actions">' +
          '<button class="settings-action-btn save-edit-btn">Save</button>' +
          '<button class="settings-action-btn settings-cancel-btn">Cancel</button>' +
        '</div>';
      form.querySelector('.save-edit-btn').addEventListener('click', async () => {
        const name = form.querySelector('.edit-pilot-name').value.trim();
        if (!name) return;
        try {
          const resp = await fetch('/api/pilots/' + pilot.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          if (resp.ok) { pilot.name = name; renderSettingsPilotList(); }
        } catch (_) {}
      });
      form.querySelector('.settings-cancel-btn').addEventListener('click', () => {
        form.remove();
        row.querySelector('.settings-aircraft-actions').style.display = '';
        row.classList.remove('editing');
      });
      row.appendChild(form);
    }

    document.getElementById('settings-add-pilot-submit').addEventListener('click', async () => {
      const name = document.getElementById('settings-add-pilot-name').value.trim();
      if (!name) return;
      try {
        const resp = await fetch('/api/pilots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (resp.ok) {
          const d = await resp.json();
          pilotList.push({ id: d.id, name, active: true });
          document.getElementById('settings-add-pilot-name').value = '';
          document.getElementById('settings-add-pilot').open = false;
          renderSettingsPilotList();
        } else {
          const d = await resp.json().catch(() => ({}));
          alert(d.error ?? 'Failed to add pilot.');
        }
      } catch (_) {}
    });

    document.getElementById('settings-add-pilot-cancel').addEventListener('click', () => {
      document.getElementById('settings-add-pilot-name').value = '';
      document.getElementById('settings-add-pilot').open = false;
    });

    function settingsEscAttr(s) {
      return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function settingsAircraftOptionHtml(a, selectedTail) {
      return '<option value="' + settingsEscAttr(a.tail_number) + '"' +
        (a.tail_number === selectedTail ? ' selected' : '') + '>' +
        settingsEscAttr(a.tail_number + (a.name ? ' – ' + a.name : '')) + '</option>';
    }

    function settingsPilotOptionHtml(p, selectedId) {
      return '<option value="' + p.id + '"' +
        (p.id === selectedId ? ' selected' : '') + '>' +
        settingsEscAttr(p.name) + '</option>';
    }

    // ── Link display card ─────────────────────────────────────────────────────

    function settingsCreateLinkPanel(url, label, onDone) {
      const card = document.createElement('div');
      card.className = 'settings-link-card';

      if (label) {
        const labelEl = document.createElement('span');
        labelEl.className = 'settings-link-card-label';
        labelEl.textContent = label;
        card.appendChild(labelEl);
      }

      const urlRow = document.createElement('div');
      urlRow.className = 'settings-link-url-row';
      const urlText = document.createElement('span');
      urlText.className = 'settings-link-url-text';
      urlText.textContent = url;
      const copyBtn = document.createElement('button');
      copyBtn.className = 'settings-action-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(url); } catch (_) { prompt('Copy this link:', url); }
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      });
      urlRow.appendChild(urlText);
      urlRow.appendChild(copyBtn);
      card.appendChild(urlRow);

      const qrWrap = document.createElement('div');
      qrWrap.className = 'settings-link-qr';
      card.appendChild(qrWrap);
      if (typeof QRCode !== 'undefined') {
        try { new QRCode(qrWrap, { text: url, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M }); } catch (_) {}
      }

      const doneBtn = document.createElement('button');
      doneBtn.className = 'settings-action-btn';
      doneBtn.textContent = 'Done';
      doneBtn.addEventListener('click', onDone);
      card.appendChild(doneBtn);

      return card;
    }

    // ── Devices section ───────────────────────────────────────────────────────

    async function renderSettingsDevicesList() {
      const container = document.getElementById('settings-devices-list');
      if (!container) return;
      container.innerHTML = '<p class="settings-msg">Loading&hellip;</p>';
      try {
        const resp = await fetch('/api/me/sessions');
        if (!resp.ok) { container.innerHTML = '<p class="settings-msg">Failed to load devices.</p>'; return; }
        const data = await resp.json();
        container.innerHTML = '';
        // Account heading
        const acctHeader = document.createElement('div');
        acctHeader.className = 'settings-devices-account';
        const acctLabel = document.createElement('span');
        acctLabel.className = 'settings-devices-account-label';
        acctLabel.textContent = 'Signed in as';
        const acctName = document.createElement('span');
        acctName.className = 'settings-devices-account-name';
        acctName.textContent = _settingsUser?.name ?? 'My Account';
        const acctRole = document.createElement('span');
        acctRole.className = 'settings-devices-account-role';
        acctRole.textContent = _settingsUser?.role === 'admin' ? 'Admin' : 'Viewer';
        acctHeader.appendChild(acctLabel);
        acctHeader.appendChild(acctName);
        acctHeader.appendChild(acctRole);
        container.appendChild(acctHeader);

        for (const session of data.sessions) {
          const row = document.createElement('div');
          row.className = 'settings-aircraft-row';
          const info = document.createElement('div');
          info.className = 'settings-aircraft-info';
          const nameEl = document.createElement('span');
          nameEl.className = 'settings-aircraft-name';
          nameEl.textContent = session.device_name ?? 'Unnamed device';
          const subEl = document.createElement('span');
          subEl.className = 'settings-aircraft-sub';
          const lastSeen = new Date(session.last_seen_at * 1000);
          subEl.textContent = 'Last seen ' + lastSeen.toLocaleDateString();
          if (session.id === _settingsUser?.session_id) {
            subEl.textContent += ' · This device';
          }
          info.appendChild(nameEl);
          info.appendChild(subEl);
          const actions = document.createElement('div');
          actions.className = 'settings-aircraft-actions';
          const renameBtn = document.createElement('button');
          renameBtn.className = 'settings-action-btn';
          renameBtn.textContent = 'Rename';
          renameBtn.addEventListener('click', () => settingsToggleDeviceRename(row, session));
          actions.appendChild(renameBtn);
          if (session.id === _settingsUser?.session_id) {
            const signOutBtn = document.createElement('button');
            signOutBtn.className = 'settings-danger-btn';
            signOutBtn.textContent = 'Sign out';
            signOutBtn.addEventListener('click', async () => {
              try { await fetch('/logout', { method: 'POST' }); } finally {
                window.location.href = '/login';
              }
            });
            actions.appendChild(signOutBtn);
          } else {
            const revokeBtn = document.createElement('button');
            revokeBtn.className = 'settings-action-btn';
            revokeBtn.textContent = 'Revoke';
            revokeBtn.addEventListener('click', () => settingsRevokeDevice(session, revokeBtn));
            actions.appendChild(revokeBtn);
          }
          row.appendChild(info);
          row.appendChild(actions);
          container.appendChild(row);
        }
        // "Get device link" row
        const linkRow = document.createElement('div');
        linkRow.className = 'settings-aircraft-row';
        const linkInfo = document.createElement('div');
        linkInfo.className = 'settings-aircraft-info';
        const linkTitle = document.createElement('span');
        linkTitle.className = 'settings-aircraft-name';
        linkTitle.textContent = 'Add another device';
        const linkDesc = document.createElement('span');
        linkDesc.className = 'settings-aircraft-sub';
        linkDesc.textContent = 'Get a sign-in link valid for 24 hours to add another device.';
        linkInfo.appendChild(linkTitle);
        linkInfo.appendChild(linkDesc);
        const linkActions = document.createElement('div');
        linkActions.className = 'settings-aircraft-actions';
        const linkBtn = document.createElement('button');
        linkBtn.className = 'settings-action-btn';
        linkBtn.textContent = 'Get link';
        linkBtn.addEventListener('click', () => settingsGenerateDeviceLink(linkBtn));
        linkActions.appendChild(linkBtn);
        linkRow.appendChild(linkInfo);
        linkRow.appendChild(linkActions);
        container.appendChild(linkRow);
      } catch (_) {
        container.innerHTML = '<p class="settings-msg">Failed to load devices.</p>';
      }
    }

    function settingsToggleDeviceRename(row, session) {
      const existing = row.querySelector('.settings-edit-form');
      if (existing) {
        existing.remove();
        row.querySelector('.settings-aircraft-actions').style.display = '';
        row.classList.remove('editing');
        return;
      }
      row.querySelector('.settings-aircraft-actions').style.display = 'none';
      row.classList.add('editing');
      const form = document.createElement('div');
      form.className = 'settings-edit-form';
      form.innerHTML =
        '<input type="text" class="edit-device-name" placeholder="Device name" value="' + settingsEscAttr(session.device_name ?? '') + '" />' +
        '<div class="settings-edit-form-actions">' +
          '<button class="settings-action-btn save-edit-btn">Save</button>' +
          '<button class="settings-action-btn settings-cancel-btn">Cancel</button>' +
        '</div>';
      form.querySelector('.save-edit-btn').addEventListener('click', async () => {
        const name = form.querySelector('.edit-device-name').value.trim();
        try {
          const resp = await fetch('/api/me/sessions/' + session.id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_name: name }),
          });
          if (resp.ok) { session.device_name = name || null; renderSettingsDevicesList(); }
        } catch (_) {}
      });
      form.querySelector('.settings-cancel-btn').addEventListener('click', () => {
        form.remove();
        row.querySelector('.settings-aircraft-actions').style.display = '';
        row.classList.remove('editing');
      });
      row.appendChild(form);
    }

    async function settingsRevokeDevice(session, btn) {
      if (!confirm('Revoke access for "' + (session.device_name ?? 'this device') + '"? It will be signed out.')) return;
      btn.disabled = true;
      try {
        const resp = await fetch('/api/me/sessions/' + session.id, { method: 'DELETE' });
        if (resp.ok) renderSettingsDevicesList();
        else btn.disabled = false;
      } catch (_) { btn.disabled = false; }
    }

    async function settingsGenerateDeviceLink(btn) {
      btn.disabled = true;
      btn.textContent = 'Loading…';
      try {
        const resp = await fetch('/api/me/device-link', { method: 'POST' });
        if (resp.ok) {
          const data = await resp.json();
          const url = window.location.origin + data.url;
          const row = btn.closest('.settings-aircraft-row');
          const actions = row.querySelector('.settings-aircraft-actions');
          actions.style.display = 'none';
          row.classList.add('editing');
          const card = settingsCreateLinkPanel(url, 'Sign-in link — valid for 24 hours', () => {
            card.remove();
            actions.style.display = '';
            row.classList.remove('editing');
            btn.textContent = 'Get link';
            btn.disabled = false;
          });
          row.appendChild(card);
        } else {
          btn.textContent = 'Get link';
          btn.disabled = false;
        }
      } catch (_) {
        btn.textContent = 'Get link';
        btn.disabled = false;
      }
    }

    // ── Users section (admin only) ────────────────────────────────────────────

    async function renderSettingsUsersList() {
      const container = document.getElementById('settings-users-list');
      if (!container) return;
      container.innerHTML = '<p class="settings-msg">Loading&hellip;</p>';
      try {
        const [usersResp, invitesResp] = await Promise.all([
          fetch('/api/users'),
          fetch('/api/invites'),
        ]);
        container.innerHTML = '';
        if (usersResp.ok) {
          const data = await usersResp.json();
          for (const user of data.users) {
            const row = document.createElement('div');
            row.className = 'settings-aircraft-row';
            const info = document.createElement('div');
            info.className = 'settings-aircraft-info';
            const nameEl = document.createElement('span');
            nameEl.className = 'settings-aircraft-name';
            nameEl.textContent = user.name;
            const subEl = document.createElement('span');
            subEl.className = 'settings-aircraft-sub';
            subEl.textContent = (user.role === 'admin' ? 'Admin' : 'Viewer') +
              (user.is_env_admin ? ' · Shared account' : '') +
              ' · ' + user.device_count + ' device' + (user.device_count !== 1 ? 's' : '');
            info.appendChild(nameEl);
            info.appendChild(subEl);
            const actions = document.createElement('div');
            actions.className = 'settings-aircraft-actions';
            if (!user.is_env_admin && user.id !== _settingsUser?.id) {
              const deleteBtn = document.createElement('button');
              deleteBtn.className = 'settings-danger-btn';
              deleteBtn.textContent = 'Delete';
              deleteBtn.addEventListener('click', () => settingsRevokeUser(user, deleteBtn));
              actions.appendChild(deleteBtn);
            }
            row.appendChild(info);
            row.appendChild(actions);
            container.appendChild(row);
          }
        }
        if (invitesResp.ok) {
          const data = await invitesResp.json();
          for (const invite of data.invites) {
            const row = document.createElement('div');
            row.className = 'settings-aircraft-row settings-aircraft-inactive';
            const info = document.createElement('div');
            info.className = 'settings-aircraft-info';
            const nameEl = document.createElement('span');
            nameEl.className = 'settings-aircraft-name';
            nameEl.textContent = invite.invited_name + ' (invite pending)';
            const subEl = document.createElement('span');
            subEl.className = 'settings-aircraft-sub';
            const exp = new Date(invite.expires_at * 1000);
            subEl.textContent = (invite.invited_role === 'admin' ? 'Admin' : 'Viewer') + ' · Expires ' + exp.toLocaleDateString();
            info.appendChild(nameEl);
            info.appendChild(subEl);
            const actions = document.createElement('div');
            actions.className = 'settings-aircraft-actions';
            const copyBtn = document.createElement('button');
            copyBtn.className = 'settings-action-btn';
            copyBtn.textContent = 'Show link';
            copyBtn.addEventListener('click', () => {
              const url = window.location.origin + '/join/' + invite.token;
              const actions = row.querySelector('.settings-aircraft-actions');
              actions.style.display = 'none';
              row.classList.add('editing');
              const panel = settingsCreateLinkPanel(url, 'Invite link for ' + invite.invited_name, () => {
                panel.remove();
                actions.style.display = '';
                row.classList.remove('editing');
              });
              row.appendChild(panel);
            });
            const revokeBtn = document.createElement('button');
            revokeBtn.className = 'settings-action-btn';
            revokeBtn.textContent = 'Revoke';
            revokeBtn.addEventListener('click', () => settingsRevokeInvite(invite, revokeBtn));
            actions.appendChild(copyBtn);
            actions.appendChild(revokeBtn);
            row.appendChild(info);
            row.appendChild(actions);
            container.appendChild(row);
          }
        }
      } catch (_) {
        container.innerHTML = '<p class="settings-msg">Failed to load users.</p>';
      }
    }

    async function settingsRevokeUser(user, btn) {
      if (!confirm('Remove ' + user.name + '? All their sessions will be deleted.')) return;
      btn.disabled = true;
      try {
        const resp = await fetch('/api/users/' + user.id, { method: 'DELETE' });
        if (resp.ok) renderSettingsUsersList();
        else { const d = await resp.json().catch(() => ({})); alert(d.error ?? 'Failed to remove user.'); btn.disabled = false; }
      } catch (_) { btn.disabled = false; }
    }

    async function settingsRevokeInvite(invite, btn) {
      btn.disabled = true;
      try {
        const resp = await fetch('/api/invites/' + invite.id, { method: 'DELETE' });
        if (resp.ok) renderSettingsUsersList();
        else btn.disabled = false;
      } catch (_) { btn.disabled = false; }
    }

    document.getElementById('settings-invite-submit').addEventListener('click', async () => {
      const name = document.getElementById('settings-invite-name').value.trim();
      const role = document.getElementById('settings-invite-role').value;
      if (!name) return;
      const submitBtn = document.getElementById('settings-invite-submit');
      submitBtn.disabled = true;
      try {
        const resp = await fetch('/api/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, role }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const url = window.location.origin + data.url;
          const inner = document.getElementById('settings-invite-form').querySelector('.settings-add-inner');
          const nameInput = document.getElementById('settings-invite-name');
          const roleSelect = document.getElementById('settings-invite-role');
          const actionsDiv = inner.querySelector('.settings-add-actions');
          [nameInput, roleSelect, actionsDiv].forEach(el => { el.style.display = 'none'; });
          const card = settingsCreateLinkPanel(url, 'Invite link for ' + name, () => {
            nameInput.value = '';
            [nameInput, roleSelect, actionsDiv].forEach(el => { el.style.display = ''; });
            card.remove();
            document.getElementById('settings-invite-form').open = false;
            submitBtn.disabled = false;
            renderSettingsUsersList();
          });
          inner.appendChild(card);
        } else {
          const d = await resp.json().catch(() => ({}));
          alert(d.error ?? 'Failed to create invite.');
          submitBtn.disabled = false;
        }
      } catch (_) { submitBtn.disabled = false; }
    });

    document.getElementById('settings-invite-cancel').addEventListener('click', () => {
      document.getElementById('settings-invite-name').value = '';
      document.getElementById('settings-invite-form').open = false;
    });

    // ── Global settings (admin only) ──────────────────────────────────────────

    let _tenantTzPopulated = false;

    function _populateTenantTimezoneSelect() {
      if (_tenantTzPopulated) return;
      const sel = document.getElementById('settings-tenant-timezone');
      for (const tz of Intl.supportedValuesOf('timeZone')) {
        const opt = document.createElement('option');
        opt.value = tz;
        opt.textContent = tz;
        sel.appendChild(opt);
      }
      _tenantTzPopulated = true;
    }

    async function _loadTenantSettingsForm() {
      try {
        const resp = await fetch('/api/settings');
        if (!resp.ok) return;
        const d = await resp.json();
        document.getElementById('settings-tenant-name').value = d.app_name ?? '';
        document.getElementById('settings-tenant-timezone').value = d.timezone ?? '';
        document.getElementById('settings-tenant-lat').value = d.map_default_lat ?? '';
        document.getElementById('settings-tenant-lng').value = d.map_default_lng ?? '';
        document.getElementById('settings-tenant-zoom').value = d.map_default_zoom ?? '';
        document.getElementById('settings-tenant-gap-minutes').value = d.gap_alert_minutes ?? '';
        document.getElementById('settings-tenant-pushover-token').value = d.pushover_api_token ?? '';
      } catch (_) {}
    }

    async function _openTenantSettings() {
      _settingsNavigateTo('settings-view-tenant', 'Global Settings');
      _populateTenantTimezoneSelect();
      await _loadTenantSettingsForm();
      await renderSettingsWebhooksList();
    }

    document.getElementById('settings-tenant-open-btn').addEventListener('click', _openTenantSettings);

    document.getElementById('settings-tenant-save').addEventListener('click', async () => {
      const statusEl = document.getElementById('settings-tenant-status');
      const body = {
        app_name: document.getElementById('settings-tenant-name').value.trim(),
        timezone: document.getElementById('settings-tenant-timezone').value,
        map_default_lat: parseFloat(document.getElementById('settings-tenant-lat').value),
        map_default_lng: parseFloat(document.getElementById('settings-tenant-lng').value),
        map_default_zoom: parseInt(document.getElementById('settings-tenant-zoom').value, 10),
        gap_alert_minutes: parseInt(document.getElementById('settings-tenant-gap-minutes').value, 10),
      };
      if (!body.app_name || !body.timezone) return;
      try {
        const resp = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        statusEl.style.display = '';
        statusEl.textContent = resp.ok ? 'Saved.' : 'Failed to save.';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      } catch (_) {
        statusEl.style.display = '';
        statusEl.textContent = 'Failed to save.';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      }
    });

    document.getElementById('settings-pushover-token-save').addEventListener('click', async () => {
      const statusEl = document.getElementById('settings-pushover-token-status');
      const value = document.getElementById('settings-tenant-pushover-token').value.trim();
      try {
        const resp = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pushover_api_token: value }),
        });
        statusEl.style.display = '';
        statusEl.textContent = resp.ok ? 'Saved.' : 'Failed to save.';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      } catch (_) {
        statusEl.style.display = '';
        statusEl.textContent = 'Failed to save.';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      }
    });

    // ── Webhooks (admin only) ─────────────────────────────────────────────────

    const WEBHOOK_EVENT_LABELS = { takeoff: 'Takeoff', landing: 'Landing', gap: 'Gap' };

    document.querySelectorAll('#settings-add-webhook-type input[type="radio"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const isPushover = document.querySelector('#settings-add-webhook-type input:checked').value === 'pushover';
        document.getElementById('settings-add-webhook-url').style.display = isPushover ? 'none' : '';
        document.getElementById('settings-add-webhook-pushover-key').style.display = isPushover ? '' : 'none';
      });
    });

    async function renderSettingsWebhooksList() {
      const container = document.getElementById('settings-webhooks-list');
      if (!container) return;
      container.innerHTML = '<p class="settings-msg">Loading&hellip;</p>';
      try {
        const resp = await fetch('/api/webhooks');
        if (!resp.ok) { container.innerHTML = '<p class="settings-msg">Failed to load webhooks.</p>'; return; }
        const data = await resp.json();
        container.innerHTML = '';
        if (data.webhooks.length === 0) {
          container.innerHTML = '<p class="settings-msg">No webhooks configured.</p>';
          return;
        }
        for (const hook of data.webhooks) {
          const row = document.createElement('div');
          row.className = 'settings-aircraft-row' + (hook.active ? '' : ' settings-aircraft-inactive');
          const info = document.createElement('div');
          info.className = 'settings-aircraft-info';
          const nameEl = document.createElement('span');
          nameEl.className = 'settings-aircraft-name';
          nameEl.textContent = hook.label || (hook.type === 'pushover' ? 'Pushover' : hook.url);
          const subEl = document.createElement('span');
          subEl.className = 'settings-aircraft-sub';
          let events = [];
          try { events = JSON.parse(hook.events); } catch (_) {}
          const eventsText = events.map((e) => WEBHOOK_EVENT_LABELS[e] || e).join(', ');
          const typeText = hook.type === 'pushover' ? 'Pushover' : 'Webhook';
          let statusText = hook.last_triggered_at
            ? 'Last: ' + (hook.last_status != null ? 'HTTP ' + hook.last_status : 'failed') + ' at ' + new Date(hook.last_triggered_at * 1000).toLocaleString()
            : 'Never triggered';
          subEl.textContent = typeText + ' · ' + eventsText + ' · ' + statusText;
          if (hook.last_error) subEl.title = hook.last_error;
          info.appendChild(nameEl);
          info.appendChild(subEl);
          const actions = document.createElement('div');
          actions.className = 'settings-aircraft-actions';
          const toggleBtn = document.createElement('button');
          toggleBtn.className = 'settings-action-btn';
          toggleBtn.textContent = hook.active ? 'Disable' : 'Enable';
          toggleBtn.addEventListener('click', () => settingsToggleWebhook(hook, toggleBtn));
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'settings-danger-btn';
          deleteBtn.textContent = 'Delete';
          deleteBtn.addEventListener('click', () => settingsDeleteWebhook(hook, deleteBtn));
          actions.appendChild(toggleBtn);
          actions.appendChild(deleteBtn);
          row.appendChild(info);
          row.appendChild(actions);
          container.appendChild(row);
        }
      } catch (_) {
        container.innerHTML = '<p class="settings-msg">Failed to load webhooks.</p>';
      }
    }

    async function settingsToggleWebhook(hook, btn) {
      btn.disabled = true;
      try {
        const resp = await fetch('/api/webhooks/' + hook.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: !hook.active }),
        });
        if (resp.ok) renderSettingsWebhooksList();
        else btn.disabled = false;
      } catch (_) { btn.disabled = false; }
    }

    async function settingsDeleteWebhook(hook, btn) {
      if (!confirm('Delete this webhook?')) return;
      btn.disabled = true;
      try {
        const resp = await fetch('/api/webhooks/' + hook.id, { method: 'DELETE' });
        if (resp.ok) renderSettingsWebhooksList();
        else btn.disabled = false;
      } catch (_) { btn.disabled = false; }
    }

    document.getElementById('settings-add-webhook-submit').addEventListener('click', async () => {
      const statusEl = document.getElementById('settings-webhooks-status');
      const type = document.querySelector('#settings-add-webhook-type input:checked').value;
      const url = document.getElementById('settings-add-webhook-url').value.trim();
      const pushoverUserKey = document.getElementById('settings-add-webhook-pushover-key').value.trim();
      const label = document.getElementById('settings-add-webhook-label').value.trim();
      const events = Array.from(
        document.querySelectorAll('#settings-add-webhook-events input:checked')
      ).map((el) => el.value);
      if (events.length === 0) return;
      if (type === 'webhook' && !url) return;
      if (type === 'pushover' && !pushoverUserKey) return;

      const body = type === 'pushover'
        ? { type, pushover_user_key: pushoverUserKey, label: label || null, events }
        : { type, url, label: label || null, events };

      try {
        const resp = await fetch('/api/webhooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.ok) {
          document.getElementById('settings-add-webhook-url').value = '';
          document.getElementById('settings-add-webhook-pushover-key').value = '';
          document.getElementById('settings-add-webhook-label').value = '';
          document.getElementById('settings-add-webhook').open = false;
          renderSettingsWebhooksList();
        } else {
          const d = await resp.json().catch(() => ({}));
          statusEl.style.display = '';
          statusEl.textContent = d.error ?? 'Failed to add notification target.';
          setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
        }
      } catch (_) {
        statusEl.style.display = '';
        statusEl.textContent = 'Failed to add notification target.';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      }
    });

    document.getElementById('settings-add-webhook-cancel').addEventListener('click', () => {
      document.getElementById('settings-add-webhook').open = false;
    });

    // ── Regions export / import ───────────────────────────────────────────────

    document.getElementById('settings-regions-export').addEventListener('click', () => {
      _downloadGeoJSON('/api/regions', 'regions.geojson');
    });

    document.getElementById('settings-regions-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await _importGeoJSON(file, 'settings-regions-status', '/api/regions/import');
      e.target.value = '';
    });

    // ── Shared map-editor helpers (used by both editor scripts below) ─────────

    function _setEditorStatus(elId, msg, isError) {
      const el = document.getElementById(elId);
      el.textContent = msg;
      el.style.color = isError ? 'var(--danger-fg)' : '';
    }

    async function _downloadGeoJSON(apiUrl, filename) {
      try {
        const resp = await fetch(apiUrl);
        if (!resp.ok) return;
        const blob = new Blob([await resp.text()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch (_) {}
    }

    async function _importGeoJSON(file, statusElId, apiUrl) {
      const statusEl = document.getElementById(statusElId);
      try {
        const text = await file.text();
        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: text,
        });
        statusEl.style.display = '';
        statusEl.textContent = resp.ok ? 'Imported.' : 'Import failed.';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      } catch (_) {
        statusEl.style.display = '';
        statusEl.textContent = 'Import failed.';
        setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
      }
    }

    ${namedPointsEditorScript()}

    ${regionsEditorScript()}

    ${mapViewPickerScript()}

    ${setupGuideScript()}

  `;
}
