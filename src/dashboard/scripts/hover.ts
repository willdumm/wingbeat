/**
 * Map-level hover / touch interaction.
 * Declares `hoverTip` (const — must be before use in snapToNearestPoint) and
 * wires the mousemove, mouseout, and touchend listeners.
 * Reads: activeLatlngs, activePointData, activePointLabels, hoverDot, pinnedTip
 * Writes: hoverDot, pinnedTip (via assignment to the vars declared in state.ts)
 */
export function dashboardScriptsHover(): string {
  return `
    const hoverTip = L.tooltip({ permanent: true, direction: 'top', offset: [0, -12] });

    // ── Map-level hover (wider engagement than the 3 px polyline stroke) ──────

    // Returns the index of the nearest route point within 30 px, or -1.
    function nearestRouteIdx(containerPt) {
      if (!activeLatlngs.length) return -1;
      let minPx = Infinity, nearestIdx = 0;
      for (let i = 0; i < activeLatlngs.length; i++) {
        const pt = map.latLngToContainerPoint(activeLatlngs[i]);
        const d = Math.hypot(containerPt.x - pt.x, containerPt.y - pt.y);
        if (d < minPx) { minPx = d; nearestIdx = i; }
      }
      return minPx <= 30 ? nearestIdx : -1;
    }

    // Snaps to the nearest track point within 30 px of screenPt.
    // Updates hoverDot and hoverTip in place. Returns true if snapped.
    function snapToNearestPoint(screenPt) {
      const nearestIdx = nearestRouteIdx(screenPt);
      if (nearestIdx === -1) return false;

      const nearest = activePointData[nearestIdx];
      const snapLatLng = activeLatlngs[nearestIdx];

      const nextLl = activeLatlngs[Math.min(nearestIdx + 1, activeLatlngs.length - 1)];
      const prevLl = activeLatlngs[Math.max(nearestIdx - 1, 0)];
      const refLl = nextLl !== snapLatLng ? nextLl : prevLl;
      const bearing = nearest.course_deg ?? bearingBetween(snapLatLng, refLl);
      if (hoverDot) {
        hoverDot.setLatLng(snapLatLng).setIcon(makeArrowIcon(bearing));
      } else {
        hoverDot = L.marker(snapLatLng, { icon: makeArrowIcon(bearing), interactive: false }).addTo(map);
      }

      const time = nearest.garmin_time
        ? new Date(nearest.garmin_time * 1000).toLocaleString(undefined,
            { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '\u2014';
      const speed = nearest.velocity_kmh != null ? toKnots(nearest.velocity_kmh) : '\u2014';
      const alt = nearest.elevation_m != null ? toFeet(nearest.elevation_m) : '\u2014';
      const tipLabel = activePointLabels[nearestIdx] ?? '';
      const nearestTracker = nearest.tracker_id != null
        ? trackerList.find(t => t.id === nearest.tracker_id)
        : null;
      const displayName = nearestTracker
        ? (nearestTracker.assigned_aircraft || nearestTracker.name)
        : null;

      hoverTip.setContent(
        '<div style="line-height:1.6;white-space:nowrap">' +
        (tipLabel ? '<b>' + tipLabel + '</b><br>' : '') +
        (displayName ? displayName + '<br>' : '') +
        time + '<br>' +
        speed + '&nbsp;&nbsp;' + alt +
        '</div>'
      ).setLatLng(snapLatLng).addTo(map);

      return true;
    }

    map.on('mousemove', (e) => {
      if (pinnedTip) return;
      if (pointPickerActive) return;
      if (!activeLatlngs.length || !activePointData.length) return;
      const snapped = snapToNearestPoint(e.containerPoint);
      if (!snapped) {
        hoverTip.remove();
        if (hoverDot) { hoverDot.remove(); hoverDot = null; }
      }
    });

    map.on('mouseout', () => {
      if (pinnedTip) return;
      if (pointPickerActive) return;
      hoverTip.remove();
      if (hoverDot) { hoverDot.remove(); hoverDot = null; }
    });

    // ── Touch: pin tooltip on tap, dismiss on tap away ─────────────────────────
    map.getContainer().addEventListener('touchend', (e) => {
      if (pointPickerActive) return;
      if (!activeLatlngs.length || !activePointData.length) return;
      if (e.changedTouches.length === 0) return;

      const rect = map.getContainer().getBoundingClientRect();
      const touch = e.changedTouches[0];
      const touchPt = L.point(touch.clientX - rect.left, touch.clientY - rect.top);
      const snapped = snapToNearestPoint(touchPt);

      if (!snapped) {
        if (pinnedTip) {
          hoverTip.remove();
          if (hoverDot) { hoverDot.remove(); hoverDot = null; }
          pinnedTip = false;
        }
        return;
      }

      pinnedTip = true;
    }, { passive: true });
  `;
}
