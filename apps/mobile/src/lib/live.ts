/**
 * What the Live tab shows, from the flight store and the last refresh: one status card per
 * active tracker (what the dashboard's buildAircraftCard() shows), each tracker's position,
 * and the track of each flight in progress; or a day's flights at once (dayMap). Colors are
 * core's trackerColor(), or the caller's faint color for a tracker without one.
 */
import type { InstanceSettings } from '@wingbeat/core/api/bootstrap';
import type { TrackedFlight } from '@wingbeat/core/api/flights';
import { toFeet, toKnots } from '@wingbeat/core/format';
import { dayFlightNumbers, isGpsFresh, isInFlight, trackerColor, type LiveData } from '@wingbeat/core/live';
import { SPEED_THRESHOLD_KMH } from '@wingbeat/core/regions';
import { relativeTime, tzLongDateLabel, unixToTzDateStr } from '@wingbeat/core/time';
import type { Flight } from './flights';

export interface LiveTracker {
  id: number;
  name: string;
  assigned_aircraft: string | null;
}

export interface StatusCard {
  trackerId: number;
  /** The tracker's aircraft, else its name. */
  label: string;
  color: string;
  inFlight: boolean;
  /** "GPS 5 min ago", from its newest point of any kind; null before its first point. */
  gps: string | null;
  gpsFresh: boolean;
  /** Altitude and speed while in flight ("1,200 ft · 95.0 kt"); null otherwise. */
  metrics: string | null;
  location: string | null;
  /** [lon, lat]; null before its first point. */
  position: [number, number] | null;
}

export function statusCards(
  trackers: LiveTracker[],
  live: Record<number, LiveData>,
  now: number,
  fallbackColor: string,
): StatusCard[] {
  return trackers.map((t) => {
    const d = live[t.id];
    const inFlight = isInFlight(SPEED_THRESHOLD_KMH, d);
    const gpsTime = d ? (d.last_point_time ?? d.garmin_time) : null;
    const metrics = inFlight && d
      ? [d.elevation_m != null ? toFeet(d.elevation_m) : null, d.velocity_kmh != null ? toKnots(d.velocity_kmh) : null]
          .filter((s) => s !== null).join(' · ') || null
      : null;
    return {
      trackerId: t.id,
      label: t.assigned_aircraft || t.name,
      color: trackerColor(trackers, t.id) ?? fallbackColor,
      inFlight,
      gps: gpsTime ? 'GPS ' + relativeTime(now, gpsTime) : null,
      gpsFresh: gpsTime ? isGpsFresh(now, gpsTime) : false,
      metrics,
      location: d?.location_label ?? null,
      position: d ? [d.lon, d.lat] : null,
    };
  });
}

/** The cards' positions as map points (color, inFlight and course for the layers' styles). */
export function positionFeatures(cards: StatusCard[], live: Record<number, LiveData>): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: cards.flatMap((c) => c.position ? [{
      type: 'Feature' as const,
      id: c.trackerId,
      geometry: { type: 'Point' as const, coordinates: c.position },
      properties: { color: c.color, inFlight: c.inFlight, course: live[c.trackerId]?.course_deg ?? 0 },
    }] : []),
  };
}

/**
 * The track so far of each tracker in flight: its latest flight's points (the tracker's own
 * records, as positions are). getRaw is the flight store's.
 */
export function inFlightTracks(
  cards: StatusCard[],
  getRaw: (trackerIds: number[]) => TrackedFlight[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: cards.flatMap((c) => {
      if (!c.inFlight) return [];
      const latest = getRaw([c.trackerId]).at(-1);
      if (!latest || latest.points.length < 2) return [];
      return [{
        type: 'Feature' as const,
        id: c.trackerId,
        geometry: { type: 'LineString' as const, coordinates: latest.points.map((p) => [p.lon, p.lat]) },
        properties: { color: c.color },
      }];
    }),
  };
}

/** Where the map opens: the instance's default view, else the first position, else the world. */
export function initialView(
  instance: InstanceSettings | undefined,
  cards: StatusCard[],
): { center: [number, number]; zoom: number } {
  if (instance) return { center: [instance.map_default_lng, instance.map_default_lat], zoom: instance.map_default_zoom };
  const first = cards.find((c) => c.position)?.position;
  return first ? { center: first, zoom: 8 } : { center: [0, 20], zoom: 1 };
}

// ── A day's flights (the dashboard's "Map all") ──

export interface MapDay {
  dayKey: string;
  /** "Mon, Oct 3, 2026" */
  title: string;
  /** Its flights with a track. */
  count: number;
}

/** The operator days with a flight that has a track, newest first. flights: getAll()'s (chronological). */
export function mapDays(tz: string, flights: Flight[]): MapDay[] {
  const days: MapDay[] = [];
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    if (!f.points?.length) continue;
    const dayKey = unixToTzDateStr(tz, f.start_time);
    const day = days.at(-1);
    if (day?.dayKey === dayKey) day.count++;
    else days.push({ dayKey, title: tzLongDateLabel(dayKey), count: 1 });
  }
  return days;
}

export interface DayMap {
  tracks: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  /** Each flight's start, and its numbered end (`label`) unless it's in progress. */
  points: GeoJSON.FeatureCollection<GeoJSON.Point>;
  /** The trackers, when there are several (the web's legend). */
  legend: { label: string; color: string }[];
  /** [west, south, east, north]; null when no flight has a track. */
  bounds: [number, number, number, number] | null;
}

/**
 * A day's flights drawn at once, as the dashboard's day view does: each track in its
 * tracker's color, a dot at its start and its number (core's dayFlightNumbers) at its end.
 * flights: getAll()'s (chronological); inProgress(f): whether f is still in the air.
 */
export function dayMap(
  tz: string,
  dayKey: string,
  flights: Flight[],
  { colorFor, labelFor, inProgress }: {
    colorFor: (trackerId: number | null) => string;
    labelFor: (trackerId: number | null) => string;
    inProgress: (f: Flight) => boolean;
  },
): DayMap {
  const day = flights.filter((f) => unixToTzDateStr(tz, f.start_time) === dayKey);
  const numbers = dayFlightNumbers(day);
  const tracks: DayMap['tracks']['features'] = [];
  const points: DayMap['points']['features'] = [];
  const all: [number, number][] = [];
  day.forEach((f, i) => {
    const n = numbers[i];
    if (n == null) return;
    const coords = f.points!.map((p) => [p.lon, p.lat] as [number, number]);
    const color = colorFor(f.tracker_id);
    all.push(...coords);
    tracks.push({ type: 'Feature', id: f.id, geometry: { type: 'LineString', coordinates: coords }, properties: { color } });
    points.push({ type: 'Feature', id: 'start-' + f.id, geometry: { type: 'Point', coordinates: coords[0] }, properties: { color, inFlight: false } });
    if (!inProgress(f)) {
      points.push({ type: 'Feature', id: 'end-' + f.id, geometry: { type: 'Point', coordinates: coords.at(-1)! }, properties: { color, inFlight: false, label: String(n) } });
    }
  });
  const trackerIds = [...new Set(day.filter((_, i) => numbers[i] != null).map((f) => f.tracker_id))];
  const lons = all.map((c) => c[0]);
  const lats = all.map((c) => c[1]);
  return {
    tracks: { type: 'FeatureCollection', features: tracks },
    points: { type: 'FeatureCollection', features: points },
    legend: trackerIds.length > 1 ? trackerIds.map((id) => ({ label: labelFor(id), color: colorFor(id) })) : [],
    bounds: all.length ? [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] : null,
  };
}

/**
 * A day key ("2026-10-03") as a device-local Date at noon, for a native date picker (which
 * picks calendar days in the device's zone; noon keeps clear of DST shifts), and back.
 */
export function dayKeyToDate(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function dateToDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
