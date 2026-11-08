/**
 * Geography shared by the Worker (segmentation, geocoding, the poller) and the analytics
 * page: distances, the flight speed threshold, and which region (or home base) a point is
 * in, so a flight's region can't differ between server and client.
 *
 * The region functions take the regions (the `/api/regions` GeoJSON, or null before it's
 * loaded) as a parameter.
 */

/** Speed threshold (km/h) that distinguishes flight from ground movement. ≈ 20 knots. */
export const SPEED_THRESHOLD_KMH = 37;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineKm(lat1, lon1, lat2, lon2) * 0.621371;
}

/** A polygon ring: [lon, lat] pairs (GeoJSON order). */
export type Ring = [number, number][];

/** One region of `/api/regions`: a polygon, its outer ring first. */
export interface RegionFeature {
  properties: { Name?: string | null; id?: number };
  geometry: { coordinates: Ring[] };
}

/** The `/api/regions` FeatureCollection, or null before it's loaded. */
export type Regions = { features: RegionFeature[] } | null;

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(lat: number, lon: number, coords: Ring): boolean {
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

/** The mean of a ring's vertices. */
export function computeCentroid(coords: Ring): { lat: number; lon: number } {
  let sumLat = 0, sumLon = 0;
  for (const c of coords) {
    sumLon += c[0];
    sumLat += c[1];
  }
  return { lat: sumLat / coords.length, lon: sumLon / coords.length };
}

// A region named "… (Base)" is a home base: accounting leaves out time spent flying to
// and from it, and counts stops there separately. The marker is dropped wherever the
// name is shown (except the regions editor, which edits the stored name).
const HOME_BASE_MARKER = /\s*\(base\)\s*$/i;

export function isHomeBaseRegion(feature: RegionFeature): boolean {
  return HOME_BASE_MARKER.test(feature.properties.Name || '');
}

export function regionDisplayName(name: string | null | undefined): string {
  return (name || '').replace(HOME_BASE_MARKER, '');
}

/** Display names of the home base regions, sorted. */
export function homeBaseNames(regions: Regions): string[] {
  if (!regions) return [];
  return regions.features.filter(isHomeBaseRegion).map(f => regionDisplayName(f.properties.Name)).sort();
}

/** The display name of the home base region containing the point, or null. */
export function findHomeBase(regions: Regions, lat: number | null | undefined, lon: number | null | undefined): string | null {
  if (!regions || lat == null || lon == null) return null;
  for (const feature of regions.features) {
    if (isHomeBaseRegion(feature) && pointInPolygon(lat, lon, feature.geometry.coordinates[0])) {
      return regionDisplayName(feature.properties.Name);
    }
  }
  return null;
}

/** A manual flight's endpoint with no named point picked has no coordinates. */
export const UNKNOWN_LOCATION = 'Unknown location';

/** A point in no region (or any point before the regions are loaded). */
export const OTHER_REGION = 'Other';

/**
 * The display name of the region containing the point. Home bases win over any region
 * they overlap.
 */
export function findRegion(regions: Regions, lat: number | null | undefined, lon: number | null | undefined): string {
  if (lat == null || lon == null) return UNKNOWN_LOCATION;
  if (!regions) return OTHER_REGION;
  const base = findHomeBase(regions, lat, lon);
  if (base) return base;
  for (const feature of regions.features) {
    if (pointInPolygon(lat, lon, feature.geometry.coordinates[0])) {
      return regionDisplayName(feature.properties.Name);
    }
  }
  return OTHER_REGION;
}
