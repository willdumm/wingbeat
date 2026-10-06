import {
  sharedTileLayerDefs,
  sharedMapControlsMarkup,
  sharedMapControlsScripts,
  tileOverlayLegendButtonMarkup,
  tileOverlayLegendPanelMarkup,
  tileOverlayLegendMountScript,
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
                <button id="rg-panel-delete" class="settings-danger-btn">Delete region</button>
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
    let _rgTileLayers = null;
    let _rgCurrentTileLayer = null;
    let _rgMode = 'select';

    // Topology state
    let _rgPoints = new Map();      // pointId → { id, lat, lon }
    let _rgRegions = [];            // { dbId, name, ring, lid, multiPoly? }[]
    let _rgPointUsers = new Map();  // pointId → Set<regionLid>

    let _rgPolygonLayers = new Map();   // regionLid → L.Polygon
    let _rgVertexMarkers = new Map();   // pointId → L.CircleMarker
    let _rgVertexHandles = new Map();   // pointId → L.Marker (drag handle)
    let _rgMidMarkers = [];             // L.CircleMarker[]
    let _rgAddModeMarkers = [];         // L.CircleMarker[] shown as snap targets in add mode

    let _rgSelectedIdx = null;
    let _rgDirtyLids = new Set();       // Set<regionLid>

    let _rgNewRing = [];
    let _rgNewRingLayer = null;
    let _rgPtCounter = 0;
    let _rgRidCounter = 0;

    // Snap/hover state
    let _rgSnapHoverPid = null;
    let _rgSnapHoverMarker = null;
    let _rgMergeTargetPid = null;
    let _rgMergeHoverMarker = null;

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
      _rgRenderPolygon(_rgSelectedIdx);
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
        const ri = _rgRegions.indexOf(region);
        _rgRenderPolygon(ri);
      }
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

    function _rgFindMergeTarget(draggedPid, latlng) {
      let best = null;
      let bestDist = Infinity;
      const containerPt = _rgMap.latLngToContainerPoint(latlng);
      for (const [pid, pt] of _rgPoints.entries()) {
        if (pid === draggedPid) continue;
        const ptContainer = _rgMap.latLngToContainerPoint([pt.lat, pt.lon]);
        const dx = containerPt.x - ptContainer.x;
        const dy = containerPt.y - ptContainer.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 14 && d < bestDist) { best = pid; bestDist = d; }
      }
      return best;
    }

    function _rgUpdateMergeHover(draggedPid, latlng) {
      const target = _rgFindMergeTarget(draggedPid, latlng);
      if (target === _rgMergeTargetPid) return;
      _rgMergeTargetPid = target;
      if (_rgMergeHoverMarker) { _rgMergeHoverMarker.remove(); _rgMergeHoverMarker = null; }
      if (target) {
        const pt = _rgPoints.get(target);
        _rgMergeHoverMarker = L.circleMarker([pt.lat, pt.lon], {
          radius: 11, color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.4, weight: 2.5, interactive: false,
        }).addTo(_rgMap);
      }
    }

    function _rgMergePoints(draggedPid, targetPid) {
      const affectedLids = new Set();
      for (const region of _rgRegions) {
        if (!region.ring || !region.ring.includes(draggedPid)) continue;
        const testRing = region.ring.map(p => p === draggedPid ? targetPid : p);
        const deduped = _rgDedupeRing(testRing);
        if (deduped.length < 3) continue; // skip: merge would destroy this ring
        region.ring = deduped;
        if (!_rgPointUsers.has(targetPid)) _rgPointUsers.set(targetPid, new Set());
        _rgPointUsers.get(targetPid).add(region.lid);
        affectedLids.add(region.lid);
        _rgDirtyLids.add(region.lid);
      }
      _rgPoints.delete(draggedPid);
      _rgPointUsers.delete(draggedPid);
      for (const lid of affectedLids) {
        const ri = _rgRegions.findIndex(r => r.lid === lid);
        if (ri !== -1) _rgRenderPolygon(ri);
      }
      if (_rgSelectedIdx !== null) { _rgRenderVertices(_rgSelectedIdx); _rgRenderMidpoints(_rgSelectedIdx); }
      _rgUpdateDirtyIndicator();
    }

    function _rgOnVertexDragEnd(pid, latlng) {
      if (_rgMergeHoverMarker) { _rgMergeHoverMarker.remove(); _rgMergeHoverMarker = null; }
      const target = _rgFindMergeTarget(pid, latlng);
      _rgMergeTargetPid = null;
      if (target) _rgMergePoints(pid, target);
    }

    // ── Add-mode snap indicator ───────────────────────────────────────────────

    function _rgRenderAddModeMarkers() {
      for (const m of _rgAddModeMarkers) m.remove();
      _rgAddModeMarkers = [];
      if (!_rgMap) return;
      for (const [, pt] of _rgPoints.entries()) {
        const m = L.circleMarker([pt.lat, pt.lon], {
          radius: 7, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.25, weight: 2, interactive: false,
        }).addTo(_rgMap);
        _rgAddModeMarkers.push(m);
      }
    }

    function _rgClearAddModeMarkers() {
      for (const m of _rgAddModeMarkers) m.remove();
      _rgAddModeMarkers = [];
    }

    function _rgOnMouseMoveAddMode(e) {
      const pid = _rgFindSnapPoint(e.latlng);
      if (pid === _rgSnapHoverPid) return;
      _rgSnapHoverPid = pid;
      if (_rgSnapHoverMarker) { _rgSnapHoverMarker.remove(); _rgSnapHoverMarker = null; }
      if (pid) {
        const pt = _rgPoints.get(pid);
        _rgSnapHoverMarker = L.circleMarker([pt.lat, pt.lon], {
          radius: 11, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.4, weight: 2.5, interactive: false,
        }).addTo(_rgMap);
      }
    }

    function _rgFlashVertex(pid) {
      const pt = _rgPoints.get(pid);
      if (!pt) return;
      const flash = L.circleMarker([pt.lat, pt.lon], {
        radius: 13, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.55, weight: 3, interactive: false,
      }).addTo(_rgMap);
      setTimeout(() => flash.remove(), 500);
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
        if (region.dbId === null) {
          const resp = await fetch('/api/regions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: region.name, geojson }),
          });
          const data = await resp.json();
          if (resp.ok) region.dbId = data.id;
          else throw new Error(data.error ?? 'Save failed');
        } else {
          const resp = await fetch('/api/regions/' + region.dbId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: region.name, geojson }),
          });
          if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error ?? 'Save failed'); }
        }
      });
      await Promise.all(saves);
      _rgDirtyLids.clear();
      _rgUpdateDirtyIndicator();
    }

    // ── Render ────────────────────────────────────────────────────────────────

    function _rgRenderPolygon(ri) {
      const region = _rgRegions[ri];
      if (!region || region.multiPoly) return;
      const lid = region.lid;
      const latlngs = region.ring.map(pid => {
        const { lat, lon } = _rgPoints.get(pid);
        return [lat, lon];
      });
      if (_rgPolygonLayers.has(lid)) {
        _rgPolygonLayers.get(lid).setLatLngs(latlngs);
      } else {
        const isSelected = _rgSelectedIdx === ri;
        const poly = L.polygon(latlngs, {
          color: isSelected ? '#f90' : getAccentColor(),
          weight: isSelected ? 2.5 : 1.5,
          fillOpacity: 0.06,
        }).addTo(_rgMap);
        poly.on('click', () => {
          const currentRi = _rgRegions.findIndex(r => r.lid === lid);
          if (currentRi !== -1) _rgSelectRegion(currentRi);
        });
        _rgPolygonLayers.set(lid, poly);
      }
    }

    function _rgClearVertexMarkers() {
      for (const m of _rgVertexMarkers.values()) m.remove();
      for (const h of _rgVertexHandles.values()) h.remove();
      _rgVertexMarkers.clear();
      _rgVertexHandles.clear();
    }

    function _rgClearMidMarkers() {
      for (const m of _rgMidMarkers) m.remove();
      _rgMidMarkers = [];
    }

    function _rgRenderVertices(ri) {
      _rgClearVertexMarkers();
      const seen = new Set();
      for (const pid of _rgRegions[ri].ring) {
        if (seen.has(pid)) continue;
        seen.add(pid);
        const { lat, lon } = _rgPoints.get(pid);
        const shared = _rgPointUsers.get(pid).size > 1;
        const color = shared ? '#f90' : getAccentColor();
        const marker = L.circleMarker([lat, lon], {
          radius: 6, color, fillColor: color, fillOpacity: 0.9, weight: 1.5,
        }).addTo(_rgMap);
        _rgVertexMarkers.set(pid, marker);

        // Right-click to delete vertex
        marker.on('contextmenu', e => {
          L.DomEvent.stopPropagation(e);
          e.originalEvent.preventDefault();
          _rgShowCtxMenu(e.originalEvent.clientX, e.originalEvent.clientY, pid);
        });

        const dragIcon = L.divIcon({ className: 'rg-drag-handle', iconSize: [16, 16] });
        const handle = L.marker([lat, lon], { icon: dragIcon, draggable: true }).addTo(_rgMap);
        handle.on('contextmenu', e => {
          L.DomEvent.stopPropagation(e);
          e.originalEvent.preventDefault();
          _rgShowCtxMenu(e.originalEvent.clientX, e.originalEvent.clientY, pid);
        });

        let _longPressTimer = null;
        handle.on('touchstart', e => {
          const touch = e.originalEvent.touches[0];
          const startX = touch.clientX, startY = touch.clientY;
          _longPressTimer = setTimeout(() => {
            _longPressTimer = null;
            _rgShowCtxMenu(startX, startY, pid);
          }, 500);
        });
        handle.on('touchmove', () => {
          if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
        });
        handle.on('touchend', () => {
          if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
        });

        handle.on('drag', e => {
          _rgOnVertexDrag(pid, e.latlng);
          _rgUpdateMergeHover(pid, e.latlng);
        });
        handle.on('dragend', e => _rgOnVertexDragEnd(pid, e.target.getLatLng()));
        _rgVertexHandles.set(pid, handle);
      }
    }

    function _rgRenderMidpoints(ri) {
      _rgClearMidMarkers();
      const ring = _rgRegions[ri].ring;
      for (let i = 0; i < ring.length; i++) {
        const p0 = _rgPoints.get(ring[i]);
        const p1 = _rgPoints.get(ring[(i + 1) % ring.length]);
        const midLat = (p0.lat + p1.lat) / 2;
        const midLon = (p0.lon + p1.lon) / 2;
        const edgeIdx = i;
        const m = L.circleMarker([midLat, midLon], {
          radius: 4, color: '#888', fillColor: '#ccc', fillOpacity: 0.8, weight: 1,
        }).addTo(_rgMap);

        // Insert vertex on mousedown and immediately allow dragging.
        // We use document-level listeners because _rgInsertVertex → _rgRenderMidpoints
        // removes 'm' from the DOM before mousemove/mouseup fire.
        m.on('mousedown', e => {
          L.DomEvent.stopPropagation(e);
          _rgMap.dragging.disable();
          const insertedPid = _rgInsertVertex(ri, edgeIdx, midLat, midLon);
          function onMove(mv) {
            const latlng = _rgMap.containerPointToLatLng(_rgMap.mouseEventToContainerPoint(mv));
            _rgOnVertexDrag(insertedPid, latlng);
            _rgUpdateMergeHover(insertedPid, latlng);
            _rgVertexHandles.get(insertedPid)?.setLatLng(latlng);
          }
          function onUp(uv) {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            _rgMap.dragging.enable();
            const latlng = _rgMap.containerPointToLatLng(_rgMap.mouseEventToContainerPoint(uv));
            _rgOnVertexDragEnd(insertedPid, latlng);
            _rgVertexHandles.get(insertedPid)?.setLatLng(latlng);
          }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });

        m.on('touchstart', e => {
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e);
          _rgMap.dragging.disable();
          const insertedPid = _rgInsertVertex(ri, edgeIdx, midLat, midLon);
          function onMove(mv) {
            mv.preventDefault();
            const t = mv.touches[0];
            const latlng = _rgMap.containerPointToLatLng(_rgMap.mouseEventToContainerPoint(t));
            _rgOnVertexDrag(insertedPid, latlng);
            _rgUpdateMergeHover(insertedPid, latlng);
            _rgVertexHandles.get(insertedPid)?.setLatLng(latlng);
          }
          function onEnd(ev) {
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
            _rgMap.dragging.enable();
            const t = ev.changedTouches[0];
            const latlng = _rgMap.containerPointToLatLng(_rgMap.mouseEventToContainerPoint(t));
            _rgOnVertexDragEnd(insertedPid, latlng);
            _rgVertexHandles.get(insertedPid)?.setLatLng(latlng);
          }
          document.addEventListener('touchmove', onMove, { passive: false });
          document.addEventListener('touchend', onEnd);
        });

        _rgMidMarkers.push(m);
      }
    }

    function _rgOnVertexDrag(pid, latlng) {
      const pt = _rgPoints.get(pid);
      pt.lat = latlng.lat;
      pt.lon = latlng.lng;
      _rgVertexMarkers.get(pid)?.setLatLng(latlng);
      for (const lid of _rgPointUsers.get(pid)) {
        const ri = _rgRegions.findIndex(r => r.lid === lid);
        if (ri !== -1) {
          _rgRenderPolygon(ri);
          _rgDirtyLids.add(lid);
        }
      }
      if (_rgSelectedIdx !== null) _rgRenderMidpoints(_rgSelectedIdx);
      _rgUpdateDirtyIndicator();
    }

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

      _rgRenderPolygon(ri);
      _rgRenderVertices(ri);
      _rgRenderMidpoints(ri);
      _rgDirtyLids.add(newLid);
      _rgUpdateDirtyIndicator();
      return newId;
    }

    function _rgFindSnapPoint(latlng) {
      let best = null;
      let bestDist = Infinity;
      const containerPt = _rgMap.latLngToContainerPoint(latlng);
      for (const [pid, pt] of _rgPoints.entries()) {
        const ptContainer = _rgMap.latLngToContainerPoint([pt.lat, pt.lon]);
        const dx = containerPt.x - ptContainer.x;
        const dy = containerPt.y - ptContainer.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 10 && d < bestDist) { best = pid; bestDist = d; }
      }
      return best;
    }

    function _rgRedrawNewRingPreview() {
      if (_rgNewRingLayer) { _rgNewRingLayer.remove(); _rgNewRingLayer = null; }
      if (_rgNewRing.length < 1) return;
      const latlngs = _rgNewRing.map(pid => {
        const { lat, lon } = _rgPoints.get(pid);
        return [lat, lon];
      });
      _rgNewRingLayer = L.polyline(latlngs, { color: '#22c55e', weight: 2, dashArray: '5,4' }).addTo(_rgMap);
    }

    function _rgCancelNewRing() {
      // Remove any temporary points created only for the new ring (no region users yet)
      for (const pid of _rgNewRing) {
        const users = _rgPointUsers.get(pid);
        if (users && users.size === 0) { _rgPoints.delete(pid); _rgPointUsers.delete(pid); }
      }
      _rgNewRing = [];
      if (_rgNewRingLayer) { _rgNewRingLayer.remove(); _rgNewRingLayer = null; }
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
      _rgRenderPolygon(ri);
      _rgSetMode('select');
      _rgSelectRegion(ri);
      _rgUpdateDirtyIndicator();
    }

    function _rgOnMapClickAddMode(latlng) {
      const snapPid = _rgFindSnapPoint(latlng);
      let pid;
      if (snapPid) {
        pid = snapPid;
        _rgFlashVertex(pid);
      } else {
        pid = 'p' + (_rgPtCounter++);
        _rgPoints.set(pid, { id: pid, lat: latlng.lat, lon: latlng.lng });
        _rgPointUsers.set(pid, new Set());
        // Add a snap-target marker for the new point too
        const m = L.circleMarker([latlng.lat, latlng.lng], {
          radius: 7, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.25, weight: 2, interactive: false,
        }).addTo(_rgMap);
        _rgAddModeMarkers.push(m);
      }
      if (_rgNewRing.length >= 3 && pid === _rgNewRing[0]) {
        _rgRedrawNewRingPreview();
        _rgCommitNewRegion();
        return;
      }
      _rgNewRing.push(pid);
      _rgRedrawNewRingPreview();
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
      if (_rgMap) setTimeout(() => _rgMap.invalidateSize(), 0);
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
      if (_rgMergeHoverMarker) { _rgMergeHoverMarker.remove(); _rgMergeHoverMarker = null; }
      _rgMergeTargetPid = null;
      if (_rgSelectedIdx !== null) {
        const region = _rgRegions[_rgSelectedIdx];
        if (region) {
          const poly = _rgPolygonLayers.get(region.lid);
          if (poly) poly.setStyle({ color: getAccentColor(), weight: 1.5 });
        }
        _rgSelectedIdx = null;
      }
      if (_rgMap) setTimeout(() => _rgMap.invalidateSize(), 0);
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
      const poly = _rgPolygonLayers.get(region.lid);
      if (poly) poly.setStyle({ color: '#f90', weight: 2.5 });
      _rgRenderVertices(ri);
      _rgRenderMidpoints(ri);
      _rgShowPanel(ri);
    }

    function _rgSetMode(mode) {
      _rgMode = mode;
      document.getElementById('rg-mode-select').classList.toggle('active', mode === 'select');
      document.getElementById('rg-mode-add-region').classList.toggle('active', mode === 'add-region');
      if (mode === 'select') {
        _rgMap.getContainer().style.cursor = '';
        _rgCancelNewRing();
        _rgClearAddModeMarkers();
        _rgMap.off('mousemove', _rgOnMouseMoveAddMode);
        if (_rgSnapHoverMarker) { _rgSnapHoverMarker.remove(); _rgSnapHoverMarker = null; }
        _rgSnapHoverPid = null;
        _setEditorStatus('rg-editor-status', '', false);
        _rgUpdateDirtyIndicator();
      } else {
        _rgMap.getContainer().style.cursor = 'crosshair';
        _rgHidePanel();
        _rgRenderAddModeMarkers();
        _rgMap.on('mousemove', _rgOnMouseMoveAddMode);
        _setEditorStatus('rg-editor-status', 'Click near an existing vertex to snap. Close ring by clicking first vertex.', false);
      }
    }

    // ── Load / delete ─────────────────────────────────────────────────────────

    async function _rgLoadRegions() {
      _setEditorStatus('rg-editor-status', 'Loading…', false);
      _rgHidePanel();
      for (const poly of _rgPolygonLayers.values()) poly.remove();
      _rgPolygonLayers.clear();
      try {
        const resp = await fetch('/api/regions', { cache: 'no-store' });
        if (!resp.ok) { _setEditorStatus('rg-editor-status', 'Failed to load regions.', true); return; }
        const geojson = await resp.json();
        _rgBuildTopology(geojson.features);
        for (let ri = 0; ri < _rgRegions.length; ri++) _rgRenderPolygon(ri);
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
      const poly = _rgPolygonLayers.get(lid);
      if (poly) { poly.remove(); _rgPolygonLayers.delete(lid); }
      _rgDirtyLids.delete(lid);
      _rgSelectedIdx = null;
      _rgHidePanel();
      if (region.dbId !== null) {
        await fetch('/api/regions/' + region.dbId, { method: 'DELETE' });
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
        const rgMap = L.map('rg-editor-map', { zoomControl: false, attributionControl: false })
          .setView(
            [window.APP_SETTINGS.mapDefaultLat, window.APP_SETTINGS.mapDefaultLng],
            window.APP_SETTINGS.mapDefaultZoom
          );
        ${sharedTileLayerDefs('rgMap', '_rgTileLayers', '_rgCurrentTileLayer', false)}
        _rgMap = rgMap;
        // Suppress the browser context menu over the map so right-click works for vertex deletion.
        _rgMap.getContainer().addEventListener('contextmenu', e => e.preventDefault());
        _rgMap.on('click', e => {
          if (_rgMode === 'add-region') _rgOnMapClickAddMode(e.latlng);
        });
        ${sharedMapControlsScripts('_rgMap', 'rg-', '_rgTileLayers', '_rgCurrentTileLayer')}
        ${tileOverlayLegendMountScript('_rgMap', 'rg-')}
      }
      _rgMap.invalidateSize();
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
