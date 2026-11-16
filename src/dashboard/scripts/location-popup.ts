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
      // The rows and links (core's locationDetails). mapshare_url is derived server-side
      // (mapshareUrl() in notifications.ts); the raw feed URL is admin-only.
      const _tracker = trackerId != null ? trackerList.find(t => t.id === trackerId) : null;
      const _recentFlight = trackerId != null ? allFlights.find(f => f.tracker_id === trackerId) : null;
      const details = locationDetails(_tracker ?? null, d, _recentFlight?.pilot_name);
      locationPopupLatLng.textContent = details.coords;
      locationPopupGmaps.href = details.googleMapsUrl;
      if (details.mapshareUrl) {
        locationPopupGarmin.href = details.mapshareUrl;
        locationPopupGarminRow.style.display = '';
      } else {
        locationPopupGarminRow.style.display = 'none';
      }
      locationPopupDetails.innerHTML = details.rows.map(([label, value]) =>
        '<span class="popup-detail-label">' + escHtml(label) + '</span>' +
        '<span class="popup-detail-value">' + escHtml(value) + '</span>'
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
