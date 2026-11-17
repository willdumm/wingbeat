/**
 * The flights export (Settings → Data → Export flights): effective flights (corrections
 * applied, as the flight store serves them) as rows, then CSV or JSON. No track points:
 * each row is the flight's times, duration, pilot, aircraft, flags and its two ends
 * (coordinates, geocoded or corrected labels, and the GPS elevation and speed there).
 * Times are given both as UTC ISO 8601 and in the operator's timezone.
 */
import type { EffectiveFlight } from './flight-edits';
import { tzAbbrev, unixToTzDateStr, unixToTzTime } from './time';

export interface FlightExportRow {
  id: number;
  tracker_id: number | null;
  tracker_name: string | null;
  date: string;
  start_utc: string;
  end_utc: string | null;
  start_local: string;
  end_local: string | null;
  timezone: string;
  duration_minutes: number | null;
  duration_hours: number | null;
  pilot_id: number | null;
  pilot_name: string | null;
  aircraft_tail: string | null;
  aircraft_name: string | null;
  origin: string | null;
  destination: string | null;
  start_lat: number | null;
  start_lon: number | null;
  start_elevation_ft: number | null;
  start_speed_kt: number | null;
  end_lat: number | null;
  end_lon: number | null;
  end_elevation_ft: number | null;
  end_speed_kt: number | null;
  manual: boolean;
  part91: boolean;
  unpaid: boolean;
  remark: string | null;
}

/** The CSV header, in column order. */
export const FLIGHT_EXPORT_COLUMNS: (keyof FlightExportRow)[] = [
  'id', 'tracker_id', 'tracker_name', 'date', 'start_utc', 'end_utc', 'start_local', 'end_local', 'timezone',
  'duration_minutes', 'duration_hours', 'pilot_id', 'pilot_name', 'aircraft_tail', 'aircraft_name',
  'origin', 'destination', 'start_lat', 'start_lon', 'start_elevation_ft', 'start_speed_kt',
  'end_lat', 'end_lon', 'end_elevation_ft', 'end_speed_kt', 'manual', 'part91', 'unpaid', 'remark',
];

export interface FlightExportOptions {
  /** Only flights starting in [from, to] (operator date keys, YYYY-MM-DD, inclusive); null for no bound. */
  from?: string | null;
  to?: string | null;
  trackers?: { id: number; name?: string | null }[];
  aircraft?: { tail_number: string; name?: string | null }[];
}

// Date.UTC with the seconds as an overflowing field: the epoch in UTC, never the device's zone.
const iso = (unix: number) => new Date(Date.UTC(1970, 0, 1, 0, 0, unix)).toISOString().replace('.000Z', 'Z');
const local = (tz: string, unix: number) =>
  unixToTzDateStr(tz, unix) + ' ' + unixToTzTime(tz, unix) + ' ' + tzAbbrev(tz, unix);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

interface TrackPoint { t: number; v?: number | null; e?: number | null }

// The track point nearest a flight end's time. A corrected start or end time can fall
// inside the track (taxi trimmed off) or beyond it, so this takes the point nearest the
// effective time rather than the first or last point; for an uncorrected flight that is
// the first or last point. None for a manual flight (no points).
function pointNearest(points: TrackPoint[], t: number): TrackPoint | null {
  let best: TrackPoint | null = null;
  for (const p of points) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  return best;
}

// Numbers in the units the clients show (format.ts toFeet and toKnots): whole feet, knots to 0.1.
const feet = (m: unknown) => (typeof m === 'number' && Number.isFinite(m) ? Math.round(m * 3.28084) : null);
const knots = (kmh: unknown) => (typeof kmh === 'number' && Number.isFinite(kmh) ? Math.round(kmh * 5.39957) / 10 : null);

/** The rows of flights (oldest first) that start within the options' date range. */
export function flightExportRows(tz: string, flights: EffectiveFlight[], opts: FlightExportOptions = {}): FlightExportRow[] {
  const trackerNames = new Map((opts.trackers || []).map(t => [t.id, t.name ?? null]));
  const aircraftNames = new Map((opts.aircraft || []).map(a => [a.tail_number, a.name ?? null]));
  const rows: FlightExportRow[] = [];
  for (const f of [...flights].sort((a, b) => a.start_time - b.start_time)) {
    const date = unixToTzDateStr(tz, f.start_time);
    if ((opts.from && date < opts.from) || (opts.to && date > opts.to)) continue;
    const minutes = f.end_time != null ? Math.round((f.end_time - f.start_time) / 60) : null;
    const tail = strOrNull(f.aircraft_tail);
    const points = Array.isArray(f.points) ? (f.points as TrackPoint[]) : [];
    const startPoint = pointNearest(points, f.start_time);
    const endPoint = f.end_time != null ? pointNearest(points, f.end_time) : null;
    rows.push({
      id: f.id,
      tracker_id: f.tracker_id,
      tracker_name: f.tracker_id != null ? trackerNames.get(f.tracker_id) ?? null : null,
      date,
      start_utc: iso(f.start_time),
      end_utc: f.end_time != null ? iso(f.end_time) : null,
      start_local: local(tz, f.start_time),
      end_local: f.end_time != null ? local(tz, f.end_time) : null,
      timezone: tz,
      duration_minutes: minutes,
      duration_hours: minutes != null ? Math.round(minutes / 6) / 10 : null,
      pilot_id: numOrNull(f.pilot_id),
      pilot_name: strOrNull(f.pilot_name),
      aircraft_tail: tail,
      aircraft_name: tail ? aircraftNames.get(tail) ?? null : null,
      origin: strOrNull(f.origin_label),
      destination: strOrNull(f.destination_label),
      start_lat: numOrNull(f.start_lat),
      start_lon: numOrNull(f.start_lon),
      start_elevation_ft: feet(startPoint?.e),
      start_speed_kt: knots(startPoint?.v),
      end_lat: numOrNull(f.end_lat),
      end_lon: numOrNull(f.end_lon),
      end_elevation_ft: feet(endPoint?.e),
      end_speed_kt: knots(endPoint?.v),
      manual: !!f.edit?.manual,
      part91: !!f.edit?.part91,
      unpaid: !!f.edit?.unpaid,
      remark: f.edit?.remark ?? null,
    });
  }
  return rows;
}

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** RFC 4180 CSV (CRLF line ends), header first; empty cells for nulls. */
export function flightsCsv(rows: FlightExportRow[]): string {
  const lines = [FLIGHT_EXPORT_COLUMNS.join(',')];
  for (const r of rows) lines.push(FLIGHT_EXPORT_COLUMNS.map(c => csvCell(r[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}

/** Pretty-printed JSON: { exported_at, timezone, from, to, flights }. */
export function flightsJson(tz: string, now: number, rows: FlightExportRow[], opts: FlightExportOptions = {}): string {
  return JSON.stringify({ exported_at: iso(now), timezone: tz, from: opts.from ?? null, to: opts.to ?? null, flights: rows }, null, 2);
}

/** "flights-2026-01-01-to-2026-11-17.csv", or "flights-all.json" with no range. */
export function flightExportFileName(format: 'csv' | 'json', from?: string | null, to?: string | null): string {
  const range = from || to ? (from || 'start') + '-to-' + (to || 'now') : 'all';
  return 'flights-' + range + '.' + format;
}
