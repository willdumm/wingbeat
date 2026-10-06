/**
 * "Current location" modal dialog.
 */
export function dashboardScriptsLocationPopup(): string {
  return `
    // ── Location popup ────────────────────────────────────────────────────────
    const locationPopup        = document.getElementById('location-popup');
    const locationPopupLatLng  = document.getElementById('location-popup-latlng');
    const locationPopupGmaps   = document.getElementById('location-popup-gmaps');
    const locationPopupGarminRow = document.getElementById('location-popup-garmin-row');
    const locationPopupGarmin  = document.getElementById('location-popup-garmin');
    const locationPopupCopy    = document.getElementById('location-popup-copy');
    const locationPopupCopyLbl = document.getElementById('location-popup-copy-label');
    const locationPopupDetails = document.getElementById('location-popup-details');

    // Holds the data for the currently-open popup so the copy handler can use it.
    let _locationPopupData = null;

    function openLocationPopup(trackerId) {
      const d = trackerId != null ? (liveDataByTracker[trackerId] ?? null) : getAnyLiveData();
      if (!d || !d.lat) return;
      _locationPopupData = d;
      const lat = d.lat.toFixed(6);
      const lon = d.lon.toFixed(6);
      const coordStr = lat + ', ' + lon;
      locationPopupLatLng.textContent = coordStr;
      locationPopupGmaps.href = 'https://www.google.com/maps?q=' + lat + ',' + lon;

      // Build details grid
      const rows = [];
      const _tracker = trackerId != null ? trackerList.find(t => t.id === trackerId) : null;
      if (_tracker) {
        rows.push(['Tracker', _tracker.name]);
        if (_tracker.assigned_aircraft) rows.push(['Aircraft', _tracker.assigned_aircraft]);
      }

      // Same transform as the server's mapshareUrl() in notifications.ts: the stored feed
      // URL (".../Feed/Share/NAME") is the machine feed; the human-viewable MapShare page
      // drops that path segment ("share.garmin.com/NAME").
      if (_tracker && _tracker.source_url) {
        try {
          const u = new URL(_tracker.source_url);
          u.pathname = u.pathname.replace(/^\\/Feed\\/Share\\//i, '/');
          u.search = '';
          locationPopupGarmin.href = u.toString();
          locationPopupGarminRow.style.display = '';
        } catch (_) {
          locationPopupGarminRow.style.display = 'none';
        }
      } else {
        locationPopupGarminRow.style.display = 'none';
      }
      const _recentFlight = trackerId != null ? allFlights.find(f => f.tracker_id === trackerId) : null;
      if (_recentFlight?.pilot_name) rows.push(['Pilot', _recentFlight.pilot_name]);
      if (d.elevation_m != null) rows.push(['Altitude', toFeet(d.elevation_m)]);
      if (d.velocity_kmh != null) rows.push(['Speed', toKnots(d.velocity_kmh)]);
      if (d.course_deg != null) rows.push(['Heading', Math.round(d.course_deg) + '\\xb0 ' + cardinalDir(d.course_deg)]);
      if (d.location_label) rows.push(['Location', d.location_label]);
      if (d.garmin_time) rows.push(['GPS fix', relTime(d.garmin_time)]);

      locationPopupDetails.innerHTML = rows.map(([label, value]) =>
        '<span class="popup-detail-label">' + label + '</span>' +
        '<span class="popup-detail-value">' + value + '</span>'
      ).join('');

      locationPopup.classList.remove('hidden');
    }

    function closeLocationPopup() {
      locationPopup.classList.add('hidden');
      _locationPopupData = null;
    }

    document.getElementById('location-popup-backdrop').addEventListener('click', closeLocationPopup);
    document.getElementById('location-popup-close').addEventListener('click', closeLocationPopup);

    locationPopupCopy.addEventListener('click', () => {
      const d = _locationPopupData;
      if (!d || !d.lat) return;
      copyToClipboard(
        d.lat.toFixed(6) + ', ' + d.lon.toFixed(6),
        locationPopupCopy, locationPopupCopyLbl,
      );
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLocationPopup();
    });

    wireLinkCopyButtons(document);
  `;
}
