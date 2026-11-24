import {
  maplibreMapControlsScripts,
  maplibreOverlayLegendMountScript,
  sharedMapControlsMarkup,
  tileOverlayLegendButtonMarkup,
  tileOverlayLegendPanelMarkup,
} from './map-controls';

export function regionsEditorMarkup(): string {
  return `
        <div class="settings-view settings-view-detail" id="settings-view-regions-editor" data-fullscreen-editor>
          <div class="map-editor-body">
            <div class="map-editor-map-wrap">
              <div id="rg-editor-map"></div>
              <div class="map-tool-overlay">
                <button class="map-tool-btn active" id="rg-mode-select" title="Select &amp; edit regions">&#9998;</button>
                <button class="map-tool-btn" id="rg-mode-add-region" title="Add new region">&#43;</button>
              </div>
              <div class="map-editor-status-overlay">
                <span id="rg-editor-dirty" class="map-editor-dirty" style="display:none">&#9679; Unsaved</span>
                <span id="rg-editor-status" class="settings-msg"></span>
              </div>
              ${tileOverlayLegendPanelMarkup('rg-')}
              ${sharedMapControlsMarkup(tileOverlayLegendButtonMarkup('rg-'), 'rg-')}
            </div>
            <div class="map-editor-panel" id="rg-panel">
              <div class="settings-form-row">
                <div class="settings-form-label">Name</div>
                <input type="text" id="rg-panel-name" autocomplete="off" />
              </div>
              <p id="rg-panel-shared-hint" class="settings-msg" style="display:none">
                Orange vertices are shared with adjacent regions and will move together.
              </p>
              <div class="settings-add-actions">
                <button id="rg-panel-save" class="btn-primary">Save</button>
                <button id="rg-panel-delete" class="btn-danger">Delete region</button>
                <button id="rg-panel-cancel" class="btn-secondary">Close</button>
              </div>
              <p id="rg-panel-status" class="settings-msg" style="display:none"></p>
            </div>
          </div>
        </div>`;
}

export function regionsEditorScript(): string {
  return `
    // ── Regions map editor ────────────────────────────────────────────────────

    let _rgMap = null;
    let _rgPolygons = null;             // the regions (addMapShape)
    let _rgHints = null;                // the vertex highlights and the new ring's edges (addMapShape)
    let _rgMode = 'select';

    // Topology state
    let _rgPoints = new Map();      // pointId → { id, lat, lon }
    let _rgRegions = [];            // { dbId, name, ring, lid, multiPoly? }[]
    let _rgPointUsers = new Map();  // pointId → Set<regionLid>

    // The selected region's draggable markers.
    let _rgVertexHandles = new Map();   // pointId → maplibregl.Marker
    let _rgMidMarkers = [];             // maplibregl.Marker[], one per edge of the ring

    let _rgSelectedIdx = null;
    let _rgDirtyLids = new Set();       // Set<regionLid>

    let _rgNewRing = [];
    let _rgPtCounter = 0;
    let _rgRidCounter = 0;

    // Snap/hover state
    let _rgSnapHoverPid = null;
    let _rgMergeTargetPid = null;
    let _rgFlashPid = null;

    // Context menu element (created once, reused)
    let _rgCtxMenu = null;

    // ── Context menu ──────────────────────────────────────────────────────────

    function _rgEnsureCtxMenu() {
      if (!_rgCtxMenu) {
        _rgCtxMenu = document.createElement('div');
        _rgCtxMenu.className = 'map-editor-ctx-menu';
        document.body.appendChild(_rgCtxMenu);
        document.addEventListener('click', () => _rgCtxMenu.classList.remove('visible'), true);
      }
      return _rgCtxMenu;
    }

    function _rgShowCtxMenu(x, y, pid) {
      const menu = _rgEnsureCtxMenu();
      menu.innerHTML = '';
      const shared = (_rgPointUsers.get(pid)?.size ?? 0) > 1;

      function addItem(label, handler) {
        const item = document.createElement('div');
        item.className = 'map-editor-ctx-menu-item danger';
        item.textContent = label;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          menu.classList.remove('visible');
          handler();
        });
        menu.appendChild(item);
      }

      if (shared) {
        addItem('Remove from this region', () => _rgDeleteVertex(pid));
        addItem('Delete from all regions', () => _rgDeleteVertexFromAll(pid));
      } else {
        addItem('Delete vertex', () => _rgDeleteVertex(pid));
      }

      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.classList.add('visible');
    }

    function _rgDeleteVertex(pid) {
      if (_rgSelectedIdx === null) return;
      const region = _rgRegions[_rgSelectedIdx];
      if (region.ring.length <= 3) {
        _setEditorStatus('rg-editor-status', 'Need at least 3 vertices.', true);
        setTimeout(() => { _setEditorStatus('rg-editor-status', '', false); _rgUpdateDirtyIndicator(); }, 2500);
        return;
      }
      const idx = region.ring.indexOf(pid);
      if (idx === -1) return;
      region.ring.splice(idx, 1);
      const users = _rgPointUsers.get(pid);
      users.delete(region.lid);
      if (users.size === 0) { _rgPoints.delete(pid); _rgPointUsers.delete(pid); }
      _rgDirtyLids.add(region.lid);
      _rgRenderPolygons();
      _rgRenderVertices(_rgSelectedIdx);
      _rgRenderMidpoints(_rgSelectedIdx);
      _rgUpdateDirtyIndicator();
    }

    function _rgDeleteVertexFromAll(pid) {
      const users = _rgPointUsers.get(pid);
      if (!users) return;
      let skipped = 0;
      for (const lid of [...users]) {
        const region = _rgRegions.find(r => r.lid === lid);
        if (!region || region.multiPoly) continue;
        if (region.ring.length <= 3) { skipped++; continue; }
        const idx = region.ring.indexOf(pid);
        if (idx === -1) continue;
        region.ring.splice(idx, 1);
        users.delete(lid);
        _rgDirtyLids.add(lid);
      }
      _rgRenderPolygons();
      if (users.size === 0) { _rgPoints.delete(pid); _rgPointUsers.delete(pid); }
      if (_rgSelectedIdx !== null) {
        _rgRenderVertices(_rgSelectedIdx);
        _rgRenderMidpoints(_rgSelectedIdx);
      }
      if (skipped > 0) {
        _setEditorStatus('rg-editor-status', skipped + ' region(s) skipped — need at least 3 vertices.', true);
        setTimeout(() => { _setEditorStatus('rg-editor-status', '', false); _rgUpdateDirtyIndicator(); }, 3000);
      }
      _rgUpdateDirtyIndicator();
    }

    // ── Dirty indicator ───────────────────────────────────────────────────────

    function _rgUpdateDirtyIndicator() {
      const el = document.getElementById('rg-editor-dirty');
      if (el) el.style.display = _rgDirtyLids.size > 0 ? '' : 'none';
    }

    // ── Point merge helpers ───────────────────────────────────────────────────

    function _rgDedupeRing(ring) {
      const result = [];
      for (let i = 0; i < ring.length; i++) {
        if (result.length === 0 || ring[i] !== result[result.length - 1]) result.push(ring[i]);
      }
      if (result.length > 1 && result[result.length - 1] === result[0]) result.pop();
      return result;
    }

    // The vertex nearest a map position within px on screen (other than exceptPid), or null.
    function _rgNearestPoint(lngLat, px, exceptPid) {
      let best = null;
      let bestDist = px;
      const at = _rgMap.project(lngLat);
      for (const [pid, pt] of _rgPoints.entries()) {
        if (pid === exceptPid) continue;
        const p = _rgMap.project([pt.lon, pt.lat]);
        const d = Math.hypot(at.x - p.x, at.y - p.y);
        if (d < bestDist) { best = pid; bestDist = d; }
      }
      return best;
    }

    function _rgFindMergeTarget(draggedPid, lngLat) { return _rgNearestPoint(lngLat, 14, draggedPid); }

    function _rgUpdateMergeHover(draggedPid, lngLat) {
      const target = _rgFindMergeTarget(draggedPid, lngLat);
      if (target === _rgMergeTargetPid) return;
      _rgMergeTargetPid = target;
      _rgDrawHints();
    }

    function _rgMergePoints(draggedPid, targetPid) {
      for (const region of _rgRegions) {
        if (!region.ring || !region.ring.includes(draggedPid)) continue;
        const testRing = region.ring.map(p => p === draggedPid ? targetPid : p);
        const deduped = _rgDedupeRing(testRing);
        if (deduped.length < 3) continue; // skip: merge would destroy this ring
        region.ring = deduped;
        if (!_rgPointUsers.has(targetPid)) _rgPointUsers.set(targetPid, new Set());
        _rgPointUsers.get(targetPid).add(region.lid);
        _rgDirtyLids.add(region.lid);
      }
      _rgPoints.delete(draggedPid);
      _rgPointUsers.delete(draggedPid);
      _rgRenderPolygons();
      if (_rgSelectedIdx !== null) { _rgRenderVertices(_rgSelectedIdx); _rgRenderMidpoints(_rgSelectedIdx); }
      _rgUpdateDirtyIndicator();
    }

    function _rgOnVertexDragEnd(pid, lngLat) {
      const target = _rgFindMergeTarget(pid, lngLat);
      _rgMergeTargetPid = null;
      _rgDrawHints();
      if (target) _rgMergePoints(pid, target);
    }

    // ── Highlights ────────────────────────────────────────────────────────────

    // Redraws what's drawn over the regions: in add mode every vertex (a snap target), the
    // new ring's edges so far and the vertex a click would snap to; the one just snapped
    // to; and the one a dragged vertex would merge into.
    function _rgDrawHints() {
      if (!_rgHints) return;
      const features = [];
      const green = MAP_EDITOR_ADDING;
      function dot(pid, color, radius, opacity, width) {
        const pt = _rgPoints.get(pid);
        if (pt) features.push(_ftPointFeature([pt.lat, pt.lon], { color, radius, opacity, width }));
      }
      if (_rgMode === 'add-region') {
        for (const pid of _rgPoints.keys()) dot(pid, green, 7, 0.25, 2);
        if (_rgNewRing.length > 1) {
          features.push(_ftLineFeature(_rgNewRing.map(pid => {
            const { lat, lon } = _rgPoints.get(pid);
            return [lat, lon];
          }), { color: green }));
        }
        dot(_rgSnapHoverPid, green, 11, 0.4, 2.5);
      }
      dot(_rgFlashPid, green, 13, 0.55, 3);
      dot(_rgMergeTargetPid, MAP_EDITOR_SELECTED, 11, 0.4, 2.5);
      _rgHints.setFeatures(features);
    }

    function _rgOnMouseMoveAddMode(e) {
      const pid = _rgFindSnapPoint(e.lngLat);
      if (pid === _rgSnapHoverPid) return;
      _rgSnapHoverPid = pid;
      _rgDrawHints();
    }

    function _rgFlashVertex(pid) {
      _rgFlashPid = pid;
      setTimeout(() => {
        if (_rgFlashPid !== pid) return;
        _rgFlashPid = null;
        _rgDrawHints();
      }, 500);
    }

    // ── Topology ──────────────────────────────────────────────────────────────

    function _rgBuildTopology(features) {
      _rgPoints.clear();
      _rgRegions = [];
      _rgPointUsers.clear();
      _rgPtCounter = 0;
      _rgRidCounter = 0;

      const coordKey = (lon, lat) => lon.toFixed(7) + ',' + lat.toFixed(7);
      const keyToId = new Map();

      for (const f of features) {
        const lid = 'r' + (_rgRidCounter++);
        if (f.geometry.type !== 'Polygon') {
          _rgRegions.push({ dbId: f.properties.id ?? null, name: f.properties.Name, ring: null, multiPoly: true, lid });
          continue;
        }
        const coords = f.geometry.coordinates[0];
        const ring = [];
        for (const [lon, lat] of coords.slice(0, -1)) {
          const k = coordKey(lon, lat);
          if (!keyToId.has(k)) {
            const id = 'p' + (_rgPtCounter++);
            keyToId.set(k, id);
            _rgPoints.set(id, { id, lat, lon });
          }
          const pid = keyToId.get(k);
          ring.push(pid);
          if (!_rgPointUsers.has(pid)) _rgPointUsers.set(pid, new Set());
          _rgPointUsers.get(pid).add(lid);
        }
        _rgRegions.push({ dbId: f.properties.id ?? null, name: f.properties.Name, ring, lid });
      }
    }

    function _rgRegionToGeojson(ri) {
      const ring = _rgRegions[ri].ring.map(pid => {
        const { lon, lat } = _rgPoints.get(pid);
        return [lon, lat];
      });
      ring.push(ring[0]);
      return { type: 'Polygon', coordinates: [ring] };
    }

    async function _rgSaveDirty() {
      const saves = [..._rgDirtyLids].map(async lid => {
        const region = _rgRegions.find(r => r.lid === lid);
        if (!region || region.multiPoly) return;
        const ri = _rgRegions.indexOf(region);
        const geojson = _rgRegionToGeojson(ri);
        try {
          if (region.dbId === null) region.dbId = (await createRegion({ name: region.name, geojson })).id;
          else await updateRegion(region.dbId, { name: region.name, geojson });
        } catch (err) {
          throw new Error(apiErrorMessage(err, 'Save failed'));
        }
      });
      await Promise.all(saves);
      _rgDirtyLids.clear();
      _rgUpdateDirtyIndicator();
    }

    // ── Render ────────────────────────────────────────────────────────────────

    function _rgRenderPolygons() {
      if (!_rgPolygons) return;
      const features = [];
      _rgRegions.forEach((region, ri) => {
        if (region.multiPoly) return;
        const selected = _rgSelectedIdx === ri;
        features.push({
          type: 'Feature',
          properties: { lid: region.lid, color: selected ? MAP_EDITOR_SELECTED : getAccentColor(), width: selected ? 2.5 : 1.5 },
          geometry: _rgRegionToGeojson(ri),
        });
      });
      features.sort((a, b) => a.properties.width - b.properties.width); // the selected one on top
      _rgPolygons.setFeatures(features);
    }

    // The index of the region at a screen point, or -1.
    function _rgRegionAt(point) {
      const hit = _ftFeatureAt(_rgMap, _rgPolygons.id + '-region-fill', point);
      return hit ? _rgRegions.findIndex(r => r.lid === hit.properties.lid) : -1;
    }

    function _rgClearVertexMarkers() {
      for (const h of _rgVertexHandles.values()) h.remove();
      _rgVertexHandles.clear();
    }

    function _rgClearMidMarkers() {
      for (const m of _rgMidMarkers) m.remove();
      _rgMidMarkers = [];
    }

    // A draggable marker; its class is set through classList (MapLibre's own classes are on
    // the same element).
    function _rgAddHandle(lat, lon, className) {
      const el = document.createElement('div');
      el.className = 'rg-handle ' + className;
      return new maplibregl.Marker({ element: el, draggable: true }).setLngLat([lon, lat]).addTo(_rgMap);
    }

    function _rgRenderVertices(ri) {
      _rgClearVertexMarkers();
      for (const pid of new Set(_rgRegions[ri].ring)) {
        const { lat, lon } = _rgPoints.get(pid);
        _rgWireVertex(pid, _rgAddHandle(lat, lon, _rgPointUsers.get(pid).size > 1 ? 'rg-shared' : 'rg-own'));
      }
    }

    // Makes a handle the vertex pid's: drag to move, right-click or long-press for its menu.
    function _rgWireVertex(pid, handle) {
      const el = handle.getElement();
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        _rgShowCtxMenu(e.clientX, e.clientY, pid);
      });

      let _longPressTimer = null;
      let _longPressed = false;
      function cancelLongPress() {
        if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
      }
      el.addEventListener('touchstart', e => {
        const { clientX, clientY } = e.touches[0];
        cancelLongPress();
        _longPressed = false;
        _longPressTimer = setTimeout(() => {
          _longPressTimer = null;
          _longPressed = true;
          _rgShowCtxMenu(clientX, clientY, pid);
        }, 500);
      }, { passive: true });
      el.addEventListener('touchend', e => {
        cancelLongPress();
        // No click after a long press: it would close the menu.
        if (_longPressed) e.preventDefault();
      });
      el.addEventListener('touchcancel', cancelLongPress);

      handle.on('drag', () => {
        cancelLongPress();
        const lngLat = handle.getLngLat();
        _rgOnVertexDrag(pid, lngLat);
        _rgUpdateMergeHover(pid, lngLat);
      });
      handle.on('dragend', () => _rgOnVertexDragEnd(pid, handle.getLngLat()));
      _rgVertexHandles.set(pid, handle);
    }

    function _rgMidpoint(ring, i) {
      const p0 = _rgPoints.get(ring[i]);
      const p1 = _rgPoints.get(ring[(i + 1) % ring.length]);
      return { lat: (p0.lat + p1.lat) / 2, lon: (p0.lon + p1.lon) / 2 };
    }

    function _rgRenderMidpoints(ri) {
      _rgClearMidMarkers();
      const ring = _rgRegions[ri].ring;
      for (let i = 0; i < ring.length; i++) {
        const mid = _rgMidpoint(ring, i);
        const m = _rgAddHandle(mid.lat, mid.lon, 'rg-mid');
        // Dragging (or clicking) a midpoint inserts a vertex there, and the midpoint's own
        // marker becomes the vertex's, so a drag carries on with it.
        let inserted = false;
        function insert() {
          if (inserted) return;
          inserted = true;
          _rgMidMarkers.splice(_rgMidMarkers.indexOf(m), 1);
          const { pid, shared } = _rgInsertVertex(ri, i, mid.lat, mid.lon);
          m.getElement().classList.remove('rg-mid');
          m.getElement().classList.add(shared ? 'rg-shared' : 'rg-own');
          _rgWireVertex(pid, m);
          _rgRenderMidpoints(ri);
        }
        m.on('dragstart', insert);
        m.getElement().addEventListener('click', insert);
        _rgMidMarkers.push(m);
      }
    }

    function _rgOnVertexDrag(pid, lngLat) {
      const pt = _rgPoints.get(pid);
      pt.lat = lngLat.lat;
      pt.lon = lngLat.lng;
      for (const lid of _rgPointUsers.get(pid)) _rgDirtyLids.add(lid);
      _rgRenderPolygons();
      if (_rgSelectedIdx !== null) {
        const ring = _rgRegions[_rgSelectedIdx].ring;
        _rgMidMarkers.forEach((m, i) => {
          if (ring[i] !== pid && ring[(i + 1) % ring.length] !== pid) return;
          const mid = _rgMidpoint(ring, i);
          m.setLngLat([mid.lon, mid.lat]);
        });
      }
      _rgUpdateDirtyIndicator();
    }

    // Inserts a vertex on an edge of a region, and of any region sharing the edge.
    function _rgInsertVertex(ri, edgeIdx, lat, lon) {
      const newId = 'p' + (_rgPtCounter++);
      _rgPoints.set(newId, { id: newId, lat, lon });
      const newLid = _rgRegions[ri].lid;
      _rgPointUsers.set(newId, new Set([newLid]));

      const ring = _rgRegions[ri].ring;
      const pid0 = ring[edgeIdx];
      const pid1 = ring[(edgeIdx + 1) % ring.length];

      // Insert into the selected region's ring
      ring.splice(edgeIdx + 1, 0, newId);

      const users0 = _rgPointUsers.get(pid0);
      const users1 = _rgPointUsers.get(pid1);
      for (const lid of users0) {
        if (lid === newLid) continue;
        if (!users1.has(lid)) continue;
        const rj = _rgRegions.findIndex(r => r.lid === lid);
        if (rj === -1 || _rgRegions[rj].multiPoly) continue;
        const otherRing = _rgRegions[rj].ring;
        for (let k = 0; k < otherRing.length; k++) {
          const a = otherRing[k];
          const b = otherRing[(k + 1) % otherRing.length];
          if ((a === pid0 && b === pid1) || (a === pid1 && b === pid0)) {
            otherRing.splice(k + 1, 0, newId);
            _rgPointUsers.get(newId).add(lid);
            _rgDirtyLids.add(lid);
            break;
          }
        }
      }

      _rgRenderPolygons();
      _rgDirtyLids.add(newLid);
      _rgUpdateDirtyIndicator();
      return { pid: newId, shared: _rgPointUsers.get(newId).size > 1 };
    }

    function _rgFindSnapPoint(lngLat) { return _rgNearestPoint(lngLat, 10); }

    function _rgCancelNewRing() {
      // Remove any temporary points created only for the new ring (no region users yet)
      for (const pid of _rgNewRing) {
        const users = _rgPointUsers.get(pid);
        if (users && users.size === 0) { _rgPoints.delete(pid); _rgPointUsers.delete(pid); }
      }
      _rgNewRing = [];
      _rgDrawHints();
    }

    function _rgCommitNewRegion() {
      const ri = _rgRegions.length;
      const lid = 'r' + (_rgRidCounter++);
      _rgRegions.push({ dbId: null, name: '', ring: [..._rgNewRing], lid });
      for (const pid of _rgNewRing) {
        if (!_rgPointUsers.has(pid)) _rgPointUsers.set(pid, new Set());
        _rgPointUsers.get(pid).add(lid);
      }
      _rgDirtyLids.add(lid);
      _rgCancelNewRing();
      _rgSetMode('select');
      _rgSelectRegion(ri);
      _rgUpdateDirtyIndicator();
    }

    function _rgOnMapClickAddMode(lngLat) {
      const snapPid = _rgFindSnapPoint(lngLat);
      let pid;
      if (snapPid) {
        pid = snapPid;
        _rgFlashVertex(pid);
      } else {
        pid = 'p' + (_rgPtCounter++);
        _rgPoints.set(pid, { id: pid, lat: lngLat.lat, lon: lngLat.lng });
        _rgPointUsers.set(pid, new Set());
      }
      if (_rgNewRing.length >= 3 && pid === _rgNewRing[0]) {
        _rgCommitNewRegion();
        return;
      }
      _rgNewRing.push(pid);
      _rgDrawHints();
    }

    // ── Panel ─────────────────────────────────────────────────────────────────

    function _rgShowPanel(ri) {
      const region = _rgRegions[ri];
      document.getElementById('rg-panel-name').value = region.name;
      const hasShared = region.ring.some(pid => _rgPointUsers.get(pid)?.size > 1);
      document.getElementById('rg-panel-shared-hint').style.display = hasShared ? '' : 'none';
      document.getElementById('rg-panel-status').style.display = 'none';
      document.getElementById('rg-panel-save').disabled = false;
      document.getElementById('rg-panel-delete').disabled = false;
      document.getElementById('rg-panel').classList.add('visible');
      if (!region.name) document.getElementById('rg-panel-name').focus();
    }

    function _rgHidePanel() {
      // Auto-commit the current panel name to in-memory state so it isn't lost on deselect
      if (_rgSelectedIdx !== null) {
        const nameVal = document.getElementById('rg-panel-name').value.trim();
        const region = _rgRegions[_rgSelectedIdx];
        if (nameVal && nameVal !== region.name) {
          region.name = nameVal;
          _rgDirtyLids.add(region.lid);
        }
      }
      document.getElementById('rg-panel').classList.remove('visible');
      _rgClearVertexMarkers();
      _rgClearMidMarkers();
      _rgMergeTargetPid = null;
      _rgSelectedIdx = null;
      _rgDrawHints();
      _rgRenderPolygons();
      _rgUpdateDirtyIndicator();
    }

    function _rgSelectRegion(ri) {
      if (_rgMode !== 'select') return;
      const region = _rgRegions[ri];
      if (region.multiPoly) {
        _setEditorStatus('rg-editor-status', 'MultiPolygon regions cannot be edited here; use import/export.', true);
        setTimeout(() => { _setEditorStatus('rg-editor-status', '', false); _rgUpdateDirtyIndicator(); }, 4000);
        return;
      }
      _rgHidePanel();
      _rgSelectedIdx = ri;
      _rgRenderPolygons();
      _rgRenderVertices(ri);
      _rgRenderMidpoints(ri);
      _rgShowPanel(ri);
    }

    function _rgSetMode(mode) {
      _rgMode = mode;
      document.getElementById('rg-mode-select').classList.toggle('active', mode === 'select');
      document.getElementById('rg-mode-add-region').classList.toggle('active', mode === 'add-region');
      if (mode === 'select') {
        _rgMap.getCanvas().style.cursor = '';
        _rgSnapHoverPid = null;
        _rgCancelNewRing();
        _setEditorStatus('rg-editor-status', '', false);
        _rgUpdateDirtyIndicator();
      } else {
        _rgMap.getCanvas().style.cursor = 'crosshair';
        _rgHidePanel();
        _setEditorStatus('rg-editor-status', 'Click near an existing vertex to snap. Close ring by clicking first vertex.', false);
      }
    }

    // ── Load / delete ─────────────────────────────────────────────────────────

    async function _rgLoadRegions() {
      _setEditorStatus('rg-editor-status', 'Loading…', false);
      _rgHidePanel();
      try {
        const geojson = await fetchRegions();
        _rgBuildTopology(geojson.features);
        _rgRenderPolygons();
        _setEditorStatus('rg-editor-status', '', false);
        _rgUpdateDirtyIndicator();
      } catch (_) {
        _setEditorStatus('rg-editor-status', 'Failed to load regions.', true);
      }
    }

    async function _rgDeleteRegion(ri) {
      const region = _rgRegions[ri];
      const lid = region.lid;
      for (const pid of region.ring) {
        const users = _rgPointUsers.get(pid);
        users.delete(lid);
        if (users.size === 0) { _rgPoints.delete(pid); _rgPointUsers.delete(pid); }
      }
      _rgRegions.splice(ri, 1);
      _rgDirtyLids.delete(lid);
      _rgSelectedIdx = null;
      _rgHidePanel();
      if (region.dbId !== null) {
        // A refused delete is ignored, as it always was, unless the session has gone.
        await deleteRegion(region.dbId).catch((err) => {
          if (!err.status || err.status === 401) alert(apiErrorMessage(err, 'Failed to delete region.'));
        });
      }
      _rgUpdateDirtyIndicator();
    }

    // ── Open editor ───────────────────────────────────────────────────────────

    function _openRegionsEditor() {
      _settingsNavigateTo('settings-view-regions-editor', 'Region Editor');

      // Auto-save dirty regions when the user navigates back or closes
      _settingsBeforeBack = async () => {
        if (_rgSelectedIdx !== null) {
          const nameVal = document.getElementById('rg-panel-name').value.trim();
          const region = _rgRegions[_rgSelectedIdx];
          if (nameVal && nameVal !== region.name) {
            region.name = nameVal;
            _rgDirtyLids.add(region.lid);
          }
        }
        if (_rgDirtyLids.size === 0) return;
        _setEditorStatus('rg-editor-status', 'Saving…', false);
        try {
          await _rgSaveDirty();
          _setEditorStatus('rg-editor-status', 'Saved.', false);
        } catch (_) {
          _setEditorStatus('rg-editor-status', 'Save failed.', true);
        }
      };

      if (!_rgMap) {
        _rgMap = createMap(document.getElementById('rg-editor-map'), _ftDefaultView());
        // Suppress the browser context menu over the map so right-click works for vertex deletion.
        _rgMap.getContainer().addEventListener('contextmenu', e => e.preventDefault());
        ${maplibreMapControlsScripts('_rgMap', 'rg-')}
        ${maplibreOverlayLegendMountScript('_rgMap', 'rg-')}
        _rgPolygons = addMapShape(_rgMap, [], [regionFillLayer(), regionOutlineLayer()]);
        _rgHints = addMapShape(_rgMap, [], [editorDotLayer(), editorDraftLineLayer()], { z: 1 });
        _rgMap.on('click', e => {
          // A click on a marker is the map's too.
          if (e.originalEvent.target.closest('.rg-handle')) return;
          if (_rgMode === 'add-region') { _rgOnMapClickAddMode(e.lngLat); return; }
          const ri = _rgRegionAt(e.point);
          if (ri !== -1) _rgSelectRegion(ri);
        });
        _rgMap.on('mousemove', e => {
          if (_rgMode === 'add-region') _rgOnMouseMoveAddMode(e);
          else _rgMap.getCanvas().style.cursor = _rgRegionAt(e.point) !== -1 ? 'pointer' : '';
        });
      }
      _rgMap.resize();
      _rgDirtyLids.clear();
      _rgSetMode('select');
      _rgLoadRegions();
    }

    document.getElementById('settings-regions-editor-btn').addEventListener('click', _openRegionsEditor);

    document.getElementById('rg-mode-select').addEventListener('click', () => _rgSetMode('select'));
    document.getElementById('rg-mode-add-region').addEventListener('click', () => _rgSetMode('add-region'));
    document.getElementById('rg-panel-cancel').addEventListener('click', _rgHidePanel);

    document.getElementById('rg-panel-save').addEventListener('click', async () => {
      if (_rgSelectedIdx === null) return;
      const name = document.getElementById('rg-panel-name').value.trim();
      const statusEl = document.getElementById('rg-panel-status');
      if (!name) { statusEl.textContent = 'Name is required.'; statusEl.style.display = ''; return; }
      const region = _rgRegions[_rgSelectedIdx];
      if (region.ring && region.ring.length < 3) {
        statusEl.textContent = 'Region must have at least 3 vertices.';
        statusEl.style.display = '';
        return;
      }
      region.name = name;
      _rgDirtyLids.add(region.lid);
      const saveBtn = document.getElementById('rg-panel-save');
      saveBtn.disabled = true;
      statusEl.style.display = 'none';
      try {
        await _rgSaveDirty();
        _setEditorStatus('rg-editor-status', 'Saved.', false);
        setTimeout(() => { _setEditorStatus('rg-editor-status', '', false); _rgUpdateDirtyIndicator(); }, 2000);
        _rgHidePanel();
      } catch (err) {
        statusEl.textContent = err.message ?? 'Save failed.';
        statusEl.style.display = '';
      }
      saveBtn.disabled = false;
    });

    document.getElementById('rg-panel-delete').addEventListener('click', async () => {
      if (_rgSelectedIdx === null) return;
      if (!confirm('Delete this region?')) return;
      const deleteBtn = document.getElementById('rg-panel-delete');
      deleteBtn.disabled = true;
      try {
        await _rgDeleteRegion(_rgSelectedIdx);
        _setEditorStatus('rg-editor-status', 'Deleted.', false);
        setTimeout(() => { _setEditorStatus('rg-editor-status', '', false); _rgUpdateDirtyIndicator(); }, 2000);
      } catch (_) {
        document.getElementById('rg-panel-status').textContent = 'Delete failed.';
        document.getElementById('rg-panel-status').style.display = '';
        deleteBtn.disabled = false;
      }
    });
  `;
}
