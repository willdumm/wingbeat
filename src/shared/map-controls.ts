import { FALLBACK_BASEMAP, overlayDefaultEnabled } from '@wingbeat/core/basemaps';
import { icon } from './icons';

/**
 * Local (per-device) basemap state, stored in localStorage — intentionally NOT synced to
 * D1/server settings: which basemap is showing, and the color corrections for each. Shared by
 * every map instance (dashboard, analytics, and the editors) so picking a style anywhere sticks
 * everywhere. Which basemaps exist, and which are in the picker, is tenant data (the
 * `basemaps` table, Settings > Basemaps).
 */
export const MAP_BASEMAP_KEY = 'ft_map_basemap';
/** Per-device keys of the removed per-device basemap list, cleared when a page loads. */
const LEGACY_MAP_LAYER_KEYS = ['ft_map_layers_enabled', 'ft_map_layers_custom'];
const MAP_LAYER_COLORS_KEY = 'ft_map_layer_colors';

/**
 * Runtime script for the page IIFE (called once per page, before any
 * `createMap()`/`sharedMapControlsScripts()` call) — defines the shared plumbing
 * for the tenant's basemaps:
 *   _ftPresets                 — the tenant's shown raster basemaps in display order
 *                                 (window.APP_BASEMAPS, from the page; Settings replaces it
 *                                 after an admin changes them)
 *   _ftVectorBasemaps          — its shown vector basemaps (window.APP_VECTOR_BASEMAPS)
 *   _ftMaplibreMaps             — the page's MapLibre maps (createMap() in maplibre.ts)
 *   _ftRestyleAll()             — rebuild every one's style
 *   _ftActiveLayerDefs()        — the layer defs that should currently be on every map
 *                                  (core's FALLBACK_BASEMAP if there are none, so a map
 *                                  always has one)
 *   _ftMapRefreshers             — one callback per initialized map (pushed by
 *                                  sharedMapControlsScripts); _ftNotifyLayersChanged()
 *                                  runs all of them so Settings edits apply live, with no
 *                                  page reload needed.
 * The docs-site showcase (no Worker behind it) assigns `_ftPresets` itself.
 */
export function mapLayersRuntimeScript(): string {
  return `
    var _ftPresets = window.APP_BASEMAPS || [];
    var _ftVectorBasemaps = window.APP_VECTOR_BASEMAPS || [];
    var _ftMaplibreMaps = []; // every map createMap() made (maplibre.ts), each with its _ftRestyle()
    function _ftRestyleAll() { _ftMaplibreMaps.forEach(function(m) { m._ftRestyle(); }); }
    var _ftMapRefreshers = [];
    try { ${JSON.stringify(LEGACY_MAP_LAYER_KEYS)}.forEach(function(k) { localStorage.removeItem(k); }); } catch (_) {}

    function _ftActiveLayerDefs() { return _ftPresets.length > 0 ? _ftPresets.slice() : [${JSON.stringify(FALLBACK_BASEMAP)}]; }

    function _ftNotifyLayersChanged() { _ftMapRefreshers.forEach(function(fn) { fn(); }); }
  `;
}

/**
 * HTML for the bottom map controls bar (zoom +/− and basemap switcher).
 * `idPrefix` scopes all element IDs so multiple instances can coexist on the same page
 * (e.g. 'rg-' → id="rg-map-controls"). Defaults to '' for the primary dashboard map.
 * Class aliases (map-controls-wrap, map-controls-bar, map-zoom-in/out) are always added
 * so sharedMapControlsStyles() covers every instance with one CSS block.
 * The basemap-style buttons themselves are rendered at runtime by
 * sharedMapControlsScripts() from whatever layers are currently active, since the set
 * of layers is tenant data — this only emits the empty container for them.
 * Optionally appends an extra group of buttons (pass the inner button HTML, without wrapper divs).
 * The map's credits sit at the map's bottom right (above the bar on a phone) behind an (i)
 * button, as MapLibre's compact attribution does in the app: some (the elevation tint's) run to
 * several lines. A click on the map closes them.
 */
export function sharedMapControlsMarkup(extraButtons?: string, idPrefix = ''): string {
  const extra = extraButtons
    ? `\n          <div class="controls-divider"></div>\n          <div class="controls-group">\n            ${extraButtons}\n          </div>`
    : '';
  return `
      <div id="${idPrefix}map-controls" class="map-controls-wrap">
        <div id="${idPrefix}map-attribution-row" class="map-controls-attribution-row" data-open="false" hidden>
          <button id="${idPrefix}map-attribution-toggle" type="button" class="map-attribution-toggle" title="Map credits" aria-label="Map credits" aria-expanded="false" aria-controls="${idPrefix}map-attribution">${icon('info', { size: 14 })}</button>
          <div id="${idPrefix}map-attribution" class="map-controls-attribution"></div>
        </div>
        <div id="${idPrefix}map-controls-bar" class="map-controls-bar">
          <div class="controls-group">
            <button id="${idPrefix}zoom-in" class="controls-btn map-zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
            <button id="${idPrefix}zoom-out" class="controls-btn map-zoom-out" title="Zoom out" aria-label="Zoom out">&#8722;</button>
          </div>
          <div class="controls-divider"></div>
          <div class="controls-group" id="${idPrefix}map-style-group"></div>${extra}
        </div>
      </div>`;
}

/** CSS for the bottom map controls bar, attribution row, zoom, and basemap buttons. */
export function sharedMapControlsStyles(): string {
  return `
    #map-controls, .map-controls-wrap {
      position: absolute;
      bottom: 0.5rem;
      left: 0.5rem;
      right: 0.5rem;
      z-index: 500;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
      pointer-events: none;
    }

    /* The page-level map runs to the screen's bottom edge: clear the home indicator. */
    #map-controls { bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px)); }

    .map-controls-attribution-row {
      position: absolute;
      right: 0;
      bottom: 0;
      z-index: 1;  /* open, over the bar on a narrow map */
      display: flex;
      flex-direction: row-reverse;
      align-items: flex-end;
      gap: 0.35rem;
      max-width: min(320px, 100%);
      pointer-events: auto;
    }
    .map-controls-attribution-row[hidden] { display: none; }
    .map-controls-attribution-row[data-open="true"] {
      padding: 0.2rem 0.2rem 0.2rem 0.6rem;
      margin: 0 calc(-0.2rem - 1px) calc(-0.2rem - 1px) 0;  /* the button stays put */
      background: var(--surface-float);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-md);
      backdrop-filter: blur(14px) saturate(1.1);
      -webkit-backdrop-filter: blur(14px) saturate(1.1);
      box-shadow: var(--shadow-md);
    }
    .map-controls-attribution-row:not([data-open="true"]) .map-controls-attribution { display: none; }

    .map-attribution-toggle {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      padding: 0;
      color: var(--text-muted);
      background: var(--surface-float);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-pill);
      box-shadow: var(--shadow-md);
      cursor: pointer;
      transition: color var(--duration-fast) var(--ease-standard);
    }
    .map-attribution-toggle:hover { color: var(--text-secondary); }
    .map-controls-attribution-row[data-open="true"] .map-attribution-toggle {
      background: none;
      border-color: transparent;
      box-shadow: none;
    }

    #map-attribution, .map-controls-attribution {
      font-family: var(--font-body);
      font-size: 0.63rem;
      color: var(--text-muted);
      line-height: 1.4;
    }

    #map-attribution a, .map-controls-attribution a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }

    #map-controls-bar, .map-controls-bar {
      display: flex;
      align-items: stretch;
      max-width: calc(100% - 4rem);  /* clear of the credits' button */
      background: var(--surface-float);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-md);
      overflow-x: auto;
      overflow-y: hidden;
      backdrop-filter: blur(14px) saturate(1.1);
      -webkit-backdrop-filter: blur(14px) saturate(1.1);
      pointer-events: auto;
      box-shadow: var(--shadow-md);
    }

    /* The basemap switcher's button count depends on the tenant's basemaps,
       so on narrow screens it can outgrow the original 3-button
       width this bar was designed for: it scrolls horizontally, in the map's full width,
       and the credits' button goes above it, at the right. */
    @media (max-width: 640px) {
      .map-controls-attribution-row { position: static; align-self: flex-end; }
      #map-controls-bar, .map-controls-bar {
        max-width: 100%;
        -webkit-overflow-scrolling: touch;
      }
    }

    .controls-group { display: flex; align-items: stretch; }

    .controls-divider { width: 1px; background: var(--border); flex-shrink: 0; }

    .controls-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      font-family: var(--font-ui);
      font-size: 0.75rem;
      font-weight: var(--weight-semibold);
      cursor: pointer;
      padding: 0.5rem 0.85rem;
      transition: background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
      white-space: nowrap;
      line-height: 1;
    }

    .controls-btn + .controls-btn { border-left: 1px solid var(--border); }

    .controls-btn:hover:not(.active) {
      background: var(--surface-hover);
      color: var(--text-secondary);
    }

    .controls-btn.active {
      background: var(--accent-surface);
      color: var(--accent-text);
    }

    #zoom-in, #zoom-out, .map-zoom-in, .map-zoom-out { font-size: 1rem; padding: 0.45rem 0.75rem; }

    .map-style-btn { letter-spacing: 0.04em; text-transform: uppercase; }

  `;
}

/**
 * Local (per-device) map color-correction channels, stored per-layer in
 * `ft_map_layer_colors` — intentionally NOT synced to D1/server settings. Each value is
 * a CSS filter percentage (100 = no correction, also the reset-to-default value).
 */
const MAP_COLOR_MIN = 0;
const MAP_COLOR_MAX = 200;
const MAP_COLOR_DEFAULT = 100;
const MAP_COLOR_CHANNELS = [
  { id: 'sat', legacyKey: 'ft_map_color_sat', label: 'Saturation' },
  { id: 'con', legacyKey: 'ft_map_color_con', label: 'Contrast' },
  { id: 'bri', legacyKey: 'ft_map_color_bri', label: 'Brightness' },
] as const;

/**
 * JS defining `_ftLayerColor(id)`, which reads a layer's stored correction (falling
 * back to the pre-per-layer `ft_map_color_*` keys for `id === 'map'`, since that's the
 * only layer the old global correction ever visually applied to).
 */
function layerColorReadLogic(): string {
  return `
    function _ftLayerColor(id) {
      var raw = localStorage.getItem('${MAP_LAYER_COLORS_KEY}');
      var all = {};
      try { all = raw ? JSON.parse(raw) : {}; } catch (_) { all = {}; }
      var stored = all[id];
      if (stored) {
        return {
          sat: typeof stored.sat === 'number' ? stored.sat : ${MAP_COLOR_DEFAULT},
          con: typeof stored.con === 'number' ? stored.con : ${MAP_COLOR_DEFAULT},
          bri: typeof stored.bri === 'number' ? stored.bri : ${MAP_COLOR_DEFAULT},
        };
      }
      if (id === 'map') {
        var legacySat = localStorage.getItem('${MAP_COLOR_CHANNELS[0].legacyKey}');
        var legacyCon = localStorage.getItem('${MAP_COLOR_CHANNELS[1].legacyKey}');
        var legacyBri = localStorage.getItem('${MAP_COLOR_CHANNELS[2].legacyKey}');
        if (legacySat !== null || legacyCon !== null || legacyBri !== null) {
          var pSat = parseFloat(legacySat);
          var pCon = parseFloat(legacyCon);
          var pBri = parseFloat(legacyBri);
          return {
            sat: !isNaN(pSat) ? pSat : ${MAP_COLOR_DEFAULT},
            con: !isNaN(pCon) ? pCon : ${MAP_COLOR_DEFAULT},
            bri: !isNaN(pBri) ? pBri : ${MAP_COLOR_DEFAULT},
          };
        }
      }
      return { sat: ${MAP_COLOR_DEFAULT}, con: ${MAP_COLOR_DEFAULT}, bri: ${MAP_COLOR_DEFAULT} };
    }
  `;
}

/**
 * Runtime script for the page IIFE (called once per page, like themeRuntimeScript) —
 * defines the per-layer color-correction helpers used by createMap() (maplibre.ts) and the
 * Settings > Map layers row builder:
 *   _ftLayerColor(id)             — read a layer's correction (see layerColorReadLogic)
 *   _ftSetLayerColor(id, ch, val) — persist + reapply if this layer is the active one
 *   _ftApplyActiveLayerColor()    — restyle the page's maps
 *   _ftBuildColorSliders(el, id)  — fill `el` with the 3 sliders + reset button for `id`
 */
export function mapLayerColorRuntimeScript(): string {
  return `
    ${layerColorReadLogic()}

    function _ftSetLayerColor(id, channel, val) {
      var raw = localStorage.getItem('${MAP_LAYER_COLORS_KEY}');
      var all = {};
      try { all = raw ? JSON.parse(raw) : {}; } catch (_) { all = {}; }
      var cur = all[id] || _ftLayerColor(id);
      cur[channel] = val;
      all[id] = cur;
      localStorage.setItem('${MAP_LAYER_COLORS_KEY}', JSON.stringify(all));
      _ftApplyActiveLayerColor();
    }

    function _ftApplyActiveLayerColor() {
      // The correction is in each map's style (core's mapColorPaint).
      _ftRestyleAll();
    }

    var _ftColorChannels = [${MAP_COLOR_CHANNELS.map((ch) => `{ id: '${ch.id}', label: '${ch.label}' }`).join(', ')}];

    function _ftBuildColorSliders(container, layerId) {
      container.innerHTML = '';
      var colors = _ftLayerColor(layerId);
      _ftColorChannels.forEach(function(ch) {
        var row = document.createElement('div');
        row.className = 'settings-row';
        var label = document.createElement('span');
        label.className = 'settings-row-title';
        label.textContent = ch.label;
        var controls = document.createElement('div');
        controls.className = 'settings-map-color-row';
        var slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '${MAP_COLOR_MIN}';
        slider.max = '${MAP_COLOR_MAX}';
        slider.step = '5';
        slider.value = String(colors[ch.id]);
        var valueSpan = document.createElement('span');
        valueSpan.className = 'settings-map-color-value';
        valueSpan.textContent = colors[ch.id] + '%';
        slider.addEventListener('input', function() {
          var n = Math.max(${MAP_COLOR_MIN}, Math.min(${MAP_COLOR_MAX}, parseFloat(slider.value)));
          if (isNaN(n)) return;
          _ftSetLayerColor(layerId, ch.id, n);
          valueSpan.textContent = n + '%';
        });
        controls.appendChild(slider);
        controls.appendChild(valueSpan);
        row.appendChild(label);
        row.appendChild(controls);
        container.appendChild(row);
      });
      var resetWrap = document.createElement('div');
      resetWrap.className = 'settings-edit-form-actions';
      var resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'btn-secondary';
      resetBtn.textContent = 'Reset to default';
      resetBtn.addEventListener('click', function() {
        _ftColorChannels.forEach(function(ch) { _ftSetLayerColor(layerId, ch.id, ${MAP_COLOR_DEFAULT}); });
        _ftBuildColorSliders(container, layerId);
      });
      resetWrap.appendChild(resetBtn);
      container.appendChild(resetWrap);
    }
  `;
}

/**
 * Settings' "Map colors" list (on the Appearance page): one row per basemap in the map's style
 * switcher, each with a "Colors" disclosure for this device's color corrections. Which
 * basemaps there are is tenant data, managed under Map content (basemap-settings.ts).
 * Populated at runtime by mapLayersSettingsScript().
 */
export function mapLayersSettingsRowsMarkup(): string {
  return `
    <div id="settings-map-layers-list" class="settings-list"></div>
  `;
}

/**
 * Runtime script wiring the "Map layers" settings section: renderMapLayersSettings()
 * (called from openSettings(), and after an admin changes the basemaps) builds one row per
 * basemap in `_ftPresets`, each with a "Colors" disclosure (expands _ftBuildColorSliders()).
 * Also defines _ftLookupTileMetadata(), shared by the basemap and overlay forms. Depends on
 * mapLayersRuntimeScript() (_ftPresets) and mapLayerColorRuntimeScript()
 * (_ftBuildColorSliders) having already run — order doesn't matter in practice, since all
 * three are hoisted function declarations sharing one page IIFE, but data reads here happen
 * after both have executed.
 */
export function mapLayersSettingsScript(): string {
  return `
    // "Look up details" for any tile-layer form (this section's add-layer form and the
    // overlay add/edit forms in settings.ts): asks /api/tile-metadata (admin-only) what
    // the tile server publishes about itself and fills in whichever of the form's
    // fields are still empty — never overwriting something already typed. The URL
    // field is only replaced when it doesn't hold a tile template yet (a pasted
    // TileJSON or MapServer link). \`fields\` maps url/label/attribution/maxZoom to
    // the form's inputs.
    async function _ftLookupTileMetadata(btn, status, fields) {
      var url = fields.url.value.trim();
      if (!url) { status.textContent = 'Enter the tile URL first.'; return; }
      btn.disabled = true;
      status.textContent = 'Looking up the tile server…';
      try {
        var meta = (await fetchTileMetadata(url)).metadata;
        if (!meta) {
          status.textContent = 'This tile server doesn\\'t publish any details. Fill them in by hand.';
        } else {
          var filled = [];
          var fill = function(input, value, name) {
            if (!input || value === undefined || value === null || value === '' || input.value.trim()) return;
            input.value = String(value);
            filled.push(name);
          };
          if (meta.url && !/\\{z\\}/i.test(url)) { fields.url.value = meta.url; filled.push('tile URL'); }
          fill(fields.label, meta.label, 'label');
          fill(fields.attribution, meta.attribution, 'attribution');
          fill(fields.maxZoom, meta.maxZoom, 'max zoom');
          var from = meta.source === 'arcgis' ? 'ArcGIS service info' : 'TileJSON';
          status.textContent = filled.length
            ? 'Filled in ' + filled.join(', ') + ' from the server\\'s ' + from + '. Check them before saving.'
            : 'Found the server\\'s ' + from + ', but every field it covers is already filled in.';
        }
      } catch (err) {
        // A lookup the server refused (or that failed) says why: an ApiHttpError's message.
        status.textContent = err.status ? 'Lookup failed: ' + err.message + '.' : 'Couldn\\'t reach the server.';
      }
      btn.disabled = false;
    }

    function _ftBuildLayerRow(id, label) {
      var row = document.createElement('div');
      row.className = 'settings-aircraft-row';

      var info = document.createElement('div');
      info.className = 'settings-aircraft-info';
      var nameEl = document.createElement('span');
      nameEl.className = 'settings-aircraft-name';
      nameEl.textContent = label;
      info.appendChild(nameEl);

      // The row discloses its colour sliders: a click on it, or on its chevron.
      var actions = document.createElement('div');
      actions.className = 'settings-aircraft-actions';
      var colorsBtn = document.createElement('button');
      colorsBtn.type = 'button';
      colorsBtn.className = 'row-menu-btn';
      colorsBtn.setAttribute('aria-label', 'Colors for ' + label);
      colorsBtn.setAttribute('aria-expanded', 'false');
      colorsBtn.innerHTML = '<span class="chevron">' + ${JSON.stringify(icon('chevron-right', { size: 14 }))} + '</span>';
      var panel = document.createElement('div');
      panel.className = 'settings-edit-form';
      panel.style.display = 'none';
      var toggle = function() {
        var open = panel.style.display === 'none';
        if (open) _ftBuildColorSliders(panel, id);
        panel.style.display = open ? '' : 'none';
        colorsBtn.setAttribute('aria-expanded', String(open));
        colorsBtn.querySelector('.chevron').dataset.open = String(open);
      };
      colorsBtn.addEventListener('click', function(e) { e.stopPropagation(); toggle(); });
      actions.appendChild(colorsBtn);

      row.classList.add('settings-row-link');
      row.addEventListener('click', toggle);
      row.appendChild(info);
      row.appendChild(actions);
      var wrap = document.createElement('div');
      wrap.appendChild(row);
      wrap.appendChild(panel);
      return wrap;
    }

    function renderMapLayersSettings() {
      var container = document.getElementById('settings-map-layers-list');
      if (!container) return;
      container.innerHTML = '';
      _ftPresets.forEach(function(p) { container.appendChild(_ftBuildLayerRow(p.id, p.label)); });
    }
  `;
}

/** Wires the controls bar's zoom buttons (sharedMapControlsMarkup()). */
function zoomButtonsScript(mapVar: string, idPrefix: string, rootExpr: string): string {
  return `
      ${rootExpr}.getElementById('${idPrefix}zoom-in').addEventListener('click', function() { if (${mapVar}) ${mapVar}.zoomIn(); });
      ${rootExpr}.getElementById('${idPrefix}zoom-out').addEventListener('click', function() { if (${mapVar}) ${mapVar}.zoomOut(); });
  `;
}

/**
 * The credits row: its (i) toggle, and `_showAttrib(parts)`, which
 * fills it with each credit (HTML), joined by dots, and hides it when there are none. A click
 * on the map closes it.
 * Attribution is HTML (links, &copy;), but custom layers' come from this device's
 * localStorage and overlays' from the admin: keep text and plain http(s) links only, built
 * as DOM nodes (no innerHTML), so no tag or attribute of the source survives.
 */
function attributionRowScript(mapVar: string, idPrefix: string, rootExpr: string): string {
  return `
      function _appendAttribNodes(src, dest) {
        for (var n = src.firstChild; n; n = n.nextSibling) {
          if (n.nodeType === 3) {
            dest.appendChild(document.createTextNode(n.nodeValue));
          } else if (n.nodeType === 1) {
            var href = n.nodeName === 'A' ? (n.getAttribute('href') || '').trim() : '';
            if (/^https?:\\/\\//i.test(href)) {
              var a = document.createElement('a');
              a.href = href;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              _appendAttribNodes(n, a);
              dest.appendChild(a);
            } else if (!/^(SCRIPT|STYLE)$/.test(n.nodeName)) {
              _appendAttribNodes(n, dest);
            }
          }
        }
      }
      function _attribNodes(html) {
        var tpl = document.createElement('template');
        tpl.innerHTML = html;
        var frag = document.createDocumentFragment();
        _appendAttribNodes(tpl.content, frag);
        return frag;
      }

      var _attribRow = ${rootExpr}.getElementById('${idPrefix}map-attribution-row');
      var _attribToggle = ${rootExpr}.getElementById('${idPrefix}map-attribution-toggle');
      function _openAttrib(open) {
        _attribRow.setAttribute('data-open', open ? 'true' : 'false');
        _attribToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      _attribToggle.addEventListener('click', function() { _openAttrib(_attribRow.getAttribute('data-open') !== 'true'); });
      ${mapVar}.on('click', function() { _openAttrib(false); });

      function _showAttrib(parts) {
        var el = ${rootExpr}.getElementById('${idPrefix}map-attribution');
        if (!el) return;
        el.textContent = '';
        _attribRow.hidden = !parts.length;
        parts.forEach(function(p, i) {
          if (i > 0) el.appendChild(document.createTextNode(' · '));
          el.appendChild(_attribNodes(p));
        });
      }
  `;
}

/**
 * Wires the controls bar (sharedMapControlsMarkup()) to a map from createMap()
 * (maplibre.ts): the zoom buttons, the credits (each source's `attribution` in the style: the basemap's, the
 * overlays', then the page's own, e.g. the elevation DEM's) and the basemap switcher, whose
 * buttons are every basemap _ftMapBasemaps() offers, vector ones too. Switching restyles the
 * map (_ftRestyle()). Registers with `_ftMapRefreshers`, so a Settings change to the basemaps
 * applies at once. `idPrefix` must match the value used in sharedMapControlsMarkup().
 * `rootExpr` is where the controls' elements are looked up: `document`, or a shadow root
 * (the showcase demos). Wrapped in an IIFE so multiple instances on the same page don't
 * conflict.
 */
export function sharedMapControlsScripts(mapVar: string, idPrefix = '', rootExpr = 'document'): string {
  return `
    (function() {
      ${zoomButtonsScript(mapVar, idPrefix, rootExpr)}
      ${attributionRowScript(mapVar, idPrefix, rootExpr)}

      var _attribKey = null;
      function _updateAttrib() {
        var style = ${mapVar}.getStyle && ${mapVar}.getStyle();
        if (!style || !style.sources) return;
        var parts = [];
        Object.keys(style.sources).forEach(function(id) {
          var a = style.sources[id].attribution;
          if (a && parts.indexOf(a) === -1) parts.push(a);
        });
        var key = parts.join('\\n');
        if (key === _attribKey) return;
        _attribKey = key;
        _showAttrib(parts);
      }
      ${mapVar}.on('styledata', _updateAttrib);
      ${mapVar}.on('sourcedata', function(e) { if (e.sourceDataType === 'metadata') _updateAttrib(); });

      var _styleGroup = ${rootExpr}.getElementById('${idPrefix}map-style-group');

      function _ftSwitchStyle(id) {
        ${mapVar}._ftBasemapId = id;
        ${mapVar}.getContainer().setAttribute('data-basemap', id);
        localStorage.setItem('${MAP_BASEMAP_KEY}', id);
        _styleGroup.querySelectorAll('.map-style-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.style === id); b.setAttribute('aria-pressed', b.dataset.style === id ? 'true' : 'false'); });
        // Reset to the new basemap's default overlays — a viewer's manual overlay toggle
        // applies to the basemap they made it on, not to whichever one they switch to next
        // (see _ftClearOverlayOverrides in overlayLegendRuntimeScript) — only present on
        // pages that include the overlay legend, hence the guards.
        if (typeof _ftClearOverlayOverrides === 'function') _ftClearOverlayOverrides();
        if (typeof _ftRenderOverlayLegend === 'function') _ftRenderOverlayLegend();
        _ftRestyle(${mapVar});
      }

      function _ftRebuildStyleButtons() {
        _styleGroup.innerHTML = '';
        _ftMapBasemaps().forEach(function(b) {
          var btn = document.createElement('button');
          btn.className = 'controls-btn map-style-btn';
          btn.dataset.style = b.id;
          btn.textContent = b.label || b.id;
          if (b.id === ${mapVar}._ftBasemapId) btn.classList.add('active');
          btn.addEventListener('click', function() { _ftSwitchStyle(b.id); });
          _styleGroup.appendChild(btn);
        });
      }
      _ftRebuildStyleButtons();

      // After Settings changes the basemaps: stay on the current one if it's still offered
      // (redrawn, in case it was edited), else switch to the first.
      _ftMapRefreshers.push(function() {
        var basemaps = _ftMapBasemaps();
        if (basemaps.some(function(b) { return b.id === ${mapVar}._ftBasemapId; })) _ftRestyle(${mapVar});
        else if (basemaps[0]) _ftSwitchStyle(basemaps[0].id);
        _ftRebuildStyleButtons();
      });
    })();
  `;
}

/**
 * Tenant-configured tile overlays (extra layers shown on top of the basemap, e.g. a
 * sectional chart or custom imagery), listed in a map legend. Distinct from
 * everything above this point in the file: those manage the per-device, mutually
 * exclusive basemap; overlays are shared tenant config (from `/api/bootstrap` or
 * `/api/overlays`, held in the page-level `overlayList` variable — see
 * dashboard/scripts/state.ts, analytics/scripts/map.ts, and each editor's `_open*`
 * function) and independently toggleable, so more than one can be on at once.
 *
 * Shown wherever a map is displayed (tracker, flight stats, regions/points editors) —
 * one instance per map, mounted via tileOverlayLegendMountScript(). See that
 * function's doc comment for how the markup/runtime/mount pieces below fit together.
 *
 * `default_enabled` (set by an admin in Settings) is the tenant-wide starting
 * state; a viewer's own on/off choice is layered on top in `MAP_OVERLAYS_KEY` and
 * takes precedence once made — see _ftOverlayEnabled(). That choice only applies to
 * the basemap it was made on, though: switching basemaps clears it, resetting
 * overlays to the new basemap's default — see _ftClearOverlayOverrides().
 */
const MAP_OVERLAYS_KEY = 'ft_map_overlays_enabled';

/** The "Overlays" toggle button, added to the map controls bar's extraButtons slot
 * (mirroring point-picker/elevation-tool's own buttons there). Hidden by default;
 * shown by this instance's render function (see tileOverlayLegendMountScript()) only
 * once at least one overlay is configured, so tenants with none configured see no new
 * UI at all. `idPrefix` must match the value passed to sharedMapControlsMarkup() and
 * tileOverlayLegendMountScript() for this same map instance. */
export function tileOverlayLegendButtonMarkup(idPrefix = ''): string {
  return `<button id="${idPrefix}overlay-legend-btn" class="controls-btn" title="Map overlays" style="display:none">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            </button>`;
}

/** The popover panel itself — anchored above the map controls bar (bottom-center),
 * toggled open/closed by the button above. Placed in the map-wrapper alongside
 * sharedMapControlsMarkup()'s own markup, not inside it, since it needs to float
 * independently above the bar rather than inside its button row. `idPrefix` must match
 * the value passed to tileOverlayLegendButtonMarkup()/tileOverlayLegendMountScript(). */
export function tileOverlayLegendPanelMarkup(idPrefix = ''): string {
  return `
    <div id="${idPrefix}overlay-legend-panel" class="overlay-legend-panel map-legend-card hidden">
      <div class="map-legend-label">Overlays</div>
      <div id="${idPrefix}overlay-legend-list" class="overlay-legend-list"></div>
    </div>
  `;
}

/** CSS for the overlay legend button state and its popover panel, plus the shared
 * floating map-legend card (.map-legend-card / .map-legend-label) that this panel and the
 * Flight Trends layer legend are both built from. */
export function tileOverlayLegendStyles(): string {
  return `
    /* Floating legend over the live map: design-system glass, same as the controls bar. */
    .map-legend-card {
      background: var(--surface-float);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-md);
      padding: var(--space-2) var(--space-3);
      backdrop-filter: var(--glass-blur);
      -webkit-backdrop-filter: var(--glass-blur);
      box-shadow: var(--shadow-md);
    }

    .map-legend-label {
      display: flex;
      align-items: center;
      font-family: var(--font-ui);
      font-size: var(--size-2xs);
      font-weight: var(--weight-bold);
      text-transform: uppercase;
      letter-spacing: var(--tracking-caps);
      color: var(--text-muted);
    }

    .overlay-legend-panel {
      position: absolute;
      /* Anchored above the map-controls bar, which grows upward with the attribution
         text above it (#map-controls, z-index 500) — sit at a higher z-index so this
         panel always paints (and receives clicks) on top of that text when the two
         overlap, rather than being visually and pointer-wise buried beneath it. */
      bottom: 4.2rem;
      left: 50%;
      transform: translateX(-50%);
      z-index: 600;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 160px;
      max-width: calc(100vw - 1rem);
      max-height: 40vh;
      overflow-y: auto;
      pointer-events: auto;
    }

    #overlay-legend-panel { bottom: calc(4.2rem + env(safe-area-inset-bottom, 0px)); }

    .overlay-legend-panel.hidden { display: none; }

    .overlay-legend-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .overlay-legend-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      white-space: nowrap;
      font-family: var(--font-body);
      font-size: 0.78rem;
      color: var(--text-secondary);
    }

    .overlay-legend-row input[type="checkbox"] {
      flex-shrink: 0;
      margin: 0;
      width: 14px;
      height: 14px;
      accent-color: var(--accent);
      cursor: pointer;
    }
    .overlay-legend-row label { cursor: pointer; }
  `;
}

/**
 * Runtime script for the page IIFE (called once per page, like mapLayersRuntimeScript)
 * — defines the overlay-state helpers shared by every mounted legend instance:
 *   _ftGetOverlayOverrides/_ftSetOverlayOverride — per-device on/off overrides
 *   _ftCurrentBasemapId/_ftOverlayDefaultEnabled/_ftOverlayEnabled — resolve an
 *     overlay's effective on/off state (admin default, possibly per-basemap, overridden
 *     by the viewer's own choice)
 *   _ftOverlayLegendRefreshers/_ftRenderOverlayLegend() — one refresh callback per
 *     mounted legend instance (pushed by tileOverlayLegendMountScript());
 *     _ftRenderOverlayLegend() runs all of them, mirroring
 *     _ftMapRefreshers/_ftNotifyLayersChanged() for basemap layers, so a single call
 *     (after the overlays fetch, or after an admin add/edit/delete in Settings) keeps
 *     every map on the page in sync with no reload needed.
 */
export function overlayLegendRuntimeScript(): string {
  return `
    var _ftOverlayLegendRefreshers = [];
    function _ftRenderOverlayLegend() { _ftOverlayLegendRefreshers.forEach(function(fn) { fn(); }); }

    function _ftGetOverlayOverrides() {
      try {
        var raw = localStorage.getItem('${MAP_OVERLAYS_KEY}');
        var obj = raw ? JSON.parse(raw) : {};
        return (obj && typeof obj === 'object') ? obj : {};
      } catch (_) { return {}; }
    }
    function _ftSetOverlayOverride(id, enabled) {
      var overrides = _ftGetOverlayOverrides();
      overrides[String(id)] = enabled;
      localStorage.setItem('${MAP_OVERLAYS_KEY}', JSON.stringify(overrides));
    }
    // Wipes every per-device override so overlays fall back to their admin-set default
    // for whichever basemap is now active. Called by _ftSwitchStyle() on every basemap
    // switch, since a viewer's manual on/off choice is meant to apply to the basemap
    // they made it on, not follow them to a different one.
    function _ftClearOverlayOverrides() { localStorage.removeItem('${MAP_OVERLAYS_KEY}'); }
    // The currently active basemap's id, read from whichever map's container carries
    // it (set by createMap()/_ftSwitchStyle() — shared across every
    // map instance on the page).
    function _ftCurrentBasemapId() {
      var el = document.querySelector('.maplibregl-map[data-basemap]');
      return el ? el.getAttribute('data-basemap') : null;
    }

    // An overlay's default on/off state can lean differently per basemap (core's
    // overlayDefaultEnabled()).
    ${overlayDefaultEnabled.toString()}
    function _ftOverlayDefaultEnabled(ov) {
      return overlayDefaultEnabled(ov, _ftCurrentBasemapId());
    }

    function _ftOverlayEnabled(ov) {
      var overrides = _ftGetOverlayOverrides();
      var key = String(ov.id);
      return Object.prototype.hasOwnProperty.call(overrides, key) ? !!overrides[key] : _ftOverlayDefaultEnabled(ov);
    }
  `;
}

/**
 * Mounts the overlay legend for one map instance (createMap() in maplibre.ts) — call once
 * per map, right after sharedMapControlsScripts() for that same instance (needs
 * overlayLegendRuntimeScript() to have already run once earlier on the page, and this
 * instance's button/panel markup, from tileOverlayLegendButtonMarkup()/
 * tileOverlayLegendPanelMarkup() with the same `idPrefix`, already in the DOM).
 *
 * Wrapped in an IIFE so each instance's state stays private: the dashboard's main map plus
 * the regions/points editors, reachable from the same Settings modal, are mounted on the
 * same page. The overlays that are on go into the map's style (`_ftOverlays`, restyled by
 * _ftRestyle()), in overlayList's order; an edited overlay restyles too. Registers this
 * instance's render function with `_ftOverlayLegendRefreshers`, so a single
 * `_ftRenderOverlayLegend()` refreshes it along with every other mounted instance, and
 * renders once immediately so the legend reflects whatever `overlayList` already holds.
 */
export function tileOverlayLegendMountScript(mapVar: string, idPrefix = ''): string {
  return `
    (function() {
      var _ftOverlaysKey = '[]';
      function _ftSyncOverlays() {
        var on = (overlayList || []).filter(_ftOverlayEnabled);
        var key = JSON.stringify(on);
        if (key === _ftOverlaysKey) return;
        _ftOverlaysKey = key;
        ${mapVar}._ftOverlays = on;
        _ftRestyle(${mapVar});
      }

      function _ftRenderThisOverlayLegend() {
        var btn = document.getElementById('${idPrefix}overlay-legend-btn');
        var panel = document.getElementById('${idPrefix}overlay-legend-panel');
        var list = document.getElementById('${idPrefix}overlay-legend-list');
        if (!btn || !panel || !list) return;

        if (!overlayList || overlayList.length === 0) {
          btn.style.display = 'none';
          panel.classList.add('hidden');
          btn.classList.remove('active');
          _ftSyncOverlays();
          return;
        }

        btn.style.display = '';
        list.innerHTML = '';
        overlayList.forEach(function(ov) {
          var row = document.createElement('div');
          row.className = 'overlay-legend-row';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.id = '${idPrefix}overlay-legend-cb-' + ov.id;
          cb.checked = _ftOverlayEnabled(ov);
          cb.addEventListener('change', function() {
            _ftSetOverlayOverride(ov.id, cb.checked);
            _ftSyncOverlays();
          });
          var label = document.createElement('label');
          label.setAttribute('for', cb.id);
          label.textContent = ov.label;
          row.appendChild(cb);
          row.appendChild(label);
          list.appendChild(row);
        });

        _ftSyncOverlays();
      }

      _ftOverlayLegendRefreshers.push(_ftRenderThisOverlayLegend);
      _ftRenderThisOverlayLegend();

      var btn = document.getElementById('${idPrefix}overlay-legend-btn');
      var panel = document.getElementById('${idPrefix}overlay-legend-panel');
      if (!btn || !panel) return;
      btn.addEventListener('click', function() {
        var willOpen = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !willOpen);
        btn.classList.toggle('active', willOpen);
      });
    })();
  `;
}
