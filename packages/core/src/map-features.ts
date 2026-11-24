/**
 * What both clients' maps draw, as GeoJSON for map-layers.ts's layers: flights' tracks with
 * their start and end dots, a day's flights with their numbers, ground trails, and the bounds
 * the map fits. Coordinates are [lon, lat].
 */
import { dayFlightNumbers, type GroundTrail } from './live';

export type LngLat = [number, number];
/** [west, south, east, north], as MapLibre takes it. */
export type Bounds = [number, number, number, number];

export interface MapFeature<G extends 'LineString' | 'Point', P = Record<string, unknown>> {
  type: 'Feature';
  id?: string | number;
  geometry: { type: G; coordinates: G extends 'Point' ? LngLat : LngLat[] };
  properties: P;
}

interface Position { lat: number; lon: number }

/** A position as GeoJSON has it. */
export const lngLat = (p: Position): LngLat => [p.lon, p.lat];

const withId = (id?: string | number) => (id === undefined ? {} : { id });

export function lineFeature<P>(points: readonly Position[], properties: P, id?: string | number): MapFeature<'LineString', P> {
  return { type: 'Feature', ...withId(id), geometry: { type: 'LineString', coordinates: points.map(lngLat) }, properties };
}

export function pointFeature<P>(p: Position, properties: P, id?: string | number): MapFeature<'Point', P> {
  return { type: 'Feature', ...withId(id), geometry: { type: 'Point', coordinates: lngLat(p) }, properties };
}

/** The bounds of coords; null when there are none. A loop: a long track's spread passes Hermes' argument limit. */
export function lngLatBounds(coords: readonly LngLat[]): Bounds | null {
  if (!coords.length) return null;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of coords) {
    w = Math.min(w, lon); e = Math.max(e, lon);
    s = Math.min(s, lat); n = Math.max(n, lat);
  }
  return [w, s, e, n];
}

/**
 * The instance's default view. map_default_zoom is stored on the 256 px tile scale: MapLibre's
 * zoom (512 px tiles) is one less.
 */
export function defaultMapView(view: { lat: number; lng: number; zoom: number }): { center: LngLat; zoom: number } {
  return { center: [view.lng, view.lat], zoom: view.zoom - 1 };
}

/** One flight's track: its line (none with under two points), and a dot at its start and (with an end color) its end. */
export function flightTrackFeatures(
  points: readonly Position[],
  colors: { track: string; start: string; end?: string | null },
  id?: string | number,
): { lines: MapFeature<'LineString', { color: string }>[]; dots: MapFeature<'Point', { color: string }>[] } {
  return {
    lines: points.length >= 2 ? [lineFeature(points, { color: colors.track }, id)] : [],
    dots: [
      ...(points.length ? [pointFeature(points[0], { color: colors.start }, 'start')] : []),
      ...(points.length && colors.end ? [pointFeature(points[points.length - 1], { color: colors.end }, 'end')] : []),
    ],
  };
}

type DayFlight = { id: number; tracker_id: number | null; points?: readonly Position[] | null };

/** A day's flight as drawn: its number, its tracker's color, and whether it has an end to number yet. */
export interface DayTrack<F extends DayFlight> {
  flight: F;
  n: number;
  color: string;
  inProgress: boolean;
}

/**
 * A day's flights (in chronological order) drawn at once: each track in its tracker's color
 * with a dot at its start, and the flights drawn with their numbers (dayFlightNumbers), for the
 * end markers. trackerIds: every tracker with a track that day. The trackers in hidden (null:
 * manual flights) aren't drawn, but their flights keep their numbers.
 */
export function dayTrackFeatures<F extends DayFlight>(
  flights: readonly F[],
  { colorFor, inProgress, hidden = [] }: {
    colorFor: (trackerId: number | null) => string;
    inProgress: (f: F) => boolean;
    hidden?: readonly (number | null)[];
  },
): {
  lines: MapFeature<'LineString', { color: string }>[];
  starts: MapFeature<'Point', { color: string }>[];
  drawn: DayTrack<F>[];
  trackerIds: (number | null)[];
} {
  const numbers = dayFlightNumbers(flights);
  const lines: MapFeature<'LineString', { color: string }>[] = [];
  const starts: MapFeature<'Point', { color: string }>[] = [];
  const drawn: DayTrack<F>[] = [];
  const trackerIds = new Set<number | null>();
  flights.forEach((flight, i) => {
    const n = numbers[i];
    if (n == null || !flight.points?.length) return;
    trackerIds.add(flight.tracker_id);
    if (hidden.includes(flight.tracker_id)) return;
    const color = colorFor(flight.tracker_id);
    const track = flightTrackFeatures(flight.points, { track: color, start: color }, flight.id);
    lines.push(...track.lines);
    starts.push({ ...track.dots[0], id: 'start-' + flight.id });
    drawn.push({ flight, n, color, inProgress: inProgress(flight) });
  });
  return { lines, starts, drawn, trackerIds: [...trackerIds] };
}

/** A ground trail: its dotted line (`trail`) and its pilot's hollow dot (`pilot`). */
export function groundTrailFeatures(
  trail: GroundTrail,
  color: string,
  trackerId: number | string,
): { line: MapFeature<'LineString', { color: string; trail: true }>; pilot: MapFeature<'Point', { color: string; pilot: true }> } {
  return {
    line: lineFeature(trail.line, { color, trail: true as const }, 'trail-' + trackerId),
    pilot: pointFeature(trail.pilot, { color, pilot: true as const }, 'pilot-' + trackerId),
  };
}
