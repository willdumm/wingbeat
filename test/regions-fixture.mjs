// Regions and points for the core regions, accounting and analytics tests: a home base
// inside the region it overlaps, another region, a second home base, and a point in none.

// [lon, lat] rings (GeoJSON order).
export const box = (lon0, lat0, lon1, lat1) => [[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]];
const region = (Name, ring) => ({ type: 'Feature', properties: { Name }, geometry: { type: 'Polygon', coordinates: [ring] } });
export const REGIONS = {
  type: 'FeatureCollection',
  features: [
    region('Kodiak Spine', box(-153, 57.5, -152, 58.2)),
    region('Kodiak (Base)', box(-152.6, 57.7, -152.2, 57.9)),
    region('Katmai', box(-155.5, 58, -154.5, 59)),
    region('Homer (base) ', box(-151.8, 59.5, -151.3, 59.8)),
  ],
};
export const KODIAK = [57.79, -152.4];
export const SPINE = [57.6, -152.9];
export const KATMAI = [58.5, -155];
export const AWAY = [61.2, -149.9];
