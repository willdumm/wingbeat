/**
 * Point picker tool.
 * Activates a crosshair mode on the map where clicking (or tapping) opens a
 * popup showing the lat/lng and a Google Maps link for that location.
 * Uses nearestRouteIdx (defined in hover.ts) to snap within 30 px of a route
 * point and show flight details; uses the raw map coordinate otherwise.
 *
 * Reads: activeLatlngs, activePointData, pinnedTip, hoverTip, hoverDot,
 *   elevationToolActive, deactivateElevationTool (elevation.ts, for mutual exclusion
 *   with the elevation tool's own click-to-set-reference mode)
 * Writes: pointPickerActive, pickerDot, pinnedTip, hoverDot
 * `rootExpr` names the node the popup and button are looked up in (a shadow root
 * for the showcase demos).
 */
export function dashboardScriptsPointPicker(rootExpr = 'document'): string {
  return `
    // ── Point picker ──────────────────────────────────────────────────────────
    const pointPickerPopup    = ${rootExpr}.getElementById('point-picker-popup');
    const pointPickerLatlngEl = ${rootExpr}.getElementById('point-picker-latlng');
    const pointPickerGmaps    = ${rootExpr}.getElementById('point-picker-gmaps');
    const pointPickerCopy     = ${rootExpr}.getElementById('point-picker-copy');
    const pointPickerCopyLbl  = ${rootExpr}.getElementById('point-picker-copy-label');
    const pointPickerDetails  = ${rootExpr}.getElementById('point-picker-details');
    const pointPickerBtn      = ${rootExpr}.getElementById('point-picker-btn');
    let pickerDotPinned = false;
    const PICKER_DOT_HTML = '<div style="width:12px;height:12px;border-radius:50%;background:var(--accent)"></div>';

    // Shows the picker's dot at latlng ([lat, lon]).
    function placePickerDot(latlng) {
      if (pickerDot) setHtmlMarker(pickerDot, latlng, PICKER_DOT_HTML);
      else pickerDot = addHtmlMarker(map, latlng, PICKER_DOT_HTML);
    }

    function activatePointPicker() {
      pointPickerActive = true;
      pointPickerBtn.classList.add('active');
      map.getCanvas().style.cursor = 'crosshair';
      // Only one "special click mode" tool active at a time.
      if (elevationToolActive) deactivateElevationTool();
      // Clear any pinned hover tooltip so it doesn't linger during picker mode
      if (pinnedTip) {
        hoverTip.remove();
        if (hoverDot) { hoverDot.remove(); hoverDot = null; }
        pinnedTip = false;
      }
    }

    function deactivatePointPicker() {
      pointPickerActive = false;
      pickerDotPinned = false;
      pointPickerBtn.classList.remove('active');
      map.getCanvas().style.cursor = '';
      if (pickerDot) { pickerDot.remove(); pickerDot = null; }
    }

    function openPickerPopup(lat, lng, routePoint) {
      // Pin the dot at the exact clicked position for the duration of the popup
      placePickerDot([lat, lng]);
      pickerDotPinned = true;
      ${rootExpr}.getElementById('point-picker-route-status').textContent =
        routePoint ? 'on route' : 'off route';

      const _t = routePoint?.tracker_id != null
        ? trackerList.find(tr => tr.id === routePoint.tracker_id)
        : null;
      const _f = routePoint?.flight_id != null
        ? allFlights.find(fl => fl.id === routePoint.flight_id)
        : null;
      const details = pickedPointDetails(lat, lng, routePoint && {
        time: routePoint.garmin_time, velocity_kmh: routePoint.velocity_kmh, elevation_m: routePoint.elevation_m,
      }, _t ?? null, _f?.pilot_name);
      pointPickerLatlngEl.textContent = details.coords;
      pointPickerGmaps.href = details.googleMapsUrl;
      pointPickerDetails.innerHTML = details.rows.map(([label, value]) =>
        '<span class="popup-detail-label">' + escHtml(label) + '</span>' +
        '<span class="popup-detail-value">' + escHtml(value) + '</span>'
      ).join('');

      pointPickerPopup.classList.remove('hidden');
    }

    function closePickerPopup() {
      pointPickerPopup.classList.add('hidden');
      pickerDotPinned = false;
      if (pickerDot) { pickerDot.remove(); pickerDot = null; }
    }

    // Desktop hover: show a preview dot that snaps to a route point or follows the cursor
    map.on('mousemove', (e) => {
      if (!pointPickerActive || pickerDotPinned) return;
      const idx = nearestRouteIdx(e.point);
      placePickerDot(idx !== -1 ? activeLatlngs[idx] : [e.lngLat.lat, e.lngLat.lng]);
    });

    map.on('mouseout', () => {
      if (!pointPickerActive || pickerDotPinned) return;
      if (pickerDot) { pickerDot.remove(); pickerDot = null; }
    });

    // Click / tap: open the popup at the snapped or raw position
    map.on('click', (e) => {
      if (!pointPickerActive) return;
      const idx = nearestRouteIdx(e.point);
      const ll = idx !== -1 ? activeLatlngs[idx] : [e.lngLat.lat, e.lngLat.lng];
      const routePoint = idx !== -1 ? activePointData[idx] : null;
      openPickerPopup(ll[0], ll[1], routePoint);
    });

    // Toggle picker mode on/off
    pointPickerBtn.addEventListener('click', () => {
      if (pointPickerActive) { deactivatePointPicker(); } else { activatePointPicker(); }
    });

    ${rootExpr}.getElementById('point-picker-backdrop').addEventListener('click', closePickerPopup);
    ${rootExpr}.getElementById('point-picker-close').addEventListener('click', closePickerPopup);

    pointPickerCopy.addEventListener('click', () => {
      copyToClipboard(pointPickerLatlngEl.textContent, pointPickerCopy, pointPickerCopyLbl);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!pointPickerPopup.classList.contains('hidden')) {
        closePickerPopup();
      } else if (pointPickerActive) {
        deactivatePointPicker();
      }
    });
  `;
}
