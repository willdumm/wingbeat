export function analyticsScriptsRegion(): string {
  return `
    let REGIONS = null;

    async function loadRegions() {
      try {
        const res = await fetch('/api/regions');
        if (res.ok) REGIONS = await res.json();
      } catch (_) {}
    }

    function haversineKm(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
    }

    function pointInPolygon(lat, lon, coords) {
      // Ray-casting: coords are [lon, lat] pairs (GeoJSON order)
      let inside = false;
      for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
        const xi = coords[i][0], yi = coords[i][1];
        const xj = coords[j][0], yj = coords[j][1];
        if ((yi > lat) !== (yj > lat) &&
            lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
      return inside;
    }

    // A region named "… (Base)" is a home base: accounting leaves out time spent flying to
    // and from it, and counts stops there separately. The marker is dropped wherever the
    // name is shown (except the regions editor, which edits the stored name).
    const HOME_BASE_MARKER = /\\s*\\(base\\)\\s*$/i;

    function isHomeBaseRegion(feature) {
      return HOME_BASE_MARKER.test(feature.properties.Name || '');
    }

    function regionDisplayName(name) {
      return (name || '').replace(HOME_BASE_MARKER, '');
    }

    // Display names of the home base regions, sorted.
    function homeBaseNames() {
      if (!REGIONS) return [];
      return REGIONS.features.filter(isHomeBaseRegion).map(f => regionDisplayName(f.properties.Name)).sort();
    }

    // The display name of the home base region containing the point, or null.
    function findHomeBase(lat, lon) {
      if (!REGIONS) return null;
      for (const feature of REGIONS.features) {
        if (isHomeBaseRegion(feature) && pointInPolygon(lat, lon, feature.geometry.coordinates[0])) {
          return regionDisplayName(feature.properties.Name);
        }
      }
      return null;
    }

    // The display name of the region containing the point. Home bases win over any
    // region they overlap.
    function findRegion(lat, lon) {
      if (!REGIONS) return 'Other';
      const base = findHomeBase(lat, lon);
      if (base) return base;
      for (const feature of REGIONS.features) {
        if (pointInPolygon(lat, lon, feature.geometry.coordinates[0])) {
          return regionDisplayName(feature.properties.Name);
        }
      }
      return 'Other';
    }

    function computeCentroid(coords) {
      let sumLat = 0, sumLon = 0;
      for (const c of coords) {
        sumLon += c[0];
        sumLat += c[1];
      }
      return { lat: sumLat / coords.length, lon: sumLon / coords.length };
    }
  `;
}
