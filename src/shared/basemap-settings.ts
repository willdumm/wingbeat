/**
 * Settings' "Basemaps" section: the tenant's basemaps (the map's base layers, tenant data in
 * the `basemaps` table, docs/tenant-basemaps-plan.md), which admins add, edit, show or hide in
 * the map's picker, reorder and delete, like the overlays below it. Everyone can read the list
 * (the overlay forms' per-basemap defaults use it); the controls are admin-only. The page's
 * maps are redrawn from GET /api/bootstrap after every change, so an edit applies at once.
 * Depends on mapLayersRuntimeScript() (`_ftPresets`, `_ftVectorBasemaps`, `_ftNotifyLayersChanged`,
 * `_ftLookupTileMetadata`) and the page globals `fetchBasemaps`/`createBasemap`/`updateBasemap`/
 * `reorderBasemaps`/`deleteBasemap`/`fetchBootstrap`.
 */

export function basemapSettingsMarkup(): string {
  return `
    <p class="settings-section-desc">The base layers in the map's style switcher, the same for everyone. Hidden basemaps stay configured. A vector basemap is a Protomaps basemap PMTiles archive, with Protomaps' basemaps-assets (fonts and sprites) copied to <code>basemaps-assets/</code> beside it. On the web, the settings maps don't draw vector basemaps yet.</p>
    <div id="settings-basemap-list"></div>
    <details id="settings-add-basemap" class="settings-add-tracker">
      <summary>Add basemap</summary>
      <div class="settings-add-inner">
        <input type="text" id="settings-add-basemap-label" placeholder="Label (e.g. Imagery)" autocomplete="off" />
        <select id="settings-add-basemap-kind" aria-label="Basemap type">
          <option value="raster">Raster tiles</option>
          <option value="vector">Vector (PMTiles)</option>
        </select>
        <input type="text" id="settings-add-basemap-url" placeholder="Tile URL, e.g. https://example.com/{z}/{x}/{y}.png" autocomplete="off" />
        <input type="text" id="settings-add-basemap-attribution" placeholder="Attribution (optional)" autocomplete="off" />
        <input type="number" id="settings-add-basemap-maxzoom" placeholder="Max native zoom (optional)" min="1" max="22" step="1" autocomplete="off" />
        <p id="settings-add-basemap-lookup-status" class="settings-msg" aria-live="polite"></p>
        <div class="settings-add-actions">
          <button id="settings-add-basemap-submit" class="btn-primary">Add</button>
          <button id="settings-add-basemap-lookup" class="btn-secondary">Look up details</button>
          <button id="settings-add-basemap-cancel" class="btn-secondary">Cancel</button>
        </div>
      </div>
    </details>
  `;
}

export function basemapSettingsScript(): string {
  return `
    // ── Basemaps (tenant-wide base layers) ──────────────────────────────────

    let basemapList = [];   // every basemap row from /api/basemaps, hidden ones too

    // Redraws every map from the server's current lists of shown basemaps: raster ones on
    // every map, vector ones on the MapLibre maps.
    async function _syncClientBasemaps() {
      try {
        const d = await fetchBootstrap();
        if (Array.isArray(d.basemaps) && d.basemaps.length > 0) _ftPresets = d.basemaps;
        _ftVectorBasemaps = d.vector_basemaps ?? [];
      } catch (_) {}
      _ftNotifyLayersChanged();
      renderMapLayersSettings();
    }

    async function loadSettingsBasemaps() {
      try {
        basemapList = (await fetchBasemaps()).basemaps;
      } catch (_) {}
      renderSettingsBasemapsList();
      _refreshOverlayBasemapDefaults();
    }

    function _basemapKindNote(b) {
      return b.kind === 'vector' ? 'Vector' : 'Raster';
    }

    function _buildBasemapRow(b, i) {
      const row = document.createElement('div');
      row.className = 'settings-aircraft-row';

      const info = document.createElement('div');
      info.className = 'settings-aircraft-info';
      const nameEl = document.createElement('span');
      nameEl.className = 'settings-aircraft-name';
      nameEl.textContent = b.label;
      info.appendChild(nameEl);
      const sub = document.createElement('span');
      sub.className = 'settings-aircraft-sub';
      sub.textContent = _basemapKindNote(b) + (b.shown ? '' : ' · Hidden');
      info.appendChild(sub);

      const actions = document.createElement('div');
      actions.className = 'settings-aircraft-actions';
      if (_settingsUser?.role === 'admin') {
        const mk = (text, onClick, disabled) => {
          const btn = document.createElement('button');
          btn.className = 'settings-action-btn';
          btn.textContent = text;
          btn.disabled = !!disabled;
          btn.addEventListener('click', onClick);
          actions.appendChild(btn);
        };
        mk('Up', () => settingsMoveBasemap(i, -1), i === 0);
        mk('Down', () => settingsMoveBasemap(i, 1), i === basemapList.length - 1);
        mk(b.shown ? 'Hide' : 'Show', () => settingsSetBasemapShown(b, !b.shown));
        mk('Edit', () => settingsToggleBasemapEditForm(row, b));
        mk('Delete', () => settingsDeleteBasemap(b));
      }
      row.appendChild(info);
      row.appendChild(actions);
      return row;
    }

    function renderSettingsBasemapsList() {
      const container = document.getElementById('settings-basemap-list');
      if (!container) return;
      container.innerHTML = '';
      if (basemapList.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'settings-msg';
        msg.textContent = 'No basemaps configured.';
        container.appendChild(msg);
        return;
      }
      basemapList.forEach((b, i) => container.appendChild(_buildBasemapRow(b, i)));
    }

    async function _basemapWrite(fn, failMessage) {
      try {
        await fn();
        await loadSettingsBasemaps();
        await _syncClientBasemaps();
        return true;
      } catch (err) {
        alert(apiErrorMessage(err, failMessage));
        // A 409 means the list here is stale (another admin changed it): show theirs.
        loadSettingsBasemaps();
        return false;
      }
    }

    function settingsMoveBasemap(i, delta) {
      const ids = basemapList.map(b => b.id);
      const j = i + delta;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return _basemapWrite(() => reorderBasemaps({ ids }), 'Failed to reorder basemaps.');
    }

    function settingsSetBasemapShown(b, shown) {
      return _basemapWrite(() => updateBasemap(b.id, { shown }), 'Failed to save basemap.');
    }

    function settingsDeleteBasemap(b) {
      if (!confirm('Delete "' + b.label + '"? This removes it from every viewer\\'s map.')) return;
      return _basemapWrite(() => deleteBasemap(b.id), 'Failed to delete basemap.');
    }

    function settingsToggleBasemapEditForm(row, b) {
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
      labelInput.value = b.label;
      form.appendChild(_lbl('Label', labelInput));

      // A basemap the server proxies under its own key keeps its url and type.
      const proxied = !!b.tile_proxy;
      const urlInput = document.createElement('input');
      urlInput.type = 'text';
      urlInput.value = b.url;
      if (!proxied) form.appendChild(_lbl(b.kind === 'vector' ? 'PMTiles URL' : 'Tile URL', urlInput));

      const attrInput = document.createElement('input');
      attrInput.type = 'text';
      attrInput.value = b.attribution || '';
      form.appendChild(_lbl('Attribution', attrInput));

      const maxZoomInput = document.createElement('input');
      maxZoomInput.type = 'number';
      maxZoomInput.min = '1';
      maxZoomInput.max = '22';
      maxZoomInput.step = '1';
      maxZoomInput.value = b.max_zoom != null ? String(b.max_zoom) : '';
      form.appendChild(_lbl('Max native zoom', maxZoomInput));

      const lookupStatus = document.createElement('p');
      lookupStatus.className = 'settings-msg';
      lookupStatus.setAttribute('aria-live', 'polite');
      form.appendChild(lookupStatus);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'settings-edit-form-actions';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'settings-action-btn';
      saveBtn.textContent = 'Save';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'settings-action-btn';
      cancelBtn.textContent = 'Cancel';
      actionsDiv.appendChild(saveBtn);
      if (!proxied && b.kind === 'raster') {
        const lookupBtn = document.createElement('button');
        lookupBtn.className = 'settings-action-btn';
        lookupBtn.textContent = 'Look up details';
        lookupBtn.addEventListener('click', () => {
          _ftLookupTileMetadata(lookupBtn, lookupStatus, {
            url: urlInput, label: labelInput, attribution: attrInput, maxZoom: maxZoomInput,
          });
        });
        actionsDiv.appendChild(lookupBtn);
      }
      actionsDiv.appendChild(cancelBtn);
      form.appendChild(actionsDiv);

      saveBtn.addEventListener('click', async () => {
        const label = labelInput.value.trim();
        const url = urlInput.value.trim();
        if (!label || !url) return;
        const body = {
          label,
          attribution: attrInput.value.trim() || null,
          max_zoom: maxZoomInput.value.trim() ? parseInt(maxZoomInput.value, 10) : null,
        };
        if (!proxied) body.url = url;
        await _basemapWrite(() => updateBasemap(b.id, body), 'Failed to save basemap.');
      });
      cancelBtn.addEventListener('click', () => {
        form.remove();
        row.querySelector('.settings-aircraft-actions').style.display = '';
        row.classList.remove('editing');
      });
      row.appendChild(form);
    }

    const _addBasemapKind = document.getElementById('settings-add-basemap-kind');
    if (_addBasemapKind) {
      _addBasemapKind.addEventListener('change', () => {
        const vector = _addBasemapKind.value === 'vector';
        document.getElementById('settings-add-basemap-url').placeholder = vector
          ? 'PMTiles URL, e.g. https://example.com/alaska.pmtiles'
          : 'Tile URL, e.g. https://example.com/{z}/{x}/{y}.png';
        document.getElementById('settings-add-basemap-lookup').style.display = vector ? 'none' : '';
      });
    }

    const _addBasemapSubmit = document.getElementById('settings-add-basemap-submit');
    if (_addBasemapSubmit) {
      _addBasemapSubmit.addEventListener('click', async () => {
        const label = document.getElementById('settings-add-basemap-label').value.trim();
        const url = document.getElementById('settings-add-basemap-url').value.trim();
        const attribution = document.getElementById('settings-add-basemap-attribution').value.trim();
        const maxZoomRaw = document.getElementById('settings-add-basemap-maxzoom').value.trim();
        if (!label || !url) return;
        const body = {
          label, url, kind: _addBasemapKind.value,
          attribution: attribution || null,
          max_zoom: maxZoomRaw ? parseInt(maxZoomRaw, 10) : null,
        };
        const ok = await _basemapWrite(() => createBasemap(body), 'Failed to add basemap.');
        if (!ok) return;
        for (const f of ['label', 'url', 'attribution', 'maxzoom']) document.getElementById('settings-add-basemap-' + f).value = '';
        document.getElementById('settings-add-basemap-lookup-status').textContent = '';
        document.getElementById('settings-add-basemap').open = false;
      });
    }
    const _addBasemapLookup = document.getElementById('settings-add-basemap-lookup');
    if (_addBasemapLookup) {
      _addBasemapLookup.addEventListener('click', () => {
        _ftLookupTileMetadata(_addBasemapLookup, document.getElementById('settings-add-basemap-lookup-status'), {
          url: document.getElementById('settings-add-basemap-url'),
          label: document.getElementById('settings-add-basemap-label'),
          attribution: document.getElementById('settings-add-basemap-attribution'),
          maxZoom: document.getElementById('settings-add-basemap-maxzoom'),
        });
      });
    }
    const _addBasemapCancel = document.getElementById('settings-add-basemap-cancel');
    if (_addBasemapCancel) {
      _addBasemapCancel.addEventListener('click', () => {
        document.getElementById('settings-add-basemap').open = false;
      });
    }
  `;
}
