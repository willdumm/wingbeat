import { namedPointsEditorMarkup, namedPointsEditorScript } from './named-points-editor';
import { regionsEditorMarkup, regionsEditorScript } from './regions-editor';
import { mapLayersSettingsRowsMarkup, mapLayersSettingsScript } from './map-controls';
import { basemapSettingsMarkup, basemapSettingsScript } from './basemap-settings';
import { icon } from './icons';
import { escapeHtml } from './html';
import { logoLockupMarkup } from './brand';
import { darkTokens } from '@wingbeat/core/tokens';
import { docsLinkMarkup } from './help';
import { pilotDutyMarkup, typstLoadOverlayMarkup } from './pilot-duty';
import { flightEditorMarkup } from './flight-editor';
import { formControlStyles } from './form-modal';
import { aircraftInfoMarkup } from './aircraft-info';
import { mapViewPickerMarkup, mapViewPickerStyles, mapViewPickerScript } from './map-view-picker';
import { rowMenuStyles, rowMenuScript } from './row-menu';
import { statusChip } from './status';
import { setupGuideMarkup, setupGuideAdminRowMarkup, setupGuideStyles, setupGuideScript } from './setup-guide';

/**
 * Settings — shared between dashboard and analytics pages: a full-screen overlay with a
 * sidebar of pages, grouped by whom a change reaches (this browser, your account, everyone
 * on the instance), at #settings/<page>. Under 720px wide the sidebar is a list that each
 * page slides in over. The duty log, flight editor, aircraft info and map editors are
 * detail views that slide over the pages (_settingsNavigateTo).
 *
 * Each page includes settingsModalMarkup(appName) in its HTML, settingsModalStyles()
 * in its <style>, and settingsModalScript() inside its IIFE, and calls
 * settingsOpenFromUrl() once its trackers are loaded.
 *
 * The modal references these page-level variables (must be declared in scope):
 *   trackerList  — Array of tracker objects from /api/trackers
 *   flightStore  — The active per-tracker store instance
 *
 * Pages define two override hooks before the modal is opened:
 *   settingsAfterTrackerChange() — e.g. refresh the tracker <select>
 *   settingsOnClearCache(result) — e.g. re-render the flight list
 */

// Up to this width settings is a phone's drill-down (the stylesheet's media query and the
// script's matchMedia).
const SETTINGS_PHONE_MAX_PX = 719;

// What "Delete my account" leaves behind, in its row and its confirm.
const DELETE_ACCOUNT_KEEPS = 'Flights, duty days and edit history stay with the operator.';

// Who a settings page's changes reach: the sidebar groups its pages by this, and each
// page repeats it as a tag under its title, so it's clear on a page opened from a link too.
type SettingsScope = 'browser' | 'account' | 'instance';

const SCOPES: Record<SettingsScope, { label?: string; caption: string; icon: string }> = {
  browser: { label: 'This browser', caption: 'Saved on this device only', icon: 'monitor' },
  account: { label: 'Your account', caption: 'Follows you to every device', icon: 'circle-user-round' },
  // The instance's is labelled with its name (scopeLabel).
  instance: { caption: 'Shared by everyone here; admins make changes', icon: 'building-2' },
};

/** A scope's label as HTML. The instance's is its name, in a span the script renames after a
 * save; its page tag reads "Everyone on <name>". */
function scopeLabel(scope: SettingsScope, appName: string, opts: { tag?: boolean } = {}): string {
  if (scope !== 'instance') return SCOPES[scope].label!;
  const name = `<span class="settings-instance-name">${escapeHtml(appName)}</span>`;
  return opts.tag ? `Everyone on ${name}` : name;
}

interface SettingsPage {
  id: string;
  title: string;
  icon: string;
  scope: SettingsScope;
  /** Only admins see it (the script hides its link and page otherwise). */
  admin?: boolean;
  /** Starts hidden whatever the role: the setup checklist, until it has steps to show. */
  hidden?: boolean;
  body: string;
}

function scopeTag(scope: SettingsScope, appName: string): string {
  return `<span class="settings-scope-tag" data-scope="${scope}">${icon(SCOPES[scope].icon, { size: 14 })}${scopeLabel(scope, appName, { tag: true })}</span>`;
}

/** A titled group of settings on a page: its heading and description, then its card. */
function settingsGroup(title: string, body: string, opts: { desc?: string; id?: string; attrs?: string } = {}): string {
  return `
              <section class="settings-section"${opts.id ? ` id="${opts.id}"` : ''}${opts.attrs ? ' ' + opts.attrs : ''}>
                ${title ? `<h3 class="settings-section-label">${title}</h3>` : ''}
                ${opts.desc ?? ''}
                ${body}
              </section>`;
}

function settingsPages(): SettingsPage[] {
  return [
    {
      id: 'appearance', title: 'Appearance', icon: 'palette', scope: 'browser',
      body: `
              ${settingsGroup('', `
                <div class="settings-card">
                  <div class="settings-row">
                    <div class="settings-row-info">
                      <span class="settings-row-title">Theme</span>
                      <span class="settings-row-desc">System follows this device&rsquo;s light or dark setting.</span>
                    </div>
                    <div class="settings-theme-row" id="settings-theme-row">
                      <button class="settings-theme-btn" data-theme-val="light">Light</button>
                      <button class="settings-theme-btn" data-theme-val="dark">Dark</button>
                      <button class="settings-theme-btn" data-theme-val="system">System</button>
                    </div>
                  </div>
                </div>`)}
              ${settingsGroup('Map colors', `
                <div class="settings-card">${mapLayersSettingsRowsMarkup()}</div>`, {
                desc: '<p class="settings-section-desc">Adjust the colors of each basemap. Changes apply immediately, on every map. Admins choose which basemaps there are under Map content.</p>',
              })}`,
    },
    {
      id: 'storage', title: 'Storage', icon: 'hard-drive', scope: 'browser',
      body: `
              ${settingsGroup('', `
                <div class="settings-card">
                  <div class="settings-row">
                    <div class="settings-row-info">
                      <div class="settings-row-title">Clear local cache</div>
                      <div class="settings-row-desc">This browser keeps a copy of the flight data. Clearing it downloads everything again from the server.</div>
                    </div>
                    <button id="settings-clear-cache" class="btn-danger">Clear</button>
                  </div>
                </div>`)}`,
    },
    {
      id: 'account', title: 'Account', icon: 'circle-user-round', scope: 'account',
      body: `
              ${settingsGroup('Devices', `
                <div class="settings-card" id="settings-devices-list"></div>`, { id: 'settings-section-devices' })}
              ${settingsGroup('Email addresses', `
                <div class="settings-card" id="settings-emails-list"></div>`, { id: 'settings-section-emails', attrs: 'style="display:none"' })}
              ${settingsGroup('Delete account', `
                <div class="settings-card">
                  <div class="settings-row">
                    <div class="settings-row-info">
                      <div class="settings-row-title">Delete my account</div>
                      <div class="settings-row-desc">Signs out all your devices. ${DELETE_ACCOUNT_KEEPS}</div>
                    </div>
                    <button id="settings-delete-account" class="btn-danger">Delete</button>
                  </div>
                </div>`)}`,
    },
    {
      id: 'setup', title: 'Get started', icon: 'list-checks', scope: 'instance', admin: true, hidden: true,
      body: setupGuideMarkup(),
    },
    {
      id: 'general', title: 'General', icon: 'settings-2', scope: 'instance', admin: true,
      body: `
              ${settingsGroup('Instance', `
                <div class="settings-card settings-card-form">
                  <div class="settings-form-row">
                    <label class="settings-form-label" for="settings-tenant-name">Name</label>
                    <input type="text" id="settings-tenant-name" autocomplete="off" />
                  </div>
                  <div class="settings-form-row">
                    <label class="settings-form-label" for="settings-tenant-timezone">Timezone</label>
                    <select id="settings-tenant-timezone"></select>
                  </div>
                </div>`)}
              ${settingsGroup('Default map view', `
                <div class="settings-card settings-card-form">
                  <div class="settings-form-grid">
                    <div class="settings-form-row">
                      <label class="settings-form-label" for="settings-tenant-lat">Latitude</label>
                      <input type="number" id="settings-tenant-lat" step="any" autocomplete="off" />
                    </div>
                    <div class="settings-form-row">
                      <label class="settings-form-label" for="settings-tenant-lng">Longitude</label>
                      <input type="number" id="settings-tenant-lng" step="any" autocomplete="off" />
                    </div>
                    <div class="settings-form-row">
                      <label class="settings-form-label" for="settings-tenant-zoom">Zoom</label>
                      <input type="number" id="settings-tenant-zoom" min="1" max="20" step="any" autocomplete="off" />
                    </div>
                  </div>
                  <div class="settings-add-actions">
                    <button id="settings-tenant-map-pick" class="btn-secondary">${icon('crosshair', { size: 16 })}Set from map</button>
                  </div>
                </div>`, {
                desc: '<p class="settings-section-desc">Where the map starts for everyone, before any flights are shown.</p>',
              })}
              <div class="settings-page-actions">
                <button id="settings-tenant-save" class="btn-primary">Save</button>
                <p id="settings-tenant-status" class="settings-msg" style="display:none"></p>
              </div>
              ${settingsGroup('Setup checklist', `
                <div class="settings-card">${setupGuideAdminRowMarkup()}</div>`)}`,
    },
    {
      id: 'aircraft', title: 'Aircraft', icon: 'plane', scope: 'instance',
      body: `
              ${settingsGroup('', `
                <div class="settings-card">
                  <div id="settings-aircraft-list" class="settings-list"></div>
                  <details id="settings-add-aircraft" class="settings-add-tracker">
                    <summary>${icon('plus', { size: 16 })}Add aircraft</summary>
                    <div class="settings-add-inner">
                      <input type="text" id="settings-add-aircraft-tail" placeholder="Tail number (e.g. N12345)" autocomplete="off" />
                      <input type="text" id="settings-add-aircraft-name" placeholder="Display name (optional)" autocomplete="off" />
                      <div class="settings-add-actions">
                        <button id="settings-add-aircraft-submit" class="btn-primary">Add</button>
                        <button id="settings-add-aircraft-cancel" class="btn-secondary">Cancel</button>
                      </div>
                    </div>
                  </details>
                </div>`)}`,
    },
    {
      id: 'pilots', title: 'Pilots', icon: 'id-card', scope: 'instance',
      body: `
              ${settingsGroup('', `
                <div class="settings-card">
                  <div id="settings-pilots-list" class="settings-list"></div>
                  <details id="settings-add-pilot" class="settings-add-tracker">
                    <summary>${icon('plus', { size: 16 })}Add pilot</summary>
                    <div class="settings-add-inner">
                      <input type="text" id="settings-add-pilot-name" placeholder="Pilot name" autocomplete="off" />
                      <div class="settings-add-actions">
                        <button id="settings-add-pilot-submit" class="btn-primary">Add</button>
                        <button id="settings-add-pilot-cancel" class="btn-secondary">Cancel</button>
                      </div>
                    </div>
                  </details>
                </div>`)}`,
    },
    {
      id: 'trackers', title: 'Trackers', icon: 'radio-tower', scope: 'instance',
      body: `
              ${settingsGroup('', `
                <div class="settings-card">
                  <div id="settings-tracker-list" class="settings-list"></div>
                  <details id="settings-add-tracker" class="settings-add-tracker">
                    <summary>${icon('plus', { size: 16 })}Add tracker</summary>
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
                </div>`, {
                desc: '<p class="settings-section-desc">Add aircraft and pilots before trackers, so new flights are assigned automatically.</p>',
                attrs: 'data-doc-shot="settings.add-tracker-dialog"',
              })}`,
    },
    {
      id: 'users', title: 'Users', icon: 'users', scope: 'instance', admin: true,
      body: `
              ${settingsGroup('', `
                <div class="settings-card">
                  <div id="settings-users-list" class="settings-list"></div>
                  <details id="settings-invite-form" class="settings-add-tracker">
                    <summary>${icon('plus', { size: 16 })}Invite someone</summary>
                    <div class="settings-add-inner">
                      <input type="text" id="settings-invite-name" placeholder="Name" autocomplete="off" />
                      <input type="email" id="settings-invite-email" placeholder="Email (optional: we'll send the invite)" aria-label="Email (optional)" autocomplete="off" style="display:none" />
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
                </div>`, { id: 'settings-section-users' })}`,
    },
    {
      id: 'duty', title: 'Duty limits', icon: 'scale', scope: 'instance', admin: true,
      body: `
              ${settingsGroup('§135.267 method', `
                <div class="settings-card settings-card-form">
                  <div id="settings-duty-methods"></div>
                  <div class="settings-form-grid">
                    <div class="settings-form-row">
                      <label class="settings-form-label" for="settings-tenant-duty-method">Method</label>
                      <select id="settings-tenant-duty-method">
                        <option value="b">(b) Flight time in any 24 hours</option>
                        <option value="c">(c) Regularly assigned duty period</option>
                      </select>
                    </div>
                    <div class="settings-form-row">
                      <label class="settings-form-label" for="settings-duty-method-from">Effective from</label>
                      <input type="date" id="settings-duty-method-from" />
                    </div>
                  </div>
                  <div class="settings-add-actions">
                    <button id="settings-duty-method-save" class="btn-secondary">Save method</button>
                    <button id="settings-duty-method-cancel" class="btn-secondary" hidden>Cancel edit</button>
                  </div>
                  <p id="settings-duty-method-error" class="settings-msg" role="alert"></p>
                  <p id="settings-duty-method-last-edit" class="settings-section-desc"></p>
                </div>`, {
                desc: `<p class="settings-section-desc">Which method the pilot duty log checks. A change applies from its date
                on: past months keep the method that was in force then. To correct a mistake, edit the entry.
                ${docsLinkMarkup('features/pilot-duty-log/#limits-b-or-c', 'How the two methods differ')}</p>`,
              })}`,
    },
    {
      id: 'notifications', title: 'Notifications', icon: 'bell', scope: 'instance', admin: true,
      body: `
              ${settingsGroup('Signal-gap alerts', `
                <div class="settings-card settings-card-form">
                  <div class="settings-form-grid">
                    <div class="settings-form-row">
                      <label class="settings-form-label" for="settings-tenant-gap-minutes">Alert after (minutes)</label>
                      <input type="number" id="settings-tenant-gap-minutes" min="1" step="1" autocomplete="off" />
                    </div>
                    <div class="settings-form-row">
                      <label class="settings-form-label" for="settings-tenant-gap-stop-minutes">Stop alerts after (minutes)</label>
                      <input type="number" id="settings-tenant-gap-stop-minutes" min="1" step="1" placeholder="60" autocomplete="off" />
                    </div>
                  </div>
                  <div class="settings-add-actions">
                    <button id="settings-gap-save" class="btn-secondary">Save</button>
                  </div>
                  <p id="settings-gap-status" class="settings-msg" style="display:none"></p>
                </div>`, {
                desc: `<p class="settings-section-desc">A flight in the air whose tracker goes quiet this long raises a signal-gap alert, repeated about once a minute until updates resume (a final &ldquo;signal restored&rdquo;). If the silence outlasts the stop time, the flight is treated as ended and a final &ldquo;gap alerts stopped&rdquo; ends the repeats.</p>`,
              })}
              ${settingsGroup('Pushover', `
                <div class="settings-card settings-card-form">
                  <div class="settings-form-row">
                    <label class="settings-form-label" for="settings-tenant-pushover-token">Application token (shared)</label>
                    <input type="text" id="settings-tenant-pushover-token" autocomplete="off" placeholder="from pushover.net/apps/build" />
                  </div>
                  <div class="settings-add-actions">
                    <button id="settings-pushover-token-save" class="btn-secondary">Save token</button>
                  </div>
                  <p id="settings-pushover-token-status" class="settings-msg" style="display:none"></p>
                </div>`, {
                desc: `<p class="settings-section-desc">Pushover setup is two steps. <strong>First</strong>, register one free application at <code>pushover.net/apps/build</code> and paste its token here: every Pushover target on this instance shares it. <strong>Then</strong>, add a target below for each person who should get alerts, using <em>their own</em> Pushover user key (from their pushover.net dashboard), not the token.</p>`,
              })}
              ${settingsGroup('Targets', `
                <div class="settings-card">
                  <div id="settings-webhooks-list" class="settings-list"></div>
                  <details id="settings-add-webhook" class="settings-add-tracker">
                    <summary>${icon('plus', { size: 16 })}Add notification target</summary>
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
                </div>
                <p id="settings-webhooks-status" class="settings-msg" style="display:none"></p>`, {
                desc: '<p class="settings-section-desc">Each target gets takeoff, landing and signal-gap events, as a JSON webhook POST or a Pushover notification.</p>',
              })}`,
    },
    {
      id: 'map-content', title: 'Map content', icon: 'map', scope: 'instance', admin: true,
      body: `
              ${settingsGroup('Basemaps', `<div class="settings-card">${basemapSettingsMarkup()}</div>`, {
                desc: '<p class="settings-section-desc">The base layers in the map&rsquo;s style switcher. Hidden basemaps stay configured. A vector basemap is a Protomaps basemap PMTiles archive, with Protomaps&rsquo; basemaps-assets (fonts and sprites) copied to <code>basemaps-assets/</code> beside it.</p>',
              })}
              ${settingsGroup('Overlays', `
                <div class="settings-card">
                  <div id="settings-overlay-list" class="settings-list"></div>
                  <details id="settings-add-overlay" class="settings-add-tracker">
                    <summary>${icon('plus', { size: 16 })}Add overlay</summary>
                    <div class="settings-add-inner">
                      <input type="text" id="settings-add-overlay-label" placeholder="Label (e.g. Sectional chart)" autocomplete="off" />
                      <input type="text" id="settings-add-overlay-url" placeholder="Tile URL, e.g. https://example.com/{z}/{x}/{y}.png" autocomplete="off" />
                      <input type="text" id="settings-add-overlay-attribution" placeholder="Attribution (optional)" autocomplete="off" />
                      <input type="number" id="settings-add-overlay-maxzoom" placeholder="Max native zoom (optional)" min="1" max="22" step="1" autocomplete="off" />
                      <label class="settings-check"><input type="checkbox" id="settings-add-overlay-default" /> On by default (fallback for basemaps not set below)</label>
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
                </div>`, {
                desc: '<p class="settings-section-desc">Extra tile layers (e.g. a sectional chart or custom imagery) shown on top of the basemap. Listed for everyone in the map&rsquo;s overlay legend; each has a default on/off state a viewer can override there.</p>',
              })}
              ${settingsGroup('Regions', `
                <div class="settings-card settings-card-form">
                  <div class="settings-add-actions">
                    <button id="settings-regions-editor-btn" class="btn-secondary">${icon('pencil', { size: 16 })}Map editor</button>
                    <button id="settings-regions-export" class="btn-secondary">Export</button>
                    <label id="settings-regions-import-label" class="btn-secondary">
                      Import
                      <input type="file" id="settings-regions-import" accept=".json,.geojson" />
                    </label>
                  </div>
                  <p id="settings-regions-status" class="settings-msg" style="display:none"></p>
                </div>`, {
                desc: `<p class="settings-section-desc">GeoJSON FeatureCollection with Polygon or MultiPolygon features. Each feature requires a <code>Name</code> property. Import replaces all existing regions.</p>
                <p class="settings-section-desc">End a region&rsquo;s name with <code>(Base)</code>, e.g. <code>Kodiak (Base)</code>, to make it a home base: analytics leaves out time spent flying to and from it, and lists its stops separately.</p>`,
              })}
              ${settingsGroup('Named points', `
                <div class="settings-card settings-card-form">
                  <div class="settings-add-actions">
                    <button id="settings-named-points-editor-btn" class="btn-secondary">${icon('pencil', { size: 16 })}Map editor</button>
                    <button id="settings-named-points-export" class="btn-secondary">Export</button>
                    <label id="settings-named-points-import-label" class="btn-secondary">
                      Import
                      <input type="file" id="settings-named-points-import" accept=".json,.geojson" />
                    </label>
                  </div>
                  <p id="settings-named-points-status" class="settings-msg" style="display:none"></p>
                </div>`, {
                desc: '<p class="settings-section-desc">GeoJSON FeatureCollection with Point features. Each feature requires a <code>name</code> property and optionally a <code>maxKm</code> radius in kilometers. Import replaces all existing named points.</p>',
              })}`,
    },
    {
      id: 'export', title: 'Export flights', icon: 'download', scope: 'instance',
      body: `
              ${settingsGroup('', `
                <div class="settings-card">
                  <div class="settings-row">
                    <div class="settings-row-info">
                      <div class="settings-row-title">Export flights</div>
                      <div class="settings-row-desc">Times, pilot, aircraft and start and end places, as CSV or JSON. No tracks.</div>
                    </div>
                    <button id="settings-export-flights" class="btn-secondary">Export</button>
                  </div>
                </div>`)}`,
    },
  ];
}

function settingsSidebarMarkup(pages: SettingsPage[], appName: string): string {
  const groups = (['browser', 'account', 'instance'] as const).map((scope) => {
    const items = pages.filter((p) => p.scope === scope);
    const link = (p: SettingsPage) => `
              <a class="settings-nav-item" href="#settings/${p.id}" data-page="${p.id}"${p.admin ? ' data-admin' : ''}${p.admin || p.hidden ? ' hidden' : ''}>
                ${icon(p.icon, { size: 18 })}<span class="settings-nav-item-label">${p.title}</span>${icon('chevron-right', { size: 16, className: 'settings-nav-item-chevron' })}
              </a>`;
    return `
            <div class="settings-nav-group" data-scope="${scope}">
              <div class="settings-nav-group-head">
                <span class="settings-nav-group-label">${scopeLabel(scope, appName)}</span>
                <span class="settings-nav-group-caption">${SCOPES[scope].caption}</span>
              </div>
              <div class="settings-nav-list">${items.map(link).join('')}
              </div>
            </div>`;
  }).join('');
  return `
          <nav class="settings-sidebar" aria-label="Settings sections">
            ${groups}
            <div class="settings-sidebar-foot">
              ${docsLinkMarkup('', 'Documentation')}
            </div>
          </nav>`;
}

export function settingsModalMarkup(appName: string): string {
  const pages = settingsPages();
  return `
  <div id="settings-modal" class="settings-modal hidden" role="dialog" aria-modal="true" aria-labelledby="settings-nav-title">
    <div class="settings-modal-panel">
      <div class="settings-nav">
        <button id="settings-nav-back" class="settings-nav-back hidden" aria-label="Back">${icon('chevron-left', { size: 18 })}<span id="settings-nav-back-label">Settings</span></button>
        <h2 id="settings-nav-title" class="settings-modal-title">
          <!-- The product's name, not the instance's: the instance names its own group below. -->
          <span id="settings-nav-brand" class="settings-modal-brand">${logoLockupMarkup('Wingbeat Settings', { size: 24 })}</span>
          <span id="settings-nav-title-text" hidden></span>
        </h2>
        <button id="settings-modal-close" class="settings-modal-close btn-icon" aria-label="Close settings">${icon('x', { size: 20 })}</button>
      </div>
      <div class="settings-views">
        <div class="settings-view" id="settings-view-main">
          <div class="settings-shell" id="settings-shell">
            ${settingsSidebarMarkup(pages, appName)}
            <div class="settings-content" id="settings-content">
              ${pages.map((p) => `
              <div class="settings-page" id="settings-page-${p.id}" data-page="${p.id}"${p.admin ? ' data-admin' : ''} hidden>
                <div class="settings-page-head">
                  <h2 class="settings-page-title">${p.title}</h2>
                  ${scopeTag(p.scope, appName)}
                </div>
                ${p.body}
              </div>`).join('')}
            </div>
          </div>
        </div>
        <div class="settings-view settings-view-detail" id="settings-view-pilot-duty">
          ${pilotDutyMarkup()}
        </div>
        <div class="settings-view settings-view-detail" id="settings-view-flight-editor" data-doc-shot="flight-editor.view">
          ${flightEditorMarkup()}
        </div>
        <div class="settings-view settings-view-detail" id="settings-view-aircraft-info">
          ${aircraftInfoMarkup()}
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
    /* ── Layout ───────────────────────────────────────────────────────────────
       Full screen, over the page: a header bar, then the view stack. The main view is
       the sidebar of pages beside the open page; the duty log, flight editor, aircraft
       info and map editors slide over it as detail views. Under 720px wide the sidebar is
       the first screen and a page slides in over it (.settings-shell[data-page-open]).
       Spacing (design system, 4px base): page padding 32 (20 on a phone), 40 between
       groups, 12 from a group's heading to its card, cards padded 20 with 56px rows. */
    .settings-modal {
      --settings-row-h: 3.5rem;
      position: fixed;
      inset: 0;
      z-index: 2000;
      display: flex;
      background: var(--bg-base);
    }

    .settings-modal.hidden { display: none; }

    .settings-modal-panel {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .settings-nav {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: var(--settings-row-h);
      padding: env(safe-area-inset-top) var(--space-4) 0;
      flex-shrink: 0;
      background: var(--surface-1);
      border-bottom: 1px solid var(--border-subtle);
    }

    .settings-nav-back {
      background: none;
      border: none;
      color: var(--accent-text);
      font-family: var(--font-ui);
      font-size: var(--size-md);
      font-weight: var(--weight-medium);
      cursor: pointer;
      min-height: var(--control-h-md);
      padding: 0 var(--space-2) 0 0;
      border-radius: var(--radius-md);
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      transition: opacity var(--duration-fast) var(--ease-standard);
    }

    .settings-nav-back.hidden { display: none; }
    .settings-nav-back:hover { opacity: 0.7; }
    .settings-nav-back:focus-visible { outline: none; box-shadow: var(--ring-focus); }

    .settings-modal-title {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--size-lg);
      font-weight: var(--weight-bold);
      letter-spacing: var(--tracking-heading);
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .settings-modal-brand { display: inline-flex; max-width: 100%; vertical-align: middle; }
    .settings-modal-brand[hidden] { display: none; }

    .settings-views {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
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
      background: var(--bg-base);
      transition: transform var(--duration-normal) var(--ease-standard);
    }

    #settings-view-main { transform: translateX(0); overflow: hidden; }
    #settings-view-main.settings-view-pushed { transform: translateX(-100%); }
    .settings-view-detail { transform: translateX(100%); }
    .settings-view-detail.settings-view-active { transform: translateX(0); }
    .settings-view-detail.settings-view-pushed { transform: translateX(-100%); }

    /* ── Sidebar ── */
    .settings-shell {
      display: grid;
      grid-template-columns: 248px minmax(0, 1fr);
      height: 100%;
    }

    .settings-sidebar {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
      min-height: 0;
      overflow-y: auto;
      padding: var(--space-6) var(--space-3);
      background: var(--surface-1);
      border-right: 1px solid var(--border-subtle);
    }

    .settings-nav-group {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .settings-nav-group-head {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 0 var(--space-3) var(--space-2);
    }

    .settings-nav-group-label {
      font-family: var(--font-ui);
      font-size: var(--size-2xs);
      font-weight: var(--weight-bold);
      text-transform: uppercase;
      letter-spacing: var(--tracking-caps);
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .settings-nav-group-caption {
      font-size: var(--size-xs);
      color: var(--text-muted);
      line-height: var(--leading-snug);
    }

    .settings-nav-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .settings-nav-item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: var(--control-h-md);
      padding: 0 var(--space-3);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      font-family: var(--font-ui);
      font-size: var(--size-md);
      font-weight: var(--weight-medium);
      text-decoration: none;
      transition: background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
    }

    .settings-nav-item:hover { background: var(--surface-hover); color: var(--text-primary); }
    .settings-nav-item:focus-visible { outline: none; box-shadow: var(--ring-focus); }
    .settings-nav-item[aria-current="page"] {
      background: var(--surface-2);
      color: var(--accent-text);
      font-weight: var(--weight-semibold);
    }

    .settings-nav-item[hidden] { display: none; }
    .settings-nav-item-label { flex: 1; min-width: 0; }
    .settings-nav-item-chevron { display: none; color: var(--text-muted); }

    .settings-sidebar-foot {
      margin-top: auto;
      padding: var(--space-4) var(--space-3) 0;
      border-top: 1px solid var(--border-subtle);
      font-size: var(--size-sm);
    }

    /* ── Pages ── */
    .settings-content {
      min-height: 0;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    .settings-page {
      display: flex;
      flex-direction: column;
      gap: var(--space-10);
      max-width: 720px;
      padding: var(--space-8) var(--space-8) calc(var(--space-16) + env(safe-area-inset-bottom));
    }

    @media (min-width: 1100px) {
      .settings-page { padding-left: var(--space-12); padding-right: var(--space-12); }
    }

    .settings-page[hidden] { display: none; }

    /* Title, then the scope tag; 24px to the first group (the page's gap less 16). */
    .settings-page-head {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
      margin-bottom: calc(var(--space-6) - var(--space-10));
    }

    .settings-page-title {
      margin: 0;
      font-family: var(--font-display);
      font-size: var(--size-2xl);
      font-weight: var(--weight-bold);
      line-height: var(--leading-snug);
      letter-spacing: var(--tracking-heading);
      color: var(--text-primary);
    }

    /* Who a page's changes reach. */
    .settings-scope-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-pill);
      font-family: var(--font-ui);
      font-size: var(--size-xs);
      font-weight: var(--weight-medium);
      color: var(--text-secondary);
    }

    .settings-scope-tag[data-scope="instance"] { color: var(--accent-text); }

    /* A group: heading, description, card. */
    .settings-section {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
    }

    .settings-section-label {
      margin: 0;
      font-family: var(--font-ui);
      font-size: var(--size-base);
      font-weight: var(--weight-semibold);
      line-height: var(--leading-snug);
      color: var(--text-primary);
    }

    .settings-section-desc {
      margin: 0;
      max-width: var(--prose-max);
      font-size: var(--size-sm);
      line-height: var(--leading-normal);
      color: var(--text-secondary);
    }

    .settings-section-label + .settings-section-desc,
    .settings-section-desc + .settings-section-desc { margin-top: calc(-1 * var(--space-1)); }

    /* The save button under a page's form cards: 16px below the last one. */
    .settings-page-actions {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-top: calc(var(--space-4) - var(--space-10));
    }

    .settings-section .settings-page-actions { margin-top: 0; }

    .settings-card {
      background: var(--surface-1);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      padding: 0 var(--space-5);
      overflow: hidden;
      min-width: 0;
    }

    /* A card of rows: a hairline between rows. Each row draws it on its top edge, pulled up
       1px so the first one's falls outside the card and is clipped. */
    .settings-card:not(.settings-card-form) > :not(.settings-list),
    .settings-list > * {
      border-top: 1px solid var(--border-subtle);
      margin-top: -1px;
    }

    .settings-list > .settings-msg { padding: var(--space-4) 0; margin-bottom: 0; }

    /* A card of fields: stacked 16px apart. */
    .settings-card-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-5);
      overflow: visible;
    }

    .settings-card-form > .settings-msg:empty { display: none; }

    .settings-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      min-height: var(--settings-row-h);
      padding: var(--space-3) 0;
      box-sizing: border-box;
    }

    .settings-row-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .settings-row-title {
      font-size: var(--size-md);
      font-weight: var(--weight-semibold);
      color: var(--text-primary);
    }

    .settings-row-desc {
      font-size: var(--size-sm);
      color: var(--text-muted);
      line-height: var(--leading-normal);
    }

    /* ── Phone: the sidebar is the first screen, and a page slides over it ── */
    @media (max-width: ${SETTINGS_PHONE_MAX_PX}px) {
      .settings-nav {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        padding-left: var(--space-3);
        padding-right: var(--space-2);
      }
      .settings-nav-back { grid-column: 1; justify-self: start; max-width: 100%; }
      .settings-nav-back > span { overflow: hidden; text-overflow: ellipsis; }
      .settings-modal-title { grid-column: 2; text-align: center; font-size: var(--size-base); }
      .settings-modal-close { grid-column: 3; justify-self: end; }

      .settings-shell { grid-template-columns: minmax(0, 1fr); }
      .settings-sidebar,
      .settings-content {
        grid-row: 1;
        grid-column: 1;
        transition: transform var(--duration-normal) var(--ease-standard), visibility 0s linear var(--duration-normal);
      }
      .settings-sidebar {
        padding: var(--space-5) var(--space-5) calc(var(--space-8) + env(safe-area-inset-bottom));
        background: var(--bg-base);
        border-right: 0;
      }
      .settings-content { transform: translateX(100%); visibility: hidden; }
      .settings-shell[data-page-open] .settings-sidebar { transform: translateX(-100%); visibility: hidden; }
      .settings-shell[data-page-open] .settings-content { transform: none; visibility: visible; transition-delay: 0s; }
      .settings-shell:not([data-page-open]) .settings-sidebar { transition-delay: 0s; }

      .settings-nav-item {
        min-height: 3rem;
        background: var(--surface-1);
        border-radius: 0;
        color: var(--text-primary);
      }
      .settings-nav-list { gap: 0; border-radius: var(--radius-lg); overflow: hidden; }
      .settings-nav-item[aria-current="page"] { background: var(--surface-1); color: var(--text-primary); font-weight: var(--weight-medium); }
      .settings-nav-item-chevron { display: inline-flex; }
      .settings-nav-group-head { padding-left: var(--space-1); }
      .settings-sidebar-foot { border-top: 0; padding: 0 var(--space-1); }

      .settings-page {
        gap: var(--space-8);
        padding: var(--space-5) var(--space-5) calc(var(--space-12) + env(safe-area-inset-bottom));
      }
      /* The header bar has the page's title. */
      .settings-page-title { display: none; }
      .settings-page-head { margin-bottom: calc(var(--space-2) - var(--space-8)); }
      .settings-page-actions { margin-top: calc(var(--space-4) - var(--space-8)); }
      .settings-card { padding-left: var(--space-4); padding-right: var(--space-4); }
      .settings-card-form { padding: var(--space-4); }
    }

    @media (prefers-reduced-motion: reduce) {
      .settings-view, .settings-sidebar, .settings-content { transition: none; }
    }

    /* A list row (aircraft, pilots, trackers, devices, users, targets, basemaps,
       overlays): name and detail on the left, its actions on the right. */
    .settings-aircraft-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-height: var(--settings-row-h);
      padding: var(--space-3) 0;
      box-sizing: border-box;
    }

    .settings-aircraft-row.editing {
      flex-direction: column;
      align-items: stretch;
    }

    .settings-aircraft-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .settings-aircraft-name {
      font-size: var(--size-md);
      font-weight: var(--weight-semibold);
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .settings-aircraft-inactive .settings-aircraft-name { color: var(--text-muted); }

    .settings-aircraft-sub {
      font-size: var(--size-sm);
      color: var(--text-muted);
      line-height: var(--leading-snug);
    }

    .settings-aircraft-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
      flex-shrink: 0;
    }


    /* A row that opens something (its edit form, a detail view) when clicked. */
    .settings-row-link { cursor: pointer; }
    .settings-row-link:not(.editing):hover .settings-aircraft-name { color: var(--accent-text); }
    .settings-row-link.editing { cursor: auto; }
    .settings-row-chip { flex-shrink: 0; }

    /* .settings-action-btn: the small buttons the script puts in list rows. */
    .settings-action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
      min-height: var(--control-h-sm);
      padding: 0 var(--space-3);
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      font-family: var(--font-ui);
      font-size: var(--size-sm);
      font-weight: var(--weight-medium);
      cursor: pointer;
      transition: background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
    }
    .settings-action-btn:hover {
      background: var(--surface-hover);
      color: var(--text-primary);
      border-color: var(--border-strong);
    }
    .settings-action-btn:focus-visible { outline: none; box-shadow: var(--ring-focus); }
    .settings-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* A row's inline edit form, under its name. */
    .settings-edit-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      max-width: 400px;
      padding: var(--space-2) 0 var(--space-2);
    }

    .settings-edit-form-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .settings-edit-form-label { font-size: var(--size-xs); font-weight: var(--weight-semibold); color: var(--text-secondary); }

    .settings-import-warning {
      background: var(--warning-surface);
      color: var(--warning-fg);
      border-radius: var(--radius-sm);
      padding: var(--space-2) var(--space-3);
    }

    /* Color-only override; size comes from .settings-action-btn */
    .save-edit-btn {
      background: var(--accent-solid);
      border-color: transparent;
      color: var(--accent-fg);
    }

    .save-edit-btn:hover { background: var(--accent-solid-hover); color: var(--accent-fg); border-color: transparent; }

    /* "Add …": a list card's last row, a disclosure that opens its form in place. */
    .settings-add-tracker summary {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 3rem;
      cursor: pointer;
      list-style: none;
      user-select: none;
      color: var(--accent-text);
      font-family: var(--font-ui);
      font-size: var(--size-md);
      font-weight: var(--weight-semibold);
    }

    .settings-add-tracker summary::-webkit-details-marker { display: none; }
    .settings-add-tracker summary:hover { opacity: 0.8; }
    .settings-add-tracker summary:focus-visible { outline: none; box-shadow: var(--ring-focus); border-radius: var(--radius-sm); }

    .settings-add-inner {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      max-width: 400px;
      padding: var(--space-1) 0 var(--space-5);
      font-size: var(--size-sm);
      color: var(--text-secondary);
    }

    /* The add-tracker form's Aircraft and Pilot fields, which the script fills, spaced like
       the form's others. */
    #settings-add-tracker-assignments {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    #settings-add-tracker-assignments:empty { display: none; }

    ${formControlStyles(
      '.settings-add-inner input:not([type="radio"]):not([type="checkbox"]), .settings-add-inner select, ' +
      '.settings-edit-form input:not([type="radio"]):not([type="checkbox"]), .settings-edit-form select, ' +
      '.settings-form-row input:not([type="radio"]):not([type="checkbox"]), .settings-form-row select'
    )}

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
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .settings-add-actions [hidden] { display: none; }

    /* Buttons in a form's or a page's actions get .btn-md sizing (buttons.ts) without the
       class. Appearance comes from .btn-primary / .btn-secondary / .btn-danger. */
    :is(.settings-add-actions, .settings-page-actions) :is(.btn-primary, .btn-secondary, .btn-danger) {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      min-height: var(--control-h-md);
      padding: 0 var(--space-4);
      font-size: var(--size-md);
    }

    /* A row's own button (Clear, Delete, Export) at the same size. */
    .settings-row > :is(.btn-primary, .btn-secondary, .btn-danger) {
      flex-shrink: 0;
      min-height: var(--control-h-md);
      padding: 0 var(--space-4);
      font-size: var(--size-md);
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
      margin: 0;
      font-size: var(--size-sm);
      color: var(--text-muted);
    }

    /* The Devices card's first row: who's signed in. */
    .settings-devices-account {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--space-4) 0;
    }

    .settings-devices-account-label {
      font-size: var(--size-2xs);
      font-weight: var(--weight-bold);
      text-transform: uppercase;
      letter-spacing: var(--tracking-caps);
      color: var(--text-muted);
    }

    .settings-devices-account-name {
      font-size: var(--size-base);
      font-weight: var(--weight-semibold);
      color: var(--text-primary);
    }

    .settings-devices-account-role {
      font-size: var(--size-sm);
      color: var(--text-muted);
    }


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

    .settings-link-open-app { text-decoration: none; }

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
      display: block;
      margin-bottom: 6px;
      font-family: var(--font-ui);
      font-size: var(--size-sm);
      font-weight: var(--weight-semibold);
      color: var(--text-secondary);
    }

    .settings-form-row {
      display: flex;
      flex-direction: column;
      max-width: 400px;
    }

    /* Short fields side by side, each on its own line once there's no room. */
    .settings-form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: var(--space-4);
      max-width: 560px;
    }

    .settings-form-grid > .settings-form-row { max-width: none; }

    /* A checkbox and its label, in an add form. */
    .settings-check {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      cursor: pointer;
    }

    .settings-check input { margin: 0; accent-color: var(--accent); }

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

    /* A region's vertex, or the midpoint of an edge: a draggable marker whose element is
       the area to grab, with its dot in the middle. */
    .rg-handle {
      --rg-hit: 20px;
      width: var(--rg-hit);
      height: var(--rg-hit);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      z-index: 2;
    }
    @media (pointer: coarse) { .rg-handle { --rg-hit: 32px; } }
    .rg-handle::after {
      content: '';
      width: 13px;
      height: 13px;
      border-radius: var(--radius-pill);
      background: var(--accent);
      opacity: 0.9;
    }
    .rg-handle.rg-shared::after { background: ${darkTokens['warning-fg']}; }
    .rg-handle.rg-mid { z-index: 1; }
    .rg-handle.rg-mid::after {
      width: 9px;
      height: 9px;
      background: var(--surface-1);
      border: 1px solid var(--text-muted);
      box-sizing: border-box;
      opacity: 0.8;
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

    ${rowMenuStyles()}
  `;
}

export function settingsModalScript(): string {
  return `
    // ── Settings modal ────────────────────────────────────────────────────────

    ${rowMenuScript()}
    ${mapLayersSettingsScript()}
    ${basemapSettingsScript()}

    // Page-level hooks — each page reassigns these before the modal can open.
    let settingsAfterTrackerChange = () => {};
    // settingsOnClearCache is responsible for clearing the store(s) AND re-rendering.
    let settingsOnClearCache = async () => {};

    let _settingsUser = null;

    async function _loadSettingsUser() {
      if (_settingsUser) return _settingsUser;
      try { _settingsUser = await fetchMe(); } catch (_) {}
      return _settingsUser;
    }

    // ── Pages ──
    // The main view is a sidebar of pages (settingsPages(), settings.ts). The URL names the
    // open page, #settings/<page> (#settings alone: a phone's list of pages), so a reload
    // keeps it, a link opens it and Back steps out. An entry settings pushes carries
    // history.state.wbSettings, how many such entries lead back to the page underneath:
    // 1 for opening settings, 2 for a page a phone opened from its list (or 0 and 1, when the
    // page was loaded at #settings), and wbFromList marks such a page's entry.
    const _SETTINGS_PHONE_QUERY = '(max-width: ${SETTINGS_PHONE_MAX_PX}px)';
    let _settingsPage = null;          // the page shown; null for a phone's list
    let _settingsPicked = false;       // a page was asked for, so the checklist mustn't take over
    let _settingsEntry = null;         // settings' history entry, put back when Back leaves a detail view
    let _settingsClosing = false;      // closeSettings() went back past settings' entries
    let _settingsDetailOnly = false;   // opened for a detail view from the page (openSettingsView)
    // The detail views' stack (below).
    let _settingsViewStack = [];
    let _settingsBeforeBack = null;

    // What a page loads when it's shown (the rest render when settings opens).
    const _settingsPageLoaders = {
      account: () => { renderSettingsDevicesList(); renderSettingsEmails(); },
      users: () => renderSettingsUsersList(),
      general: async () => { _populateTenantTimezoneSelect(); await _loadTenantSettingsForm(); },
      duty: () => _loadDutyMethods(),
      notifications: async () => { await _loadTenantSettingsForm(); await renderSettingsWebhooksList(); },
    };

    function _settingsIsPhone() {
      return !!window.matchMedia && window.matchMedia(_SETTINGS_PHONE_QUERY).matches;
    }

    function _settingsNavLink(id) {
      return document.querySelector('.settings-nav-item[data-page="' + id + '"]');
    }

    function _settingsPageAvailable(id) {
      const link = _settingsNavLink(id);
      return !!link && !link.hidden;
    }

    // Shows or hides a page's sidebar link (the setup checklist; the admin pages by role),
    // leaving the page if it's the one shown.
    function _settingsSetPageAvailable(id, available) {
      const link = _settingsNavLink(id);
      if (link) link.hidden = !available;
      if (!available && _settingsPage === id) _settingsShowPage(null, { history: 'replace' });
    }

    function _settingsDefaultPage() {
      return _settingsPageAvailable('setup') ? 'setup' : 'appearance';
    }

    function _settingsUrlPage() {
      const m = /^#settings(?:\\/([a-z-]+))?$/.exec(location.hash);
      return m ? (m[1] || '') : null;
    }

    // mode: 'push' a new history entry, 'replace' the current one, or 'none'.
    function _settingsSetHash(hash, mode) {
      if (mode === 'none' || _settingsDetailOnly || typeof history === 'undefined') return;
      const url = location.pathname + location.search + hash;
      const depth = history.state?.wbSettings || 0;
      // A page pushed is one a phone opened from its list (wbFromList: Back returns to it).
      if (mode === 'push') history.pushState({ wbSettings: depth + 1, wbFromList: hash !== '#settings' }, '', url);
      else history.replaceState(hash ? { wbSettings: depth } : null, '', url);
      _settingsEntry = hash ? { state: history.state, url } : null;
    }

    // Shows a page (null: a phone's list, or the default page on a wider screen) and
    // runs its loader. A phone pushes a history entry for a page it opens from its list.
    function _settingsShowPage(id, opts = {}) {
      const phone = _settingsIsPhone();
      if (id && !_settingsPageAvailable(id)) id = null;
      if (!id && !phone) id = _settingsDefaultPage();
      const prev = _settingsPage;
      _settingsPage = id;
      document.querySelectorAll('.settings-page').forEach((p) => { p.hidden = p.dataset.page !== id; });
      document.querySelectorAll('.settings-nav-item').forEach((a) => {
        if (a.dataset.page === id) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      const shell = document.getElementById('settings-shell');
      if (id) shell.setAttribute('data-page-open', '');
      else shell.removeAttribute('data-page-open');
      if (id !== prev) document.getElementById('settings-content').scrollTop = 0;
      _settingsSyncHeader();
      _settingsSetHash(id ? '#settings/' + id : '#settings', opts.history ?? (phone && !prev && id ? 'push' : 'replace'));
      const load = id && _settingsPageLoaders[id];
      return load ? load() : undefined;
    }

    // The header bar: a detail view's title and Back, else on a phone the open page's
    // title and Back to the list, else just "Settings".
    function _settingsSyncHeader() {
      const back = document.getElementById('settings-nav-back');
      const title = document.getElementById('settings-nav-title-text');
      const backLabel = document.getElementById('settings-nav-back-label');
      const top = _settingsViewStack[_settingsViewStack.length - 1];
      let text = '';
      if (top) {
        text = top.title;
        backLabel.textContent = 'Back';
        back.classList.remove('hidden');
      } else if (_settingsPage && _settingsIsPhone()) {
        text = _settingsNavLink(_settingsPage).querySelector('.settings-nav-item-label').textContent;
        backLabel.textContent = 'Settings';
        back.classList.remove('hidden');
      } else {
        back.classList.add('hidden');
      }
      // The brand, unless there's a title to show instead.
      title.textContent = text;
      title.hidden = !text;
      document.getElementById('settings-nav-brand').hidden = !!text;
    }

    // Retitles the detail view shown (an aircraft renamed in its info view).
    function _settingsSetViewTitle(title) {
      const top = _settingsViewStack[_settingsViewStack.length - 1];
      if (top) top.title = title;
      _settingsSyncHeader();
    }

    document.querySelectorAll('.settings-nav-item').forEach((a) => {
      a.addEventListener('click', (e) => {
        // A modified click opens the page's link in a new tab, as for any link.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        _settingsPicked = true;
        // The page shown already: reloading its form would drop unsaved edits.
        if (a.dataset.page !== _settingsPage) _settingsShowPage(a.dataset.page);
      });
    });

    if (window.matchMedia) {
      // Crossing the breakpoint: a wider screen always shows a page, a phone its header.
      window.matchMedia(_SETTINGS_PHONE_QUERY).addEventListener('change', () => {
        if (document.getElementById('settings-modal').classList.contains('hidden')) return;
        if (!_settingsPage && !_settingsIsPhone()) _settingsShowPage(null);
        else _settingsSyncHeader();
      });
    }

    // ── Detail views ──
    // The duty log, flight editor, aircraft info and map editors: a stack of views that
    // slides over the pages, with the header's Back to leave each.

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
      _settingsViewStack.push({ id: viewId, title });
      _settingsSyncHeader();
    }

    function _settingsNavigateBack() {
      if (_settingsViewStack.length === 0) return;
      // A view opened from the page leaves settings with it.
      if (_settingsDetailOnly && _settingsViewStack.length === 1) { closeSettings(); return; }
      const entry = _settingsViewStack.pop();
      const exitView = document.getElementById(entry.id);
      exitView.classList.remove('settings-view-active', 'settings-view-pushed');
      if (_settingsViewStack.length === 0) {
        document.getElementById('settings-view-main').classList.remove('settings-view-pushed');
      } else {
        const prev = _settingsViewStack[_settingsViewStack.length - 1];
        const prevView = document.getElementById(prev.id);
        prevView.classList.remove('settings-view-pushed');
        prevView.classList.add('settings-view-active');
      }
      _settingsSyncHeader();
    }

    function _settingsReset() {
      while (_settingsViewStack.length > 0) {
        const entry = _settingsViewStack.pop();
        const v = document.getElementById(entry.id);
        v.classList.remove('settings-view-active', 'settings-view-pushed');
      }
      document.getElementById('settings-view-main').classList.remove('settings-view-pushed');
      _settingsSyncHeader();
    }

    async function _settingsRunBeforeBack() {
      if (!_settingsBeforeBack) return;
      const fn = _settingsBeforeBack;
      _settingsBeforeBack = null;
      try { await fn(); } catch (_) {}
    }

    // The header's Back: out of a detail view, or on a phone from a page to the list.
    async function _settingsBack() {
      if (_settingsViewStack.length > 0) {
        await _settingsRunBeforeBack();
        _settingsNavigateBack();
      } else if (_settingsPage && _settingsIsPhone()) {
        // The list's entry is the one before, when the phone opened this page from it.
        if (history.state?.wbFromList) history.back();
        else _settingsShowPage(null, { history: 'replace' });
      }
    }

    document.getElementById('settings-nav-back').addEventListener('click', _settingsBack);

    // The browser's Back and Forward, and links to #settings/<page>.
    function _settingsFollowUrl() {
      const page = _settingsUrlPage();
      const open = !document.getElementById('settings-modal').classList.contains('hidden');
      if (_settingsClosing) {
        _settingsClosing = false;
        if (open) _settingsClose();
        // Back stopped on an entry of settings' own (it was loaded from its URL): drop its hash.
        if (page !== null) _settingsSetHash('', 'replace');
        return;
      }
      if (open && _settingsDetailOnly && _settingsViewStack.length <= 1) {
        // Back from a view opened from the page: its entry is gone, so just close.
        _settingsClose();
        return;
      }
      if (open && _settingsViewStack.length > 0) {
        // Back from a detail view leaves just the view, as the header's Back does, so
        // settings' entry goes back on (it was the one Back popped).
        _settingsBack();
        if (_settingsEntry) history.pushState(_settingsEntry.state, '', _settingsEntry.url);
        return;
      }
      if (page === null) { if (open) _settingsClose(); return; }
      if (!open) {
        // A link to #settings in the page made this entry, with no state: it's one past
        // the page's (Forward back onto one of settings' keeps its own).
        if (!history.state?.wbSettings) history.replaceState({ wbSettings: 1 }, '', location.href);
        _settingsEntry = { state: history.state, url: location.href };
        openSettings(page || null, { history: 'none' });
        return;
      }
      _settingsShowPage(page || null, { history: 'none' });
    }

    window.addEventListener('popstate', _settingsFollowUrl);

    // Opens settings when the page was loaded with #settings in its URL; each page's init
    // calls this once its data is in. Its entry then counts as the page's own (depth 0),
    // since what Back leads to was another load of the page.
    function settingsOpenFromUrl() {
      const page = _settingsUrlPage();
      if (page === null) return false;
      history.replaceState({ wbSettings: 0 }, '', location.href);
      _settingsEntry = { state: history.state, url: location.href };
      openSettings(page || null, { history: 'none' });
      return true;
    }

    // Opens a detail view (the duty log, flight editor, aircraft info) over settings, or,
    // with settings closed, on its own: its history entry keeps the page's URL, since
    // there's no settings page to name, and its Back (or the browser's) closes settings.
    function openSettingsView(viewId, title) {
      if (document.getElementById('settings-modal').classList.contains('hidden')) {
        openSettings(null, { detail: true });
      }
      _settingsNavigateTo(viewId, title);
    }

    // Opens settings at a page (or the default one).
    async function openSettings(page = null, opts = {}) {
      const modal = document.getElementById('settings-modal');
      const wasOpen = !modal.classList.contains('hidden');
      _settingsReset();
      modal.classList.remove('hidden');
      if (!wasOpen && opts.detail) {
        _settingsDetailOnly = true;
        history.pushState({ wbSettings: (history.state?.wbSettings || 0) + 1 }, '', location.href);
      } else if (!wasOpen && opts.history !== 'none') _settingsSetHash('#settings', 'push');
      _settingsPicked = !!page;
      _syncThemeButtons();
      renderMapLayersSettings();
      renderSettingsBasemapsList();
      renderSettingsOverlaysList();
      renderSettingsTrackerList();
      renderSettingsAircraftList();
      renderSettingsPilotList();

      await _loadSettingsUser();

      // The admin pages, and the add forms on the pages everyone sees, by role.
      const isAdmin = _settingsUser?.role === 'admin';
      document.querySelectorAll('.settings-nav-item[data-admin]:not([data-page="setup"])').forEach((el) => {
        el.hidden = !isAdmin;
      });
      for (const id of ['settings-add-aircraft', 'settings-add-pilot', 'settings-add-tracker', 'settings-add-basemap', 'settings-add-overlay']) {
        const el = document.getElementById(id);
        if (el) el.style.display = isAdmin ? '' : 'none';
      }
      if (!isAdmin) _settingsSetPageAvailable('setup', false);
      _settingsShowPage(page, { history: opts.history === 'none' ? 'none' : 'replace' });
      const shown = _settingsPage;

      // Re-render tracker/basemap/overlay lists now that role is known (action buttons depend on it)
      _rowMenuClose(false);
      renderSettingsTrackerList();
      renderSettingsBasemapsList();
      renderSettingsOverlaysList();
      loadSettingsBasemaps();

      // Refresh lists in case they changed since last load.
      const [ar, pr] = await Promise.allSettled([fetchAircraft(), fetchPilots()]);
      _rowMenuClose(false);
      if (ar.status === 'fulfilled') { aircraftList = ar.value.aircraft; renderSettingsAircraftList(); }
      if (pr.status === 'fulfilled') { pilotList = pr.value.pilots; flightStore.setPilots(pilotList); renderSettingsPilotList(); }
      settingsResetAddForm();
      if (isAdmin) {
        await renderSetupGuide(false);
        // A new instance's checklist is where settings opens, unless another page was asked
        // for; a link to the checklist lands on it now that it's shown. (Not if settings has
        // closed meanwhile, another page was picked since, or only a detail view was opened.)
        const toSetup = page === 'setup' ? _settingsPage === shown : !_settingsPicked && !_settingsIsPhone();
        if (toSetup && _settingsPage !== 'setup' && _settingsViewStack.length === 0 && !_settingsDetailOnly
          && !modal.classList.contains('hidden') && _settingsPageAvailable('setup')) {
          _settingsShowPage('setup', { history: 'replace' });
        }
      }
    }

    async function _settingsClose() {
      await _settingsRunBeforeBack();
      document.getElementById('settings-modal').classList.add('hidden');
      _settingsReset();
      _settingsPage = null;
      _settingsEntry = null;
      _settingsDetailOnly = false;
    }

    // Closes settings, going back past its history entries so Forward can reopen it.
    async function closeSettings() {
      const depth = history.state?.wbSettings || 0;
      if (depth > 0 && (_settingsUrlPage() !== null || _settingsDetailOnly)) {
        _settingsClosing = true;
        history.go(-depth);
        setTimeout(() => { if (_settingsClosing) { _settingsClosing = false; _settingsClose(); } }, 1000);
        return;
      }
      await _settingsClose();
      if (_settingsUrlPage() !== null) _settingsSetHash('', 'replace');
    }

    document.getElementById('settings-btn').addEventListener('click', () => openSettings());
    document.getElementById('settings-modal-close').addEventListener('click', closeSettings);

    // ── List rows ──
    // A row's status chip (at most one), between its name and its trailing control.
    const _SETTINGS_CHIPS = {
      paused: ${JSON.stringify(statusChip('Paused', 'neutral', 'settings-row-chip'))},
      hidden: ${JSON.stringify(statusChip('Hidden', 'neutral', 'settings-row-chip'))},
      inactive: ${JSON.stringify(statusChip('Inactive', 'neutral', 'settings-row-chip'))},
      disabled: ${JSON.stringify(statusChip('Disabled', 'neutral', 'settings-row-chip'))},
      thisDevice: ${JSON.stringify(statusChip('This device', 'ok', 'settings-row-chip'))},
      invited: ${JSON.stringify(statusChip('Invited', 'warn', 'settings-row-chip'))},
      unverified: ${JSON.stringify(statusChip('Not verified', 'warn', 'settings-row-chip'))},
    };
    const _SETTINGS_ROW_CHEVRON = ${JSON.stringify(icon('chevron-right', { size: 18 }))};

    // A list row: its name, and its detail line under it when sub isn't empty. Finished
    // with _settingsFinishRow.
    function _settingsRow(name, sub = '', { inactive = false } = {}) {
      const row = document.createElement('div');
      row.className = 'settings-aircraft-row' + (inactive ? ' settings-aircraft-inactive' : '');
      const info = document.createElement('div');
      info.className = 'settings-aircraft-info';
      const nameEl = document.createElement('span');
      nameEl.className = 'settings-aircraft-name';
      nameEl.textContent = name;
      info.appendChild(nameEl);
      if (sub) {
        const subEl = document.createElement('span');
        subEl.className = 'settings-aircraft-sub';
        subEl.textContent = sub;
        info.appendChild(subEl);
      }
      row.appendChild(info);
      return row;
    }

    // Finishes a row built as .settings-aircraft-row > .settings-aircraft-info: its chip
    // (a _SETTINGS_CHIPS key) and its trailing control, a ⋯ menu of items (rowMenuButton,
    // row-menu.ts), or a chevron for a row whose only action is open. open (its edit form
    // or detail view) also runs on a click on the row.
    function _settingsFinishRow(row, { chip = null, items = [], open = null, label = '' } = {}) {
      if (chip) row.insertAdjacentHTML('beforeend', _SETTINGS_CHIPS[chip]);
      const actions = document.createElement('div');
      actions.className = 'settings-aircraft-actions';
      items = items.filter(Boolean);
      if (items.length > 0) {
        actions.appendChild(rowMenuButton(items, label ? 'Actions for ' + label : 'Actions'));
      } else if (open) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'row-menu-btn';
        btn.setAttribute('aria-label', label ? 'Open ' + label : 'Open');
        btn.innerHTML = _SETTINGS_ROW_CHEVRON;
        btn.addEventListener('click', (e) => { e.stopPropagation(); open(); });
        actions.appendChild(btn);
      }
      row.appendChild(actions);
      if (open) {
        row.classList.add('settings-row-link');
        row.addEventListener('click', (e) => {
          if (row.classList.contains('editing')) return;
          if (e.target.closest('button, a, input, select, textarea, label')) return;
          open();
        });
      }
    }

    // An edit form or panel opened under a row: the row's trailing control hides meanwhile.
    function _settingsOpenInlineForm(row) {
      row.querySelector('.settings-aircraft-actions').style.display = 'none';
      row.classList.add('editing');
    }

    function _settingsCloseInlineForm(row, form) {
      form.remove();
      row.querySelector('.settings-aircraft-actions').style.display = '';
      row.classList.remove('editing');
    }

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
        const subParts = [t.type];
        if (t.assigned_aircraft) subParts.push(t.assigned_aircraft);
        if (t.assigned_pilot != null) {
          const pilot = pilotList.find(p => p.id === t.assigned_pilot);
          if (pilot) subParts.push(pilot.name);
        }
        const row = _settingsRow(t.name, subParts.join(' · '), { inactive: !t.active });
        const admin = _settingsUser?.role === 'admin';
        _settingsFinishRow(row, {
          chip: t.active ? null : 'paused',
          label: t.name,
          open: admin ? () => settingsToggleEditForm(row, t) : null,
          items: admin ? [
            { label: 'Edit', onSelect: () => settingsToggleEditForm(row, t) },
            { label: 'Import history…', onSelect: () => settingsToggleImportForm(row, t) },
            { label: t.active ? 'Pause' : 'Resume', onSelect: (btn) => settingsToggleActive(t, btn) },
            { label: 'Delete', danger: true, onSelect: () => settingsDeleteTracker(t) },
          ] : [],
        });
        container.appendChild(row);
      }
    }

    // ── Overlays (tenant-scoped tile layers shown in the map's overlay legend) ──

    // Populates the given container with one "Default / On / Off" <select> per
    // tenant basemap (basemapList, from basemap-settings.ts; the shown raster ones until it
    // has loaded), keyed by the basemap's key, which is the id the map resolves overlay
    // defaults against. "Default" means inherit the general fallback checkbox rather than
    // an explicit override for that basemap.
    function _buildBasemapDefaultsFields(container, existingDefaults) {
      container.innerHTML = '';
      // Read back with the selects, so a basemap with no select here (hidden or vector before
      // basemapList loads) keeps its override.
      container._ftExistingDefaults = existingDefaults || {};
      const choices = basemapList.length > 0 ? basemapList.map(function(b) { return { id: b.key, label: b.label }; })
        : _ftActiveLayerDefs();
      choices.forEach(function(p) {
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

    // Reads the selects built above back into a default_enabled_by_basemap object, keeping
    // the overrides of basemaps that had no select (or null if there are no overrides).
    function _readBasemapDefaultsFields(container) {
      const result = {};
      let has = false;
      const selects = container.querySelectorAll('select');
      const shown = new Set([...selects].map((sel) => sel.dataset.basemapId));
      for (const [id, on] of Object.entries(container._ftExistingDefaults || {})) {
        if (!shown.has(id)) { result[id] = on; has = true; }
      }
      selects.forEach((sel) => {
        if (sel.value === 'on') { result[sel.dataset.basemapId] = true; has = true; }
        else if (sel.value === 'off') { result[sel.dataset.basemapId] = false; has = true; }
      });
      return has ? result : null;
    }

    function _buildOverlayRow(ov) {
      const overrideCount = ov.default_enabled_by_basemap ? Object.keys(ov.default_enabled_by_basemap).length : 0;
      const row = _settingsRow(ov.label, (ov.default_enabled ? 'On by default' : 'Off by default') +
        (overrideCount > 0 ? ' · ' + overrideCount + ' basemap override' + (overrideCount > 1 ? 's' : '') : ''));
      const admin = _settingsUser?.role === 'admin';
      _settingsFinishRow(row, {
        label: ov.label,
        open: admin ? () => settingsToggleOverlayEditForm(row, ov) : null,
        items: admin ? [
          { label: 'Edit', onSelect: () => settingsToggleOverlayEditForm(row, ov) },
          { label: 'Delete', danger: true, onSelect: () => settingsDeleteOverlay(ov) },
        ] : [],
      });
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
        _settingsCloseInlineForm(row, existing);
        return;
      }

      _settingsOpenInlineForm(row);

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
          await updateOverlay(ov.id, body);
          Object.assign(ov, body);
          renderSettingsOverlaysList();
          _ftRenderOverlayLegend();
        } catch (err) {
          alert(apiErrorMessage(err, 'Failed to save overlay.'));
        }
      });

      cancelBtn.addEventListener('click', () => {
        _settingsCloseInlineForm(row, form);
      });
      row.appendChild(form);
    }

    async function settingsDeleteOverlay(ov) {
      if (!confirm('Delete "' + ov.label + '"? This removes it from every viewer\\'s map.')) return;
      try {
        await deleteOverlay(ov.id);
        overlayList = overlayList.filter(o => o.id !== ov.id);
        renderSettingsOverlaysList();
        _ftRenderOverlayLegend();
      } catch (err) {
        alert(apiErrorMessage(err, 'Failed to delete overlay.'));
      }
    }

    const _addOverlayBasemapDefaults = document.getElementById('settings-add-overlay-basemap-defaults');
    if (_addOverlayBasemapDefaults) _buildBasemapDefaultsFields(_addOverlayBasemapDefaults, null);
    // The add form's per-basemap defaults, redrawn when the basemap list changes.
    function _refreshOverlayBasemapDefaults() {
      if (_addOverlayBasemapDefaults) _buildBasemapDefaultsFields(_addOverlayBasemapDefaults, null);
    }

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
          const data = await createOverlay(body);
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
        } catch (err) {
          alert(apiErrorMessage(err, 'Failed to add overlay.'));
        }
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
        _settingsCloseInlineForm(row, existing);
        return;
      }

      _settingsOpenInlineForm(row);

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
          const saved = await updateTracker(tracker.id, body);
          const aircraftAdded = aircraftSel && body.assigned_aircraft && body.assigned_aircraft !== tracker.assigned_aircraft;
          const pilotAdded = pilotSel && body.assigned_pilot != null && body.assigned_pilot !== tracker.assigned_pilot;
          tracker.name = name;
          tracker.source_url = source_url;
          tracker.mapshare_url = saved.mapshare_url ?? null;
          if (saved.credentials_cleared) alert('The feed moved to a different site, so its saved access code was removed. Edit the tracker again and re-enter the access code if it needs one.');
          if (aircraftSel) tracker.assigned_aircraft = body.assigned_aircraft;
          if (pilotSel) tracker.assigned_pilot = body.assigned_pilot;
          renderSettingsTrackerList();
          settingsAfterTrackerChange();
          if (aircraftAdded || pilotAdded) await settingsOfferApplyAssignment(tracker, !!aircraftAdded, !!pilotAdded);
        } catch (err) {
          alert(apiErrorMessage(err, 'Failed to save tracker.'));
        }
      });

      cancelBtn.addEventListener('click', () => {
        _settingsCloseInlineForm(row, form);
      });
      row.appendChild(form);
    }

    // ── Tracker history import (#2) ──────────────────────────────────────────
    // A new tracker only fetches the last two days of its feed. This imports older history
    // in one-month windows (oldest first; the feed returns everything after d1 otherwise),
    // then labels flight origins/destinations a dozen boundary points at a time, paced for
    // the public Overpass API. Both loops run in this tab and stop if the form is closed.
    // The dates are operator days (trackerImportWindows, core settings).

    function settingsToggleImportForm(row, tracker) {
      const close = (el) => _settingsCloseInlineForm(row, el);
      const existing = row.querySelector('.settings-edit-form');
      if (existing) { close(existing); return; }

      _settingsOpenInlineForm(row);

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
      fromInput.value = trackerImportDefaultFrom();
      fromInput.max = unixToTzDateStr(Math.floor(Date.now() / 1000));
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
        for (const w of trackerImportWindows(fromInput.value)) {
          if (cancelled || !form.isConnected) return;
          status.textContent = 'Importing ' + w.label + '… ' + total.toLocaleString() + ' positions so far';
          try {
            const data = await importTrackerHistory(tracker.id, w.d1, w.d2);
            total += data.inserted || 0;
          } catch (err) {
            status.textContent = 'Import stopped at ' + w.label + ': ' + err.message + '. ' + total.toLocaleString() + ' positions imported; run it again from that month to continue.';
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
          remaining = (await geocodeTracker(tracker.id)).remaining;
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
      let counts;
      try { counts = await fetchTrackerUnassigned(tracker.id); } catch (_) { return; }
      try {
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
        await applyTrackerAssignment(tracker.id, {
          aircraft: aircraft && counts.without_aircraft > 0,
          pilot: pilot && counts.without_pilot > 0,
        });
      } catch (err) {
        alert(apiErrorMessage(err, 'Failed to update existing flights.'));
      }
    }

    async function settingsToggleActive(tracker, btn) {
      btn.disabled = true;
      try {
        await updateTracker(tracker.id, { active: !tracker.active });
        tracker.active = !tracker.active;
        renderSettingsTrackerList();
        settingsAfterTrackerChange();
      } catch (_) {}
      btn.disabled = false;
    }

    async function settingsDeleteTracker(tracker) {
      if (!confirm('Delete ' + tracker.name + '? Historical data is preserved but the tracker will be hidden.')) return;
      try {
        await deleteTracker(tracker.id);
        const idx = trackerList.findIndex(t => t.id === tracker.id);
        if (idx !== -1) trackerList[idx] = { ...trackerList[idx], deleted: true, active: false };
        renderSettingsTrackerList();
        settingsAfterTrackerChange();
      } catch (err) {
        alert(apiErrorMessage(err, 'Failed to delete tracker.'));
      }
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
        const data = await createTracker(body);
        trackerList.push({
          id: data.id, name, type, source_url: sourceUrl, mapshare_url: data.mapshare_url ?? null, active: true, deleted: false,
          assigned_aircraft: body.assigned_aircraft ?? null,
          assigned_pilot: body.assigned_pilot ?? null,
        });
        settingsResetAddForm();
        document.getElementById('settings-add-tracker').open = false;
        renderSettingsTrackerList();
        settingsAfterTrackerChange();
      } catch (err) {
        alert(apiErrorMessage(err, 'Failed to add tracker.'));
      }
    });

    document.getElementById('settings-clear-cache').addEventListener('click', async () => {
      if (!flightStore) return;
      if (!confirm('Clear the local flight cache and re-download all data?')) return;
      try {
        closeSettings();
        await settingsOnClearCache();
      } catch (_) {}
    });

    // Export flights: the completed effective flights (flightExportRows, @wingbeat/core/
    // flight-export) between two optional operator dates, downloaded as CSV or JSON.
    document.getElementById('settings-export-flights').addEventListener('click', () => {
      if (!flightStore) return;
      const { modal, close } = openFormModal({
        id: 'flight-export-modal',
        title: 'Export flights',
        bodyHtml:
          '<p class="form-modal-hint">One row per flight, in the flight list’s corrected form. Leave a date ' +
            'empty to export from the first flight or through the last.</p>' +
          '<div class="form-field">' + segmentedHtml('format', [['csv', 'CSV'], ['json', 'JSON']], 'csv',
            { label: 'Format' }) + '</div>' +
          '<div class="form-field-row">' +
            '<div class="form-field"><label for="flight-x-from">From</label><input type="date" id="flight-x-from" /></div>' +
            '<div class="form-field"><label for="flight-x-to">To</label><input type="date" id="flight-x-to" /></div>' +
          '</div>' +
          '<div class="form-modal-error" role="alert"></div>',
        footerHtml:
          '<span class="form-modal-footer-spacer"></span>' +
          '<button class="btn-secondary btn-md" data-act="cancel">Cancel</button>' +
          '<button class="btn-primary btn-md" data-act="export">Export</button>',
      });
      const format = wireSegmented(modal, 'format');
      const errorEl = modal.querySelector('.form-modal-error');
      modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
      modal.querySelector('[data-act="export"]').addEventListener('click', () => {
        const from = modal.querySelector('#flight-x-from').value || null;
        const to = modal.querySelector('#flight-x-to').value || null;
        if (from && to && from > to) { errorEl.textContent = 'From must be on or before To.'; return; }
        const opts = { from, to, trackers: trackerList || [], aircraft: aircraftList || [] };
        const rows = flightExportRows(flightStore.getCompleted(), opts);
        if (!rows.length) { errorEl.textContent = 'No flights in that range.'; return; }
        const fmt = format();
        const blob = fmt === 'csv'
          // A byte-order mark, or Excel reads the UTF-8 (names, remarks) as the system's code page.
          ? new Blob(['\\uFEFF' + flightsCsv(rows)], { type: 'text/csv;charset=utf-8' })
          : new Blob([flightsJson(rows, opts)], { type: 'application/json' });
        downloadBlob(blob, flightExportFileName(fmt, from, to));
        close();
      });
    });

    document.getElementById('settings-delete-account').addEventListener('click', async (e) => {
      if (!confirm('Delete your account? All your devices will be signed out, and you’ll need a new invite to come back. ${DELETE_ACCOUNT_KEEPS}')) return;
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await deleteMe();
        window.location.href = '/login';
      } catch (err) {
        alert(apiErrorMessage(err, 'Failed to delete your account.'));
        btn.disabled = false;
      }
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
      // A feed that fails is a 200 with ok false; a refused request (no URL, …) is an error.
      const didntWork = (why) => 'The feed didn\\'t work: ' + why + '. Check the URL and, if the MapShare page has one, the password.';
      try {
        const data = await testTrackerFeed(body);
        if (!data.ok) {
          status.textContent = didntWork(data.error);
        } else if (data.points === 0) {
          status.textContent = 'The feed works, but it has no positions from the last 30 days.';
        } else {
          status.textContent = 'The feed works: ' + data.points.toLocaleString() + ' positions in the last 30 days, latest '
            + fmtTzDateTime(data.latest) + '.';
        }
      } catch (err) {
        status.textContent = err.status ? didntWork(err.message) : 'Couldn\\'t reach the server.';
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
        const row = _settingsRow(a.tail_number + (a.name ? ' – ' + a.name : ''), '', { inactive: !a.active });
        _settingsFinishRow(row, { chip: a.active ? null : 'inactive', label: a.tail_number, open: () => openAircraftInfo(a) });
        container.appendChild(row);
      }
    }

    document.getElementById('settings-add-aircraft-submit').addEventListener('click', async () => {
      const tail = document.getElementById('settings-add-aircraft-tail').value.trim().toUpperCase();
      const name = document.getElementById('settings-add-aircraft-name').value.trim() || null;
      if (!tail) return;
      try {
        await createAircraft({ tail_number: tail, name });
        aircraftList.push({ tail_number: tail, name, active: true });
        document.getElementById('settings-add-aircraft-tail').value = '';
        document.getElementById('settings-add-aircraft-name').value = '';
        document.getElementById('settings-add-aircraft').open = false;
        renderSettingsAircraftList();
      } catch (err) {
        alert(apiErrorMessage(err, 'Failed to add aircraft.'));
      }
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
        // The default in force today (dutyDefaultOn, pilot-duty.ts); its dated list is
        // edited from the duty log.
        const def = dutyDefaultOn(p.default_duties, unixToTzDateStr(Math.floor(Date.now() / 1000)));
        const row = _settingsRow(p.name, def ? 'Default duty ' + def.duty_start + '–' + def.duty_end : '', { inactive: !p.active });
        const openDuty = () => openPilotDuty(p.id, p.name);
        _settingsFinishRow(row, {
          chip: p.active ? null : 'hidden',
          label: p.name,
          open: openDuty,
          items: _settingsUser?.role === 'admin' ? [
            { label: 'Duty log', onSelect: openDuty },
            { label: 'Edit', onSelect: () => settingsTogglePilotEdit(row, p) },
            { label: p.active ? 'Hide' : 'Show', onSelect: async (btn) => {
              btn.disabled = true;
              try {
                await updatePilot(p.id, { active: !p.active });
                p.active = !p.active;
                renderSettingsPilotList();
              } catch (_) {}
              btn.disabled = false;
            } },
          ] : [],
        });
        container.appendChild(row);
      }
    }

    function settingsTogglePilotEdit(row, pilot) {
      const existing = row.querySelector('.settings-edit-form');
      if (existing) {
        _settingsCloseInlineForm(row, existing);
        return;
      }
      _settingsOpenInlineForm(row);
      const form = document.createElement('div');
      form.className = 'settings-edit-form';
      form.innerHTML =
        '<input type="text" class="edit-pilot-name" placeholder="Pilot name" value="' + escHtml(pilot.name) + '" />' +
        // The default duty is dated, so it has its own form, in the duty log.
        '<span class="settings-edit-form-label">The default duty is set in the pilot’s duty log.</span>' +
        '<div class="settings-msg edit-pilot-error"></div>' +
        '<div class="settings-edit-form-actions">' +
          '<button class="settings-action-btn save-edit-btn">Save</button>' +
          '<button class="settings-action-btn settings-cancel-btn">Cancel</button>' +
        '</div>';
      form.querySelector('.save-edit-btn').addEventListener('click', async () => {
        const name = form.querySelector('.edit-pilot-name').value.trim();
        if (!name) return;
        const errorEl = form.querySelector('.edit-pilot-error');
        try {
          await updatePilot(pilot.id, { name });
          pilot.name = name;
          // Manual flights show the pilot by name.
          flightStore.setPilots(pilotList);
          renderSettingsPilotList();
        } catch (err) {
          errorEl.textContent = apiErrorMessage(err, 'Save failed.');
        }
      });
      form.querySelector('.settings-cancel-btn').addEventListener('click', () => {
        _settingsCloseInlineForm(row, form);
      });
      row.appendChild(form);
    }

    document.getElementById('settings-add-pilot-submit').addEventListener('click', async () => {
      const name = document.getElementById('settings-add-pilot-name').value.trim();
      if (!name) return;
      try {
        const d = await createPilot({ name });
        pilotList.push({ id: d.id, name, active: true, default_duties: [] });
        flightStore.setPilots(pilotList);
        document.getElementById('settings-add-pilot-name').value = '';
        document.getElementById('settings-add-pilot').open = false;
        renderSettingsPilotList();
      } catch (err) {
        alert(apiErrorMessage(err, 'Failed to add pilot.'));
      }
    });

    document.getElementById('settings-add-pilot-cancel').addEventListener('click', () => {
      document.getElementById('settings-add-pilot-name').value = '';
      document.getElementById('settings-add-pilot').open = false;
    });

    function settingsAircraftOptionHtml(a, selectedTail) {
      return '<option value="' + escHtml(a.tail_number) + '"' +
        (a.tail_number === selectedTail ? ' selected' : '') + '>' +
        escHtml(a.tail_number + (a.name ? ' – ' + a.name : '')) + '</option>';
    }

    function settingsPilotOptionHtml(p, selectedId) {
      return '<option value="' + p.id + '"' +
        (p.id === selectedId ? ' selected' : '') + '>' +
        escHtml(p.name) + '</option>';
    }

    // ── Link display card ─────────────────────────────────────────────────────

    // appLink: a wingbeat:// link that opens the same sign-in in the app, for the phone this
    // page is on (docs/mobile-app-plan.md, "Auth and pairing").
    function settingsCreateLinkPanel(url, label, onDone, appLink) {
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

      if (appLink) {
        const openApp = document.createElement('a');
        openApp.className = 'btn-primary settings-link-open-app';
        openApp.href = appLink;
        openApp.textContent = 'Open in Wingbeat app';
        card.appendChild(openApp);
      }

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

    // The app's link for a device link's /join/<token> path, on an iPhone or iPad (the app is
    // iOS only for now; iPadOS reports itself as a Mac with touch), or null.
    function settingsAppPairLink(joinPath) {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
      if (!ios) return null;
      const token = joinPath.split('/').pop();
      return 'wingbeat://pair?host=' + encodeURIComponent(location.host) + '&token=' + encodeURIComponent(token);
    }

    // ── Devices section ───────────────────────────────────────────────────────

    async function renderSettingsDevicesList() {
      const container = document.getElementById('settings-devices-list');
      if (!container) return;
      container.innerHTML = '<p class="settings-msg">Loading&hellip;</p>';
      try {
        const data = await fetchSessions();
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
          const row = _settingsRow(session.device_name ?? 'Unnamed device', 'Last seen ' + fmtTzDate(session.last_seen_at));
          const current = session.id === _settingsUser?.session_id;
          _settingsFinishRow(row, {
            chip: current ? 'thisDevice' : null,
            label: session.device_name ?? 'Unnamed device',
            open: () => settingsToggleDeviceRename(row, session),
            items: [
              { label: 'Rename', onSelect: () => settingsToggleDeviceRename(row, session) },
              current
                ? { label: 'Sign out', danger: true, onSelect: async () => {
                  try { await fetch('/logout', { method: 'POST' }); } finally {
                    window.location.href = '/login';
                  }
                } }
                : { label: 'Revoke', danger: true, onSelect: (btn) => settingsRevokeDevice(session, btn) },
            ],
          });
          container.appendChild(row);
        }
        // "Get device link" row
        const linkRow = _settingsRow('Add another device', 'Get a sign-in link valid for 15 minutes to add another device.');
        const linkActions = document.createElement('div');
        linkActions.className = 'settings-aircraft-actions';
        const linkBtn = document.createElement('button');
        linkBtn.className = 'settings-action-btn';
        linkBtn.textContent = 'Get link';
        linkBtn.addEventListener('click', () => settingsGenerateDeviceLink(linkBtn));
        linkActions.appendChild(linkBtn);
        linkRow.appendChild(linkActions);
        container.appendChild(linkRow);
      } catch (_) {
        container.innerHTML = '<p class="settings-msg">Failed to load devices.</p>';
      }
    }

    function settingsToggleDeviceRename(row, session) {
      const existing = row.querySelector('.settings-edit-form');
      if (existing) {
        _settingsCloseInlineForm(row, existing);
        return;
      }
      _settingsOpenInlineForm(row);
      const form = document.createElement('div');
      form.className = 'settings-edit-form';
      form.innerHTML =
        '<input type="text" class="edit-device-name" placeholder="Device name" value="' + escHtml(session.device_name ?? '') + '" />' +
        '<div class="settings-edit-form-actions">' +
          '<button class="settings-action-btn save-edit-btn">Save</button>' +
          '<button class="settings-action-btn settings-cancel-btn">Cancel</button>' +
        '</div>';
      form.querySelector('.save-edit-btn').addEventListener('click', async () => {
        const name = form.querySelector('.edit-device-name').value.trim();
        try {
          await renameSession(session.id, { device_name: name });
          session.device_name = name || null;
          renderSettingsDevicesList();
        } catch (_) {}
      });
      form.querySelector('.settings-cancel-btn').addEventListener('click', () => {
        _settingsCloseInlineForm(row, form);
      });
      row.appendChild(form);
    }

    async function settingsRevokeDevice(session, btn) {
      if (!confirm('Revoke access for "' + (session.device_name ?? 'this device') + '"? It will be signed out.')) return;
      btn.disabled = true;
      try {
        await deleteSession(session.id);
        renderSettingsDevicesList();
      } catch (_) { btn.disabled = false; }
    }

    async function settingsGenerateDeviceLink(btn) {
      btn.disabled = true;
      btn.textContent = 'Loading…';
      try {
        const data = await createDeviceLink();
        const url = window.location.origin + data.url;
        const row = btn.closest('.settings-aircraft-row');
        _settingsOpenInlineForm(row);
        const card = settingsCreateLinkPanel(url, 'Sign-in link — valid for 15 minutes', () => {
          _settingsCloseInlineForm(row, card);
          btn.textContent = 'Get link';
          btn.disabled = false;
        }, settingsAppPairLink(data.url));
        row.appendChild(card);
      } catch (_) {
        btn.textContent = 'Get link';
        btn.disabled = false;
      }
    }

    // ── Email addresses (the user's own; an admin's editing of anyone's) ────────

    // Fills container with a user's addresses (any of them signs in at /login), those sent a
    // link that hasn't been opened yet, and a field that sends a new one its link. ops: add(email)
    // and remove(emailId), each followed by reload().
    function settingsRenderEmails(container, data, ops) {
      container.innerHTML = '';
      const addRow = (text, sub, inactive, items, chip) => {
        const row = _settingsRow(text, sub, { inactive });
        _settingsFinishRow(row, { chip, items, label: text });
        container.appendChild(row);
      };
      for (const e of data.emails) {
        const remove = async (removeBtn) => {
          if (!confirm('Remove ' + e.email + '? It will no longer sign in.')) return;
          removeBtn.disabled = true;
          try {
            await ops.remove(e.id);
            ops.reload();
          } catch (err) {
            alert(apiErrorMessage(err, 'Failed to remove the address.'));
            removeBtn.disabled = false;
          }
        };
        addRow(e.email, 'Verified', false, [{ label: 'Remove', danger: true, onSelect: remove }], null);
      }
      for (const pending of data.pending_emails) {
        addRow(pending.email, 'Verification link sent · Expires ' + fmtTzDate(pending.expires_at), true, [], 'unverified');
      }
      if (data.emails.length === 0 && data.pending_emails.length === 0) {
        const none = document.createElement('p');
        none.className = 'settings-msg';
        none.textContent = 'No email addresses yet.';
        container.appendChild(none);
      }

      const form = document.createElement('div');
      form.className = 'settings-edit-form';
      const input = document.createElement('input');
      input.type = 'email';
      input.placeholder = 'Add an address';
      input.setAttribute('aria-label', 'Email address to add');
      input.autocomplete = 'off';
      form.appendChild(input);
      const hint = document.createElement('p');
      hint.className = 'settings-msg';
      hint.textContent = 'Verified email addresses can be used to sign in.';
      form.appendChild(hint);
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'settings-edit-form-actions';
      const sendBtn = document.createElement('button');
      sendBtn.className = 'settings-action-btn save-edit-btn';
      sendBtn.textContent = 'Verify email';
      actionsDiv.appendChild(sendBtn);
      form.appendChild(actionsDiv);
      sendBtn.addEventListener('click', async () => {
        const email = input.value.trim();
        if (!email) return;
        sendBtn.disabled = true;
        try {
          await ops.add(email);
          ops.reload();
        } catch (err) {
          alert(apiErrorMessage(err, 'Failed to send the verification email.'));
          sendBtn.disabled = false;
        }
      });
      container.appendChild(form);
    }

    // Shown only when the instance sends email (window.APP_SETTINGS.email).
    async function renderSettingsEmails() {
      const section = document.getElementById('settings-section-emails');
      if (!section || !window.APP_SETTINGS.email) return;
      section.style.display = '';
      const container = document.getElementById('settings-emails-list');
      container.innerHTML = '<p class="settings-msg">Loading&hellip;</p>';
      try {
        settingsRenderEmails(container, await fetchMyEmails(), {
          add: (email) => addMyEmail({ email }),
          remove: (id) => removeMyEmail(id),
          reload: renderSettingsEmails,
        });
      } catch (_) {
        container.innerHTML = '<p class="settings-msg">Failed to load your email addresses.</p>';
      }
    }

    // ── Users section (admin only) ────────────────────────────────────────────

    async function renderSettingsUsersList() {
      const container = document.getElementById('settings-users-list');
      if (!container) return;
      container.innerHTML = '<p class="settings-msg">Loading&hellip;</p>';
      // Each list on its own: one the server refuses is left out; if neither loads, say so.
      const [usersRes, invitesRes] = await Promise.allSettled([fetchUsers(), fetchInvites()]);
      if (usersRes.status === 'rejected' && invitesRes.status === 'rejected') {
        container.innerHTML = '<p class="settings-msg">Failed to load users.</p>';
        return;
      }
      try {
        container.innerHTML = '';
        if (usersRes.status === 'fulfilled') {
          const userList = usersRes.value.users;
          for (const user of userList) {
            const pilot = user.pilot_id != null ? pilotList.find(p => p.id === user.pilot_id) : null;
            const subParts = [user.role === 'admin' ? 'Admin' : 'Viewer'];
            if (user.is_env_admin) subParts.push('Shared account');
            subParts.push(user.device_count + ' device' + (user.device_count !== 1 ? 's' : ''));
            if (pilot) subParts.push('Pilot ' + pilot.name);
            for (const e of user.emails ?? []) subParts.push(e.email);
            for (const e of user.pending_emails ?? []) subParts.push(e.email + ' (not verified)');
            const row = _settingsRow(user.name, subParts.join(' · '));
            const editable = !user.is_env_admin;
            _settingsFinishRow(row, {
              label: user.name,
              items: [
                editable && pilotList.length > 0 && { label: 'Designate pilot', onSelect: () => settingsToggleUserPilot(row, user, userList) },
                editable && window.APP_SETTINGS.email && { label: 'Email addresses', onSelect: () => settingsToggleUserEmails(row, user) },
                editable && user.id !== _settingsUser?.id && { label: 'Delete', danger: true, onSelect: (btn) => settingsRevokeUser(user, btn) },
              ],
            });
            container.appendChild(row);
          }
        }
        if (invitesRes.status === 'fulfilled') {
          for (const invite of invitesRes.value.invites) {
            const row = _settingsRow(invite.invited_name, (invite.invited_role === 'admin' ? 'Admin' : 'Viewer') +
              (invite.email ? ' · Emailed to ' + invite.email : '') + ' · Expires ' + fmtTzDate(invite.expires_at), { inactive: true });
            const showLink = () => {
              const url = window.location.origin + '/join/' + invite.token;
              _settingsOpenInlineForm(row);
              const panel = settingsCreateLinkPanel(url, 'Invite link for ' + invite.invited_name, () => {
                _settingsCloseInlineForm(row, panel);
              });
              row.appendChild(panel);
            };
            _settingsFinishRow(row, {
              chip: 'invited',
              label: invite.invited_name,
              open: showLink,
              items: [
                { label: 'Show invite link', onSelect: showLink },
                { label: 'Revoke', danger: true, onSelect: (btn) => settingsRevokeInvite(invite, btn) },
              ],
            });
            container.appendChild(row);
          }
        }
      } catch (_) {
        container.innerHTML = '<p class="settings-msg">Failed to load users.</p>';
      }
    }

    // Links a user to the pilot they are, which the app's duty log opens on. A pilot linked
    // to another user isn't offered (the server refuses a second link).
    function settingsToggleUserPilot(row, user, userList) {
      const existing = row.querySelector('.settings-edit-form');
      if (existing) {
        _settingsCloseInlineForm(row, existing);
        return;
      }
      _settingsOpenInlineForm(row);

      const form = document.createElement('div');
      form.className = 'settings-edit-form';
      const pilotSel = document.createElement('select');
      const noOpt = document.createElement('option');
      noOpt.value = '';
      noOpt.textContent = 'Not a pilot';
      pilotSel.appendChild(noOpt);
      const taken = new Set(userList.filter(u => u.id !== user.id && u.pilot_id != null).map(u => u.pilot_id));
      for (const p of pilotList) {
        if (p.id !== user.pilot_id && (!p.active || taken.has(p.id))) continue;
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === user.pilot_id) opt.selected = true;
        pilotSel.appendChild(opt);
      }
      form.appendChild(_lbl('Pilot', pilotSel));

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
        saveBtn.disabled = true;
        try {
          await updateUser(user.id, { pilot_id: pilotSel.value ? parseInt(pilotSel.value, 10) : null });
          renderSettingsUsersList();
        } catch (err) {
          alert(apiErrorMessage(err, 'Failed to save the pilot.'));
          saveBtn.disabled = false;
        }
      });
      cancelBtn.addEventListener('click', () => settingsToggleUserPilot(row, user, userList));
      row.appendChild(form);
    }

    // A user's addresses, which an admin adds (each is emailed a link that confirms it) and removes.
    function settingsToggleUserEmails(row, user) {
      const existing = row.querySelector('.settings-user-emails');
      if (existing) {
        _settingsCloseInlineForm(row, existing);
        return;
      }
      _settingsOpenInlineForm(row);
      const panel = document.createElement('div');
      panel.className = 'settings-user-emails';
      const list = document.createElement('div');
      panel.appendChild(list);
      settingsRenderEmails(list, { emails: user.emails ?? [], pending_emails: user.pending_emails ?? [] }, {
        add: (email) => addUserEmail(user.id, { email }),
        remove: (id) => removeUserEmail(user.id, id),
        reload: renderSettingsUsersList,
      });
      const doneBtn = document.createElement('button');
      doneBtn.className = 'settings-action-btn settings-cancel-btn';
      doneBtn.textContent = 'Done';
      doneBtn.addEventListener('click', () => settingsToggleUserEmails(row, user));
      list.querySelector('.settings-edit-form-actions').appendChild(doneBtn);
      row.appendChild(panel);
    }

    async function settingsRevokeUser(user, btn) {
      if (!confirm('Remove ' + user.name + '? All their sessions will be deleted.')) return;
      btn.disabled = true;
      try {
        await deleteUser(user.id);
        renderSettingsUsersList();
      } catch (err) {
        alert(apiErrorMessage(err, 'Failed to remove user.'));
        btn.disabled = false;
      }
    }

    async function settingsRevokeInvite(invite, btn) {
      btn.disabled = true;
      try {
        await deleteInvite(invite.id);
        renderSettingsUsersList();
      } catch (_) { btn.disabled = false; }
    }

    document.getElementById('settings-invite-submit').addEventListener('click', async () => {
      const name = document.getElementById('settings-invite-name').value.trim();
      const role = document.getElementById('settings-invite-role').value;
      const emailInput = document.getElementById('settings-invite-email');
      const email = window.APP_SETTINGS.email ? emailInput.value.trim() : '';
      if (!name) return;
      const submitBtn = document.getElementById('settings-invite-submit');
      submitBtn.disabled = true;
      try {
        const data = await createInvite(email ? { name, role, email } : { name, role });
        const url = window.location.origin + data.url;
        const inner = document.getElementById('settings-invite-form').querySelector('.settings-add-inner');
        const nameInput = document.getElementById('settings-invite-name');
        const roleSelect = document.getElementById('settings-invite-role');
        const actionsDiv = inner.querySelector('.settings-add-actions');
        const fields = [nameInput, emailInput, roleSelect, actionsDiv];
        fields.forEach(el => { el.style.display = 'none'; });
        const title = data.emailed ? 'Invite emailed to ' + email + '. Its link, to share another way:' : 'Invite link for ' + name;
        const card = settingsCreateLinkPanel(url, title, () => {
          nameInput.value = '';
          emailInput.value = '';
          fields.forEach(el => { el.style.display = ''; });
          if (!window.APP_SETTINGS.email) emailInput.style.display = 'none';
          card.remove();
          document.getElementById('settings-invite-form').open = false;
          submitBtn.disabled = false;
          renderSettingsUsersList();
        });
        inner.appendChild(card);
      } catch (err) {
        alert(apiErrorMessage(err, 'Failed to create invite.'));
        submitBtn.disabled = false;
      }
    });

    if (window.APP_SETTINGS.email) document.getElementById('settings-invite-email').style.display = '';

    document.getElementById('settings-invite-cancel').addEventListener('click', () => {
      document.getElementById('settings-invite-name').value = '';
      document.getElementById('settings-invite-email').value = '';
      document.getElementById('settings-invite-form').open = false;
    });

    // ── Instance settings (admin only): the General and Notifications pages ─────

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

    // The timezone as loaded, so a save can tell when it changes (the warning below).
    let _tenantTimezone = null;

    async function _loadTenantSettingsForm() {
      try {
        const d = await fetchSettings();
        _tenantTimezone = d.timezone ?? null;
        document.getElementById('settings-tenant-name').value = d.app_name ?? '';
        document.getElementById('settings-tenant-timezone').value = d.timezone ?? '';
        document.getElementById('settings-tenant-lat').value = d.map_default_lat ?? '';
        document.getElementById('settings-tenant-lng').value = d.map_default_lng ?? '';
        document.getElementById('settings-tenant-zoom').value = d.map_default_zoom ?? '';
        document.getElementById('settings-tenant-gap-minutes').value = d.gap_alert_minutes ?? '';
        document.getElementById('settings-tenant-gap-stop-minutes').value = d.gap_alert_stop_minutes ?? '';
        document.getElementById('settings-tenant-pushover-token').value = d.pushover_api_token ?? '';
      } catch (_) {}
    }

    // A form's status line: shown for 3 seconds.
    function _settingsFlashStatus(statusEl, text) {
      statusEl.style.display = '';
      statusEl.textContent = text;
      clearTimeout(statusEl._flashTimer);
      statusEl._flashTimer = setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
    }

    // The General page: name, timezone and the default map view.
    document.getElementById('settings-tenant-save').addEventListener('click', async () => {
      const statusEl = document.getElementById('settings-tenant-status');
      const body = {
        app_name: document.getElementById('settings-tenant-name').value.trim(),
        timezone: document.getElementById('settings-tenant-timezone').value,
        map_default_lat: parseFloat(document.getElementById('settings-tenant-lat').value),
        map_default_lng: parseFloat(document.getElementById('settings-tenant-lng').value),
        map_default_zoom: parseFloat(document.getElementById('settings-tenant-zoom').value),
      };
      if (!body.app_name || !body.timezone) return;
      const showStatus = (text) => _settingsFlashStatus(statusEl, text);
      // Without the timezone as loaded, a save can't tell whether it changes it, so it can't
      // warn about the duty log below: refuse rather than save unwarned.
      if (!_tenantTimezone) {
        showStatus('Couldn\\'t load the current settings. Reload the page and try again.');
        return;
      }
      try {
        // The duty log's dates and times are stored in the operator's timezone, so a new one
        // re-reads them: ask first when there are any (timezoneChangeWarning, core settings).
        if (body.timezone !== _tenantTimezone) {
          const ask = timezoneChangeWarning(_tenantTimezone, body.timezone, await fetchDutyRecordCounts());
          if (ask && !confirm(ask)) return;
        }
        await patchSettings(body);
        _tenantTimezone = body.timezone;
        // The page's copy (settingsAsClientObject): core reads the timezone from it on every
        // call (core-entry.ts), so times render in the new zone from here on without a reload.
        Object.assign(window.APP_SETTINGS, {
          appName: body.app_name,
          timezone: body.timezone,
          mapDefaultLat: body.map_default_lat,
          mapDefaultLng: body.map_default_lng,
          mapDefaultZoom: body.map_default_zoom,
        });
        document.querySelectorAll('.settings-instance-name').forEach((el) => { el.textContent = body.app_name; });
        showStatus('Saved.');
      } catch (_) {
        showStatus('Failed to save.');
      }
    });

    // The Notifications page's signal-gap thresholds.
    document.getElementById('settings-gap-save').addEventListener('click', async () => {
      const statusEl = document.getElementById('settings-gap-status');
      const body = {
        gap_alert_minutes: parseInt(document.getElementById('settings-tenant-gap-minutes').value, 10),
        gap_alert_stop_minutes: parseInt(document.getElementById('settings-tenant-gap-stop-minutes').value, 10),
      };
      if (Number.isNaN(body.gap_alert_minutes)) return;
      // Not seeded by the initial migration, so it's blank until first saved — leave the
      // server default (shown as the placeholder) in place rather than sending null.
      if (Number.isNaN(body.gap_alert_stop_minutes)) delete body.gap_alert_stop_minutes;
      try {
        await patchSettings(body);
        _settingsFlashStatus(statusEl, 'Saved.');
      } catch (_) {
        _settingsFlashStatus(statusEl, 'Failed to save.');
      }
    });

    // ── Duty method, by date ──
    // The operator's §135.267 method as dated entries (GET /api/duty-methods; migration
    // 0002), each day of the duty log using the one in force on it (dutyMethodOn,
    // pilot-duty.ts). Save adds an entry from its Effective from date, or with Edit fixes
    // one (moved to a new date, if changed); Remove drops one. Writes send the list's
    // history id as base_history_id, so a change another admin made since it loaded is
    // refused and the section offers to reload (src/index.ts, "Edit conflicts"). The list
    // markup and its styles are the default-duty form's (_dutyDatedListHtml).
    let _dutyMethods = { methods: [], last_history_id: 0 };
    let _dutyMethodEditing = null;

    const _DUTY_METHOD_NAMES = { b: '(b) Flight time in any 24 hours', c: '(c) Regularly assigned duty period' };

    async function _loadDutyMethods() {
      const errorEl = document.getElementById('settings-duty-method-error');
      try {
        _dutyMethods = await fetchDutyMethods();
        errorEl.textContent = '';
      } catch (_) {
        errorEl.textContent = 'Couldn’t load the duty method. Open the page again to try again.';
      }
      _editDutyMethod(null);
    }

    // Shows the list and fills the form: for entry (Edit) or for a new entry from today.
    function _editDutyMethod(entry) {
      _dutyMethodEditing = entry;
      const entries = [..._dutyMethods.methods].sort((a, b) => a.effective_date < b.effective_date ? 1 : -1);
      const today = unixToTzDateStr(Math.floor(Date.now() / 1000));
      const listEl = document.getElementById('settings-duty-methods');
      listEl.innerHTML = entries.length ? _dutyDatedListHtml(entries, e => _DUTY_METHOD_NAMES[e.method] || e.method, entry) : '';
      listEl.onclick = e => {
        const btn = e.target.closest('[data-edit], [data-remove]');
        if (!btn) return;
        const picked = entries[Number(btn.dataset.edit ?? btn.dataset.remove)];
        if (btn.dataset.edit != null) _editDutyMethod(picked);
        else _removeDutyMethod(entries, picked);
      };
      const current = dutyMethodOn(_dutyMethods.methods, today);
      document.getElementById('settings-tenant-duty-method').value = entry ? entry.method : current;
      document.getElementById('settings-duty-method-from').value = entry ? entry.effective_date : today;
      document.getElementById('settings-duty-method-save').textContent = entry ? 'Save entry' : 'Save method';
      document.getElementById('settings-duty-method-cancel').hidden = !entry;
      const errorEl = document.getElementById('settings-duty-method-error');
      const base = _dutyMethods.last_history_id;
      showLastEdit(document.getElementById('settings-duty-method-last-edit'), 'duty_method', 'tenant')
        .then(h => { if (h && h.id > base && !errorEl.textContent) _dutyMethodConflict(h); });
    }

    function _dutyMethodConflict(conflict) {
      showEditConflict(document.getElementById('settings-duty-method-error'), conflict, { reload: _loadDutyMethods });
    }

    // Runs a write of the method list (putDutyMethod, deleteDutyMethod), then shows the list again.
    async function _writeDutyMethods(fn) {
      const controls = [...document.querySelectorAll('#settings-duty-method-save, #settings-duty-method-cancel, #settings-duty-methods button')];
      const errorEl = document.getElementById('settings-duty-method-error');
      const ok = await runFormAction(controls, errorEl, async () => {
        await fn();
        await _loadDutyMethods();
      }, _dutyMethodConflict);
      return ok;
    }

    function _removeDutyMethod(entries, entry) {
      if (!confirm('Remove the duty method entry “' + _dutyDatedWhen(entries, entry) + ': ' + _DUTY_METHOD_NAMES[entry.method] +
        '”? The days it covered then follow the other entries.')) return;
      _writeDutyMethods(() => deleteDutyMethod(entry.effective_date, _dutyMethods.last_history_id));
    }

    document.getElementById('settings-duty-method-cancel').addEventListener('click', () => _editDutyMethod(null));
    document.getElementById('settings-duty-method-save').addEventListener('click', () => {
      const errorEl = document.getElementById('settings-duty-method-error');
      const from = document.getElementById('settings-duty-method-from').value;
      const method = document.getElementById('settings-tenant-duty-method').value;
      if (!from) { errorEl.textContent = 'Enter the date it applies from.'; return; }
      const edit = _dutyMethodEditing;
      const other = _dutyMethods.methods.find(x => x.effective_date === from && x !== edit);
      if (other && !confirm('There’s already an entry dated ' + tzShortDate(from, null) + ' (' +
        _DUTY_METHOD_NAMES[other.method] + '). Replace it?')) return;
      const body = { effective_date: from, method, base_history_id: _dutyMethods.last_history_id };
      if (edit) body.replaces = edit.effective_date;
      _writeDutyMethods(() => putDutyMethod(body));
    });

    document.getElementById('settings-pushover-token-save').addEventListener('click', async () => {
      const statusEl = document.getElementById('settings-pushover-token-status');
      const value = document.getElementById('settings-tenant-pushover-token').value.trim();
      let saved = true;
      try { await patchSettings({ pushover_api_token: value }); } catch (_) { saved = false; }
      _settingsFlashStatus(statusEl, saved ? 'Saved.' : 'Failed to save.');
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
        const data = await fetchWebhooks();
        container.innerHTML = '';
        if (data.webhooks.length === 0) {
          container.innerHTML = '<p class="settings-msg">No webhooks configured.</p>';
          return;
        }
        for (const hook of data.webhooks) {
          let events = [];
          try { events = JSON.parse(hook.events); } catch (_) {}
          const eventsText = events.map((e) => WEBHOOK_EVENT_LABELS[e] || e).join(', ');
          const typeText = hook.type === 'pushover' ? 'Pushover' : 'Webhook';
          let statusText = hook.last_triggered_at
            ? 'Last: ' + (hook.last_status != null ? 'HTTP ' + hook.last_status : 'failed') + ' at ' + fmtTzDateTime(hook.last_triggered_at)
            : 'Never triggered';
          const name = hook.label || (hook.type === 'pushover' ? 'Pushover' : hook.url);
          const row = _settingsRow(name, typeText + ' · ' + eventsText + ' · ' + statusText, { inactive: !hook.active });
          if (hook.last_error) row.querySelector('.settings-aircraft-sub').title = hook.last_error;
          _settingsFinishRow(row, {
            chip: hook.active ? null : 'disabled',
            label: name,
            items: [
              { label: hook.active ? 'Disable' : 'Enable', onSelect: (btn) => settingsToggleWebhook(hook, btn) },
              { label: 'Delete', danger: true, onSelect: (btn) => settingsDeleteWebhook(hook, btn) },
            ],
          });
          container.appendChild(row);
        }
      } catch (_) {
        container.innerHTML = '<p class="settings-msg">Failed to load webhooks.</p>';
      }
    }

    async function settingsToggleWebhook(hook, btn) {
      btn.disabled = true;
      try {
        await updateWebhook(hook.id, { active: !hook.active });
        renderSettingsWebhooksList();
      } catch (_) { btn.disabled = false; }
    }

    async function settingsDeleteWebhook(hook, btn) {
      if (!confirm('Delete this webhook?')) return;
      btn.disabled = true;
      try {
        await deleteWebhook(hook.id);
        renderSettingsWebhooksList();
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
        await createWebhook(body);
        document.getElementById('settings-add-webhook-url').value = '';
        document.getElementById('settings-add-webhook-pushover-key').value = '';
        document.getElementById('settings-add-webhook-label').value = '';
        document.getElementById('settings-add-webhook').open = false;
        renderSettingsWebhooksList();
      } catch (err) {
        _settingsFlashStatus(statusEl, err.serverError ?? 'Failed to add notification target.');
      }
    });

    document.getElementById('settings-add-webhook-cancel').addEventListener('click', () => {
      document.getElementById('settings-add-webhook').open = false;
    });

    // ── Regions export / import ───────────────────────────────────────────────

    document.getElementById('settings-regions-export').addEventListener('click', () => {
      _downloadGeoJSON(fetchRegions, 'regions.geojson');
    });

    document.getElementById('settings-regions-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await _importGeoJSON(file, 'settings-regions-status', importRegions);
      e.target.value = '';
    });

    // ── Shared map-editor helpers (used by both editor scripts below) ─────────

    // What's selected (or shared) and what's being added, on the map: the dark theme's, in
    // both themes, since the light theme's are too dark to see over imagery.
    const MAP_EDITOR_SELECTED = '${darkTokens['warning-fg']}';
    const MAP_EDITOR_ADDING = '${darkTokens['success-fg']}';

    function _setEditorStatus(elId, msg, isError) {
      const el = document.getElementById(elId);
      el.textContent = msg;
      el.style.color = isError ? 'var(--danger-fg)' : '';
    }

    // read: fetchRegions or fetchNamedPoints. A failed read downloads nothing, and says why.
    async function _downloadGeoJSON(read, filename) {
      try {
        downloadBlob(new Blob([JSON.stringify(await read())], { type: 'application/json' }), filename);
      } catch (err) {
        alert(apiErrorMessage(err, 'Failed to export.'));
      }
    }

    // write: importRegions or importNamedPoints. A file that isn't JSON fails like a refused one.
    async function _importGeoJSON(file, statusElId, write) {
      const statusEl = document.getElementById(statusElId);
      try {
        await write(JSON.parse(await file.text()));
        statusEl.textContent = 'Imported.';
      } catch (err) {
        _settingsFlashStatus(statusEl, apiErrorMessage(err, 'Import failed.'));
        return;
      }
      _settingsFlashStatus(statusEl, 'Imported.');
    }

    ${namedPointsEditorScript()}

    ${regionsEditorScript()}

    ${mapViewPickerScript()}

    ${setupGuideScript()}

  `;
}
