import { Env } from '../types';

/**
 * Local (per-device) basemap layer configuration, stored in localStorage —
 * intentionally NOT synced to D1/server settings. Shared by every map instance
 * (dashboard, analytics, and the editors) so picking a style anywhere sticks
 * everywhere, and so does enabling/disabling a layer or adding a custom one.
 */
const MAP_BASEMAP_KEY = 'ft_map_basemap';
const MAP_LAYERS_ENABLED_KEY = 'ft_map_layers_enabled';
const MAP_LAYERS_CUSTOM_KEY = 'ft_map_layers_custom';
const MAP_LAYER_COLORS_KEY = 'ft_map_layer_colors';

interface BasemapPreset {
  id: string;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
  /** Only set true when `url` actually contains `{r}` — otherwise Leaflet's retina
   * fallback silently fetches tiles a zoom level deeper (4x the requests on retina
   * screens) instead of real @2x tiles, which is what overloaded OpenTopoMap's
   * server and caused gray tiles on iPad/iPhone. */
  detectRetina?: boolean;
  /**
   * Set only for presets that require a hoster-held key (e.g. Carto). `url` is then
   * the *upstream* template — fetched server-side by the `/api/tiles/:providerId`
   * proxy, never by the browser directly — with `{KEY}` substituted for the secret
   * named here (read from `env[secretEnvVar]`, a Worker secret, never per-tenant D1
   * data).
   */
  secretEnvVar?: string;
}

/**
 * Built-in basemap choices. Order here is the default display order.
 *
 * This is also the server-side registry for the keyed-tile proxy (`/api/tiles/...`
 * in src/index.ts) — the *only* place allowed to construct an upstream tile URL. A
 * preset's `url` is the real upstream template regardless of whether it's keyed;
 * `clientBasemapPresets()` is what rewrites it to a same-origin proxy path for
 * presets that have a `secretEnvVar`.
 */
const BASEMAP_PRESETS: BasemapPreset[] = [
  {
    id: 'map',
    label: 'Map',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key={KEY}',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 18,
    secretEnvVar: 'CARTO_API_KEY',
  },
  {
    id: 'topo',
    label: 'Topo',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
  },
  {
    id: 'usgstopo',
    label: 'USGS Topo',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles courtesy of the <a href="https://www.usgs.gov/" target="_blank">U.S. Geological Survey</a>',
    maxZoom: 16,
  },
  {
    id: 'usgsimagerytopo',
    label: 'USGS Imagery Topo',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles courtesy of the <a href="https://www.usgs.gov/" target="_blank">U.S. Geological Survey</a>',
    maxZoom: 16,
  },
  {
    id: 'satellite',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 18,
    detectRetina: true,
  },
];

/**
 * The preset list for a page with no app Worker behind it (the docs site's showcase):
 * every preset, with keyed ones still carrying their `{KEY}` placeholder. The page
 * fills it in at runtime from a public, referrer-restricted key, or drops those presets
 * when it has none (see src/showcase/scripts.ts).
 */
export function staticSiteBasemapPresets(): BasemapPreset[] {
  return BASEMAP_PRESETS;
}

/** Layers enabled by default on a device that has never touched this setting. */
const DEFAULT_ENABLED_PRESETS = ['map', 'topo', 'satellite'];

/** Reads a hoster/deployment-level tile provider secret out of the Worker's `env`.
 * Never per-tenant — same dynamic-key cast pattern as `tenantDb()` in src/index.ts,
 * since the set of possible env var names is open-ended (one per keyed provider). */
export function readEnvSecret(env: Env, key: string): string | undefined {
  return (env as unknown as Record<string, string | undefined>)[key] || undefined;
}

/** Looks up a keyed preset by id for the tile proxy route. Returns undefined for an
 * unknown id or a preset that isn't keyed (proxying a keyless preset is undesirable, so
 * the route 404s on it same as an unknown id). */
export function keyedBasemapPreset(id: string): BasemapPreset | undefined {
  return BASEMAP_PRESETS.find((p) => p.id === id && p.secretEnvVar);
}

/** Substitutes `{s}`/`{z}`/`{x}`/`{y}`/`{r}`/`{KEY}` into a preset's upstream URL
 * template. The only place allowed to build an upstream tile-provider URL. */
export function substituteTileUrl(
  template: string,
  params: { s: string; z: string; x: string; y: string; r: string; key: string },
): string {
  return template
    .replace(/\{s\}/g, params.s)
    .replace(/\{z\}/g, params.z)
    .replace(/\{x\}/g, params.x)
    .replace(/\{y\}/g, params.y)
    .replace(/\{r\}/g, params.r)
    .replace(/\{KEY\}/g, encodeURIComponent(params.key));
}

/**
 * The preset list as the *client* should see it, computed per-request from `env`:
 * keyless presets pass through unchanged; a keyed preset is only included when its
 * secret is configured, and its `url` is rewritten to the same-origin proxy path so
 * the key itself never reaches the browser. A preset whose secret is unset is simply
 * absent — no error state, no disabled/"fixed" entry. Consumed by
 * mapLayersRuntimeScript(); also the projection that determines what
 * `_ftRenderAddLayerPresetOptions()` can offer.
 */
export function clientBasemapPresets(env: Env): BasemapPreset[] {
  return BASEMAP_PRESETS.flatMap((p) => {
    if (!p.secretEnvVar) return [p];
    if (!readEnvSecret(env, p.secretEnvVar)) return [];
    return [{ ...p, url: `/api/tiles/${p.id}/{z}/{x}/{y}{r}.png` }];
  });
}

/**
 * Runtime script for the page IIFE (called once per page, before any
 * `sharedTileLayerDefs`/`sharedMapControlsScripts` call) — defines the shared plumbing
 * for the per-device layer set:
 *   _ftPresets                 — the built-in preset list, projected for the client via
 *                                 clientBasemapPresets(env) (parsed once, shared by every map)
 *   _ftGetEnabledIds/_ftSaveEnabledIds     — which preset/custom ids are currently active
 *   _ftGetCustomLayers/_ftSaveCustomLayers — user-added custom layer definitions
 *   _ftActiveLayerDefs()        — ordered list of layer defs (presets, then customs) that
 *                                 should currently be on every map, per localStorage
 *   _ftMakeTileLayer(def)        — builds an L.tileLayer from a preset or custom def
 *   _ftMapRefreshers             — one callback per initialized map (pushed by
 *                                  sharedMapControlsScripts); _ftNotifyLayersChanged()
 *                                  runs all of them so Settings edits apply live, with no
 *                                  page reload needed.
 * `presets` overrides the list for pages without a Worker (see staticSiteBasemapPresets).
 */
export function mapLayersRuntimeScript(env: Env, presets: BasemapPreset[] = clientBasemapPresets(env)): string {
  return `
    var _ftPresets = ${JSON.stringify(presets)};
    var _ftMapRefreshers = [];

    function _ftGetEnabledIds() {
      try {
        var raw = localStorage.getItem('${MAP_LAYERS_ENABLED_KEY}');
        var ids = raw ? JSON.parse(raw) : null;
        return (Array.isArray(ids) && ids.length > 0) ? ids : ${JSON.stringify(DEFAULT_ENABLED_PRESETS)}.slice();
      } catch (_) { return ${JSON.stringify(DEFAULT_ENABLED_PRESETS)}.slice(); }
    }
    function _ftSaveEnabledIds(ids) { localStorage.setItem('${MAP_LAYERS_ENABLED_KEY}', JSON.stringify(ids)); }
    function _ftGetCustomLayers() {
      try {
        var raw = localStorage.getItem('${MAP_LAYERS_CUSTOM_KEY}');
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (_) { return []; }
    }
    function _ftSaveCustomLayers(arr) { localStorage.setItem('${MAP_LAYERS_CUSTOM_KEY}', JSON.stringify(arr)); }

    function _ftActiveLayerDefs() {
      var enabledIds = _ftGetEnabledIds();
      var defs = [];
      _ftPresets.forEach(function(p) { if (enabledIds.indexOf(p.id) !== -1) defs.push(p); });
      _ftGetCustomLayers().forEach(function(c) {
        if (c && c.id && c.url && enabledIds.indexOf(c.id) !== -1) defs.push(c);
      });
      return defs;
    }

    // Leaflet only substitutes lowercase {s}/{z}/{x}/{y}/{r} — a template pasted from a
    // tile provider's own docs in a different case (e.g. the OGC-style {Z}/{X}/{Y} some
    // tileservers document) would otherwise pass straight through to the tile request as
    // a literal, un-substituted "{Z}" and 404. Normalizing case here means any admin- or
    // user-entered template works regardless of the case it was copied in.
    function _ftNormalizeTileTemplate(url) {
      return url.replace(/\{[sxyzr]\}/gi, function(m) { return m.toLowerCase(); });
    }

    function _ftMakeTileLayer(def) {
      var opts = { attribution: def.attribution || '', _ftLabel: def.label || def.id };
      if (def.maxZoom) opts.maxZoom = def.maxZoom;
      if (def.detectRetina) opts.detectRetina = true;
      return L.tileLayer(_ftNormalizeTileTemplate(def.url), opts);
    }

    function _ftNotifyLayersChanged() { _ftMapRefreshers.forEach(function(fn) { fn(); }); }
  `;
}

/**
 * JS string defining the active tile layers (from `_ftActiveLayerDefs()`) and setting
 * the default on `mapVar` to the persisted basemap choice, falling back to the first
 * active layer if that choice is missing or no longer enabled. Requires
 * `mapLayersRuntimeScript()` to have already run once earlier on the page.
 * `tileLayersVar` and `currentLayerVar` name the JS variables to write.
 * When `declare` is false the variables are assigned without a declaration keyword —
 * useful when the variables are already declared at an outer scope.
 */
export function sharedTileLayerDefs(
  mapVar: string,
  tileLayersVar = 'tileLayers',
  currentLayerVar = 'currentTileLayer',
  declare = true,
): string {
  const tld = declare ? `const ${tileLayersVar}` : tileLayersVar;
  const cld = declare ? `let ${currentLayerVar}` : currentLayerVar;
  const initStyleVar = `_${currentLayerVar}InitStyle`;
  return `
    ${tld} = {};
    _ftActiveLayerDefs().forEach(function(def) { ${tileLayersVar}[def.id] = _ftMakeTileLayer(def); });
    if (Object.keys(${tileLayersVar}).length === 0) {
      // Safety net: never leave the map with zero layers even if localStorage holds
      // an empty/corrupt enabled-layers list.
      ${tileLayersVar}[_ftPresets[0].id] = _ftMakeTileLayer(_ftPresets[0]);
    }
    var _ftStoredBasemap = localStorage.getItem('${MAP_BASEMAP_KEY}');
    var ${initStyleVar} = (_ftStoredBasemap && ${tileLayersVar}[_ftStoredBasemap]) ? _ftStoredBasemap : Object.keys(${tileLayersVar})[0];
    ${cld} = ${tileLayersVar}[${initStyleVar}];
    ${currentLayerVar}.addTo(${mapVar});
    ${mapVar}.getContainer().setAttribute('data-basemap', ${initStyleVar});
    _ftApplyActiveLayerColor();
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
 * of layers is per-device configurable — this only emits the empty container for them.
 * Optionally appends an extra group of buttons (pass the inner button HTML, without wrapper divs).
 */
export function sharedMapControlsMarkup(extraButtons?: string, idPrefix = ''): string {
  const extra = extraButtons
    ? `\n          <div class="controls-divider"></div>\n          <div class="controls-group">\n            ${extraButtons}\n          </div>`
    : '';
  return `
      <div id="${idPrefix}map-controls" class="map-controls-wrap">
        <div id="${idPrefix}map-attribution" class="map-controls-attribution"></div>
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
      left: 50%;
      transform: translateX(-50%);
      z-index: 500;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
      pointer-events: none;
    }

    /* The page-level map runs to the screen's bottom edge: clear the home indicator. */
    #map-controls { bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px)); }

    #map-attribution, .map-controls-attribution {
      font-family: var(--font-body);
      font-size: 0.63rem;
      color: var(--text-muted);
      text-align: center;
      max-width: 320px;
      line-height: 1.4;
      pointer-events: auto;
    }

    #map-attribution a, .map-controls-attribution a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }

    #map-controls-bar, .map-controls-bar {
      display: flex;
      align-items: stretch;
      background: var(--surface-float);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-md);
      overflow: hidden;
      backdrop-filter: blur(14px) saturate(1.1);
      -webkit-backdrop-filter: blur(14px) saturate(1.1);
      pointer-events: auto;
      box-shadow: var(--shadow-md);
    }

    /* The basemap switcher's button count is per-device configurable (built-in presets
       plus any custom layers), so on narrow screens it can outgrow the original 3-button
       width this bar was designed for. Let it scroll horizontally rather than spilling
       off both edges of the centered, absolutely-positioned wrap. */
    @media (max-width: 640px) {
      #map-controls-bar, .map-controls-bar {
        max-width: calc(100vw - 1rem);
        overflow-x: auto;
        overflow-y: hidden;
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

    /* Per-layer saturation/contrast/brightness correction (adjustable per basemap in
       Settings > Map layers), applied to whichever layer is currently active via
       _ftApplyActiveLayerColor(). The var() fallbacks are 1 (no correction) — that's
       also the reset-to-default value — so this is a no-op for any layer that hasn't
       been customized. */
    .leaflet-container .leaflet-tile-pane {
      filter: saturate(var(--map-color-sat, 1)) contrast(var(--map-color-con, 1)) brightness(var(--map-color-bri, 1));
    }
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
  { id: 'sat', legacyKey: 'ft_map_color_sat', cssVar: '--map-color-sat', label: 'Saturation' },
  { id: 'con', legacyKey: 'ft_map_color_con', cssVar: '--map-color-con', label: 'Contrast' },
  { id: 'bri', legacyKey: 'ft_map_color_bri', cssVar: '--map-color-bri', label: 'Brightness' },
] as const;

/**
 * JS defining `_ftLayerColor(id)`, which reads a layer's stored correction (falling
 * back to the pre-per-layer `ft_map_color_*` keys for `id === 'map'`, since that's the
 * only layer the old global correction ever visually applied to). Shared between the
 * pre-paint init script and the runtime helpers so the read logic isn't duplicated.
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

/** Tiny blocking script for <head> — applies the active layer's saved correction before first paint. */
export function mapLayerColorInitScript(): string {
  return `(function() {
    ${layerColorReadLogic()}
    var id = localStorage.getItem('${MAP_BASEMAP_KEY}') || 'map';
    var c = _ftLayerColor(id);
    document.documentElement.style.setProperty('${MAP_COLOR_CHANNELS[0].cssVar}', (c.sat / 100).toFixed(3));
    document.documentElement.style.setProperty('${MAP_COLOR_CHANNELS[1].cssVar}', (c.con / 100).toFixed(3));
    document.documentElement.style.setProperty('${MAP_COLOR_CHANNELS[2].cssVar}', (c.bri / 100).toFixed(3));
  })();`;
}

/**
 * Runtime script for the page IIFE (called once per page, like themeRuntimeScript) —
 * defines the per-layer color-correction helpers used by sharedTileLayerDefs,
 * sharedMapControlsScripts, and the Settings > Map layers row builder:
 *   _ftLayerColor(id)             — read a layer's correction (see layerColorReadLogic)
 *   _ftSetLayerColor(id, ch, val) — persist + reapply if this layer is the active one
 *   _ftApplyActiveLayerColor()    — set the --map-color-* vars from whichever layer is
 *                                   currently active (read from any map's data-basemap
 *                                   attribute, since it's shared across all instances)
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
      var el = document.querySelector('.leaflet-container[data-basemap]');
      var id = el ? el.getAttribute('data-basemap') : (localStorage.getItem('${MAP_BASEMAP_KEY}') || 'map');
      var c = _ftLayerColor(id);
      document.documentElement.style.setProperty('${MAP_COLOR_CHANNELS[0].cssVar}', (c.sat / 100).toFixed(3));
      document.documentElement.style.setProperty('${MAP_COLOR_CHANNELS[1].cssVar}', (c.con / 100).toFixed(3));
      document.documentElement.style.setProperty('${MAP_COLOR_CHANNELS[2].cssVar}', (c.bri / 100).toFixed(3));
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
 * Settings modal markup for the "Map layers" section: one row per currently-active layer
 * (built-in preset or custom), each with "Colors" and "Delete" buttons, plus a form for
 * adding another layer — either picked from the built-in presets not already active, or
 * a fully custom tile URL. Populated/wired at runtime by mapLayersSettingsScript().
 */
export function mapLayersSettingsRowsMarkup(): string {
  return `
    <p class="settings-section-desc">Basemaps currently in the map style switcher. Adjust a layer's colors, remove one, or add another below — changes apply immediately, on every map.</p>
    <div id="settings-map-layers-list"></div>
    <details id="settings-add-map-layer" class="settings-add-tracker">
      <summary>Add layer</summary>
      <div class="settings-add-inner">
        <select id="settings-add-layer-preset"></select>
        <input type="text" id="settings-add-layer-label" placeholder="Label (e.g. My Sectional)" autocomplete="off" />
        <input type="text" id="settings-add-layer-url" placeholder="Tile URL, e.g. https://example.com/{z}/{x}/{y}.png" autocomplete="off" />
        <input type="text" id="settings-add-layer-attribution" placeholder="Attribution (optional)" autocomplete="off" />
        <input type="number" id="settings-add-layer-maxzoom" placeholder="Max zoom (optional)" min="1" max="22" step="1" autocomplete="off" />
        <p id="settings-add-layer-lookup-status" class="settings-msg" aria-live="polite"></p>
        <div class="settings-add-actions">
          <button id="settings-add-layer-submit" class="btn-primary">Add</button>
          <button id="settings-add-layer-lookup" class="btn-secondary" style="display:none">Look up details</button>
          <button id="settings-add-layer-cancel" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </details>
  `;
}

/**
 * Runtime script wiring the "Map layers" settings section: renderMapLayersSettings()
 * (called from openSettings()) builds one row per currently-active layer (preset or
 * custom), each with a "Colors" disclosure (expands _ftBuildColorSliders()) and a
 * Delete button. Also wires the add-layer form, whose preset <select> is repopulated
 * with whatever presets aren't already active and, on selection, fills in the
 * label/URL/attribution/max-zoom fields as an editable starting point. Every mutation
 * calls _ftNotifyLayersChanged() so every map on the page picks it up immediately.
 * Depends on mapLayersRuntimeScript() (storage helpers, _ftPresets) and
 * mapLayerColorRuntimeScript() (_ftBuildColorSliders) having already run — order doesn't
 * matter in practice, since all three are hoisted function declarations sharing one page
 * IIFE, but data reads here happen after both have executed.
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
        var resp = await fetch('/api/tile-metadata?url=' + encodeURIComponent(url));
        var data = await resp.json().catch(function() { return {}; });
        var meta = data.metadata;
        if (!resp.ok) {
          status.textContent = 'Lookup failed: ' + (data.error || ('HTTP ' + resp.status)) + '.';
        } else if (!meta) {
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
      } catch (_) {
        status.textContent = 'Couldn\\'t reach the server.';
      }
      btn.disabled = false;
    }

    function _ftBuildLayerRow(id, label, isCustom) {
      var row = document.createElement('div');
      row.className = 'settings-aircraft-row';

      var info = document.createElement('div');
      info.className = 'settings-aircraft-info';
      var nameEl = document.createElement('span');
      nameEl.className = 'settings-aircraft-name';
      nameEl.textContent = label;
      info.appendChild(nameEl);

      var actions = document.createElement('div');
      actions.className = 'settings-aircraft-actions';
      var colorsBtn = document.createElement('button');
      colorsBtn.className = 'settings-action-btn';
      colorsBtn.textContent = 'Colors';
      var panel = document.createElement('div');
      panel.className = 'settings-edit-form';
      panel.style.display = 'none';
      colorsBtn.addEventListener('click', function() {
        var isOpen = panel.style.display !== 'none';
        if (isOpen) {
          panel.style.display = 'none';
        } else {
          _ftBuildColorSliders(panel, id);
          panel.style.display = '';
        }
      });
      actions.appendChild(colorsBtn);

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'settings-danger-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', function() {
        var msg = isCustom ? 'Delete this map layer?' : 'Remove "' + label + '" from the map style switcher? You can add it back later.';
        if (!confirm(msg)) return;
        if (isCustom) _ftSaveCustomLayers(_ftGetCustomLayers().filter(function(c) { return c.id !== id; }));
        _ftSaveEnabledIds(_ftGetEnabledIds().filter(function(eid) { return eid !== id; }));
        _ftNotifyLayersChanged();
        renderMapLayersSettings();
      });
      actions.appendChild(deleteBtn);

      row.appendChild(info);
      row.appendChild(actions);
      var wrap = document.createElement('div');
      wrap.appendChild(row);
      wrap.appendChild(panel);
      return wrap;
    }

    function _ftRenderAddLayerPresetOptions() {
      var select = document.getElementById('settings-add-layer-preset');
      if (!select) return;
      var enabledIds = _ftGetEnabledIds();
      select.innerHTML = '';
      var customOpt = document.createElement('option');
      customOpt.value = '';
      customOpt.textContent = 'Custom layer…';
      select.appendChild(customOpt);
      _ftPresets.forEach(function(p) {
        if (enabledIds.indexOf(p.id) !== -1) return;
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        select.appendChild(opt);
      });
    }

    function renderMapLayersSettings() {
      var container = document.getElementById('settings-map-layers-list');
      if (!container) return;
      container.innerHTML = '';
      var enabledIds = _ftGetEnabledIds();
      _ftPresets.forEach(function(p) {
        if (enabledIds.indexOf(p.id) !== -1) container.appendChild(_ftBuildLayerRow(p.id, p.label, false));
      });
      _ftGetCustomLayers().forEach(function(c) {
        if (enabledIds.indexOf(c.id) !== -1) container.appendChild(_ftBuildLayerRow(c.id, c.label || c.id, true));
      });
      _ftRenderAddLayerPresetOptions();
    }

    var _ftAddLayerPreset = document.getElementById('settings-add-layer-preset');
    if (_ftAddLayerPreset) {
      _ftAddLayerPreset.addEventListener('change', function() {
        var preset = _ftPresets.find(function(p) { return p.id === _ftAddLayerPreset.value; });
        document.getElementById('settings-add-layer-label').value = preset ? preset.label : '';
        document.getElementById('settings-add-layer-url').value = preset ? preset.url : '';
        document.getElementById('settings-add-layer-attribution').value = preset ? (preset.attribution || '') : '';
        document.getElementById('settings-add-layer-maxzoom').value = preset ? String(preset.maxZoom) : '';
      });
    }

    var _ftAddLayerSubmit = document.getElementById('settings-add-layer-submit');
    if (_ftAddLayerSubmit) {
      _ftAddLayerSubmit.addEventListener('click', function() {
        var preset = _ftAddLayerPreset ? _ftPresets.find(function(p) { return p.id === _ftAddLayerPreset.value; }) : null;
        var label = document.getElementById('settings-add-layer-label').value.trim();
        var url = document.getElementById('settings-add-layer-url').value.trim();
        var attribution = document.getElementById('settings-add-layer-attribution').value.trim();
        var maxZoomRaw = document.getElementById('settings-add-layer-maxzoom').value.trim();
        if (!label || !url) return;

        var enabledIds = _ftGetEnabledIds();
        // If the fields still match the selected preset verbatim, just re-enable that
        // preset (keeps its detectRetina flag and any saved per-layer colors) instead of
        // cloning it into a new custom entry.
        var matchesPreset = !!preset && preset.label === label && preset.url === url &&
          (preset.attribution || '') === attribution && String(preset.maxZoom) === maxZoomRaw;

        if (matchesPreset) {
          if (enabledIds.indexOf(preset.id) === -1) enabledIds.push(preset.id);
          _ftSaveEnabledIds(enabledIds);
        } else {
          var id = 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          var entry = { id: id, label: label, url: url, attribution: attribution };
          if (maxZoomRaw) {
            var mz = parseInt(maxZoomRaw, 10);
            if (!isNaN(mz)) entry.maxZoom = mz;
          }
          var custom = _ftGetCustomLayers();
          custom.push(entry);
          _ftSaveCustomLayers(custom);
          enabledIds.push(id);
          _ftSaveEnabledIds(enabledIds);
        }

        document.getElementById('settings-add-layer-label').value = '';
        document.getElementById('settings-add-layer-url').value = '';
        document.getElementById('settings-add-layer-attribution').value = '';
        document.getElementById('settings-add-layer-maxzoom').value = '';
        document.getElementById('settings-add-layer-lookup-status').textContent = '';
        if (_ftAddLayerPreset) _ftAddLayerPreset.value = '';
        document.getElementById('settings-add-map-layer').open = false;
        _ftNotifyLayersChanged();
        renderMapLayersSettings();
      });
    }
    var _ftAddLayerLookup = document.getElementById('settings-add-layer-lookup');
    if (_ftAddLayerLookup) {
      _ftAddLayerLookup.addEventListener('click', function() {
        _ftLookupTileMetadata(_ftAddLayerLookup, document.getElementById('settings-add-layer-lookup-status'), {
          url: document.getElementById('settings-add-layer-url'),
          label: document.getElementById('settings-add-layer-label'),
          attribution: document.getElementById('settings-add-layer-attribution'),
          maxZoom: document.getElementById('settings-add-layer-maxzoom'),
        });
      });
    }
    var _ftAddLayerCancel = document.getElementById('settings-add-layer-cancel');
    if (_ftAddLayerCancel) {
      _ftAddLayerCancel.addEventListener('click', function() {
        document.getElementById('settings-add-map-layer').open = false;
      });
    }
  `;
}

/**
 * JS for wiring the zoom buttons and basemap switcher. The basemap buttons themselves
 * are created here (not in sharedMapControlsMarkup) from whatever layers
 * sharedTileLayerDefs actually built into `tileLayersVar`, since that set is per-device
 * configurable via Settings > Map layers.
 * Also registers this map's refresh callback with `_ftMapRefreshers` (defined by
 * mapLayersRuntimeScript()), so adding/removing a layer in Settings adds/removes it from
 * `tileLayersVar` and rebuilds the style buttons immediately — no reload needed.
 * `idPrefix` must match the value used in sharedMapControlsMarkup.
 * `tileLayersVar` / `currentLayerVar` name the JS variables holding tile layer state;
 * defaults match the dashboard globals `tileLayers` / `currentTileLayer`.
 * `rootExpr` is where the controls' elements are looked up: `document`, or a shadow
 * root (the showcase demos).
 * Wrapped in an IIFE so multiple instances on the same page don't conflict.
 */
export function sharedMapControlsScripts(
  mapVar: string,
  idPrefix = '',
  tileLayersVar = 'tileLayers',
  currentLayerVar = 'currentTileLayer',
  rootExpr = 'document',
): string {
  return `
    (function() {
      ${rootExpr}.getElementById('${idPrefix}zoom-in').addEventListener('click', function() { if (${mapVar}) ${mapVar}.zoomIn(); });
      ${rootExpr}.getElementById('${idPrefix}zoom-out').addEventListener('click', function() { if (${mapVar}) ${mapVar}.zoomOut(); });

      // Leaflet's own attribution control is off on every map (it would render in
      // Leaflet's styling, in a corner), so this line stands in for it: the active
      // basemap's credit first, then each tile overlay currently on the map, deduped.
      function _updateAttrib() {
        var el = ${rootExpr}.getElementById('${idPrefix}map-attribution');
        if (!el || !${mapVar}) return;
        var parts = [];
        function add(layer) {
          var a = layer && layer.getAttribution && layer.getAttribution();
          if (a && parts.indexOf(a) === -1) parts.push(a);
        }
        add(${currentLayerVar});
        ${mapVar}.eachLayer(function(l) { if (l instanceof L.TileLayer) add(l); });
        el.innerHTML = parts.join(' · ');
      }
      _updateAttrib();
      // Overlays are added/removed by the overlay legend, not here; tile-layer events
      // catch those (markers and tracks also fire layeradd, hence the filter).
      ${mapVar}.on('layeradd layerremove', function(e) { if (e.layer instanceof L.TileLayer) _updateAttrib(); });

      var _styleGroup = ${rootExpr}.getElementById('${idPrefix}map-style-group');

      function _ftSwitchStyle(style) {
        if (!${tileLayersVar} || !${tileLayersVar}[style] || !${mapVar}) return;
        if (${tileLayersVar}[style] !== ${currentLayerVar}) {
          if (${currentLayerVar} && ${mapVar}.hasLayer(${currentLayerVar})) ${mapVar}.removeLayer(${currentLayerVar});
          ${currentLayerVar} = ${tileLayersVar}[style];
          ${currentLayerVar}.addTo(${mapVar});
          ${currentLayerVar}.bringToBack();
        }
        ${mapVar}.getContainer().setAttribute('data-basemap', style);
        localStorage.setItem('${MAP_BASEMAP_KEY}', style);
        _ftApplyActiveLayerColor();
        _updateAttrib();
        _styleGroup.querySelectorAll('.map-style-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.style === style); b.setAttribute('aria-pressed', b.dataset.style === style ? 'true' : 'false'); });
        // Reset to the newly active basemap's default overlay states — a viewer's
        // manual overlay toggle applies to the basemap they made it on, not to
        // whichever one they switch to next (see _ftClearOverlayOverrides in
        // overlayLegendRuntimeScript) — only present on pages that include the
        // overlay legend, hence the guard.
        if (typeof _ftClearOverlayOverrides === 'function') _ftClearOverlayOverrides();
        if (typeof _ftRenderOverlayLegend === 'function') _ftRenderOverlayLegend();
      }

      function _ftRebuildStyleButtons() {
        var activeStyle = ${mapVar}.getContainer().getAttribute('data-basemap');
        _styleGroup.innerHTML = '';
        Object.keys(${tileLayersVar}).forEach(function(id) {
          var btn = document.createElement('button');
          btn.className = 'controls-btn map-style-btn';
          btn.dataset.style = id;
          btn.textContent = ${tileLayersVar}[id].options._ftLabel || id;
          if (id === activeStyle) btn.classList.add('active');
          btn.addEventListener('click', function() { _ftSwitchStyle(id); });
          _styleGroup.appendChild(btn);
        });
      }
      _ftRebuildStyleButtons();

      // Re-derives tileLayersVar from Settings' current enabled/custom layer state:
      // adds newly-enabled layers, tears down newly-disabled/deleted ones (switching the
      // map off of one if it was the active style), then rebuilds the style buttons.
      function _ftRefreshLayers() {
        var desired = _ftActiveLayerDefs();
        var desiredIds = desired.map(function(d) { return d.id; });
        Object.keys(${tileLayersVar}).forEach(function(id) {
          if (desiredIds.indexOf(id) !== -1) return;
          if (${mapVar}.hasLayer(${tileLayersVar}[id])) ${mapVar}.removeLayer(${tileLayersVar}[id]);
          delete ${tileLayersVar}[id];
        });
        desired.forEach(function(def) {
          if (!${tileLayersVar}[def.id]) ${tileLayersVar}[def.id] = _ftMakeTileLayer(def);
        });
        if (Object.keys(${tileLayersVar}).length === 0) {
          ${tileLayersVar}[_ftPresets[0].id] = _ftMakeTileLayer(_ftPresets[0]);
        }
        var curId = ${mapVar}.getContainer().getAttribute('data-basemap');
        if (!${tileLayersVar}[curId]) curId = Object.keys(${tileLayersVar})[0];
        _ftSwitchStyle(curId);
        _ftRebuildStyleButtons();
      }
      _ftMapRefreshers.push(_ftRefreshLayers);
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
 * one instance per Leaflet map, mounted via tileOverlayLegendMountScript(). See that
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
    // it (set by sharedTileLayerDefs()/_ftSwitchStyle() — shared across every map
    // instance on the page, same as _ftApplyActiveLayerColor() reads it).
    function _ftCurrentBasemapId() {
      var el = document.querySelector('.leaflet-container[data-basemap]');
      return el ? el.getAttribute('data-basemap') : null;
    }

    // An overlay's default on/off state can lean differently per basemap (e.g. on
    // by default over "topo", off over "satellite") via default_enabled_by_basemap;
    // default_enabled is the fallback for any basemap not named there, including a
    // viewer's own per-device custom basemap, which an admin can't know about ahead
    // of time.
    function _ftOverlayDefaultEnabled(ov) {
      var basemapId = _ftCurrentBasemapId();
      if (basemapId && ov.default_enabled_by_basemap && Object.prototype.hasOwnProperty.call(ov.default_enabled_by_basemap, basemapId)) {
        return !!ov.default_enabled_by_basemap[basemapId];
      }
      return !!ov.default_enabled;
    }

    function _ftOverlayEnabled(ov) {
      var overrides = _ftGetOverlayOverrides();
      var key = String(ov.id);
      return Object.prototype.hasOwnProperty.call(overrides, key) ? !!overrides[key] : _ftOverlayDefaultEnabled(ov);
    }
  `;
}

/**
 * Mounts the overlay legend for one Leaflet map instance — call once per map, right
 * after sharedMapControlsScripts() for that same instance (needs `overlayLegendRuntimeScript()`
 * to have already run once earlier on the page, and this instance's button/panel markup,
 * from tileOverlayLegendButtonMarkup()/tileOverlayLegendPanelMarkup() with the same
 * `idPrefix`, already in the DOM).
 *
 * `mapVar` is the JS variable holding this instance's L.Map. `idPrefix` must match the
 * value used for that instance's markup. Wrapped in an IIFE so each instance's live
 * overlay tile layers (`_ftOverlayLayers`) stay private — needed because more than one
 * map instance can be mounted on the same page at once (e.g. the dashboard's main map
 * plus the regions/points editors, reachable from the same Settings modal).
 *
 * Registers this instance's render function with `_ftOverlayLegendRefreshers` so a
 * single `_ftRenderOverlayLegend()` call (overlayLegendRuntimeScript()) refreshes it
 * along with every other mounted instance, and does one render immediately so the
 * legend/layers reflect whatever `overlayList` already holds at mount time.
 */
export function tileOverlayLegendMountScript(mapVar: string, idPrefix = ''): string {
  return `
    (function() {
      var _ftOverlayLayers = {}; // overlay id -> live L.tileLayer on ${mapVar}, present only while mounted

      function _ftSyncOverlayLayer(ov) {
        var want = _ftOverlayEnabled(ov);
        var have = !!_ftOverlayLayers[ov.id];
        if (want && !have) {
          var opts = { attribution: ov.attribution || '' };
          // maxNativeZoom, not maxZoom: maxZoom would also register as a map-wide zoom
          // limit (Leaflet clamps the whole map to the smallest maxZoom among its
          // layers), and would stop rendering this layer entirely past that zoom.
          // maxNativeZoom instead just caps which zoom level tiles are fetched at,
          // scaling up the last-loaded tile (pixelated) as the map keeps zooming past
          // the tileset's native coverage, so the overlay never drops out to reveal
          // the basemap underneath.
          if (ov.max_zoom) opts.maxNativeZoom = ov.max_zoom;
          var layer = L.tileLayer(_ftNormalizeTileTemplate(ov.url), opts);
          _ftOverlayLayers[ov.id] = layer;
          layer.addTo(${mapVar});
        } else if (!want && have) {
          ${mapVar}.removeLayer(_ftOverlayLayers[ov.id]);
          delete _ftOverlayLayers[ov.id];
        }
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
          return;
        }

        btn.style.display = '';
        list.innerHTML = '';
        overlayList.forEach(function(ov) {
          _ftSyncOverlayLayer(ov);

          var row = document.createElement('div');
          row.className = 'overlay-legend-row';
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.id = '${idPrefix}overlay-legend-cb-' + ov.id;
          cb.checked = _ftOverlayEnabled(ov);
          cb.addEventListener('change', function() {
            _ftSetOverlayOverride(ov.id, cb.checked);
            _ftSyncOverlayLayer(ov);
          });
          var label = document.createElement('label');
          label.setAttribute('for', cb.id);
          label.textContent = ov.label;
          row.appendChild(cb);
          row.appendChild(label);
          list.appendChild(row);
        });

        // Drop layers for any overlay that's no longer in overlayList (deleted in Settings).
        Object.keys(_ftOverlayLayers).forEach(function(id) {
          if (overlayList.some(function(ov) { return String(ov.id) === id; })) return;
          ${mapVar}.removeLayer(_ftOverlayLayers[id]);
          delete _ftOverlayLayers[id];
        });
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
