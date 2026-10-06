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

    function activatePointPicker() {
      pointPickerActive = true;
      pointPickerBtn.classList.add('active');
      map.getContainer().style.cursor = 'crosshair';
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
      map.getContainer().style.cursor = '';
      if (pickerDot) { pickerDot.remove(); pickerDot = null; }
    }

    function openPickerPopup(lat, lng, routePoint) {
      // Pin the dot at the exact clicked position for the duration of the popup
      const clickLatLng = L.latLng(lat, lng);
      if (!pickerDot) {
        pickerDot = L.circleMarker(clickLatLng, {
          radius: 5, color: getAccentColor(), fillColor: getAccentColor(), fillOpacity: 1,
          weight: 2, interactive: false,
        }).addTo(map);
      } else {
        pickerDot.setLatLng(clickLatLng);
      }
      pickerDotPinned = true;
      ${rootExpr}.getElementById('point-picker-route-status').textContent =
        routePoint ? 'on route' : 'off route';

      const latStr = lat.toFixed(6);
      const lngStr = lng.toFixed(6);
      pointPickerLatlngEl.textContent = latStr + ', ' + lngStr;
      pointPickerGmaps.href = 'https://www.google.com/maps?q=' + latStr + ',' + lngStr;

      const rows = [];
      if (routePoint) {
        const _t = routePoint.tracker_id != null
          ? trackerList.find(tr => tr.id === routePoint.tracker_id)
          : null;
        if (_t) {
          rows.push(['Tracker', _t.name]);
          if (_t.assigned_aircraft) rows.push(['Aircraft', _t.assigned_aircraft]);
        }
        if (routePoint.flight_id != null) {
          const _f = allFlights.find(fl => fl.id === routePoint.flight_id);
          if (_f?.pilot_name) rows.push(['Pilot', _f.pilot_name]);
        }
        if (routePoint.garmin_time) rows.push(['Time',
          new Date(routePoint.garmin_time * 1000).toLocaleString(undefined,
            { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })]);
        if (routePoint.velocity_kmh != null) rows.push(['Speed', toKnots(routePoint.velocity_kmh)]);
        if (routePoint.elevation_m != null) rows.push(['Altitude', toFeet(routePoint.elevation_m)]);
      }
      pointPickerDetails.innerHTML = rows.map(([label, value]) =>
        '<span class="popup-detail-label">' + label + '</span>' +
        '<span class="popup-detail-value">' + value + '</span>'
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
      const idx = nearestRouteIdx(e.containerPoint);
      const latlng = idx !== -1 ? activeLatlngs[idx] : e.latlng;
      if (!pickerDot) {
        pickerDot = L.circleMarker(latlng, {
          radius: 5, color: getAccentColor(), fillColor: getAccentColor(), fillOpacity: 1,
          weight: 2, interactive: false,
        }).addTo(map);
      } else {
        pickerDot.setLatLng(latlng);
      }
    });

    map.on('mouseout', () => {
      if (!pointPickerActive || pickerDotPinned) return;
      if (pickerDot) { pickerDot.remove(); pickerDot = null; }
    });

    // Click / tap: open the popup at the snapped or raw position
    map.on('click', (e) => {
      if (!pointPickerActive) return;
      const idx = nearestRouteIdx(e.containerPoint);
      // activeLatlngs stores plain [lat,lon] arrays; normalise to LatLng
      const ll = idx !== -1 ? L.latLng(activeLatlngs[idx]) : e.latlng;
      const routePoint = idx !== -1 ? activePointData[idx] : null;
      openPickerPopup(ll.lat, ll.lng, routePoint);
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
