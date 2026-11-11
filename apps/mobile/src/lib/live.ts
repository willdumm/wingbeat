/**
 * What the Live tab shows, from the flight store and the last refresh: one status card per
 * active tracker (what the dashboard's buildAircraftCard() shows), each tracker's position,
 * and the track of each flight in progress. Colors are core's trackerColor(), or the
 * caller's faint color for a tracker without one.
 */
import type { InstanceSettings } from '@wingbeat/core/api/bootstrap';
import type { TrackedFlight } from '@wingbeat/core/api/flights';
import { toFeet, toKnots } from '@wingbeat/core/format';
import { isGpsFresh, isInFlight, trackerColor, type LiveData } from '@wingbeat/core/live';
import { SPEED_THRESHOLD_KMH } from '@wingbeat/core/regions';
import { relativeTime } from '@wingbeat/core/time';

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
