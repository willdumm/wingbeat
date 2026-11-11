/**
 * What the Flights tab shows, from the flight store's effective flights (corrections
 * applied, manual flights added): the list grouped by operator day, newest first (the
 * dashboard's flight list), the date presets and choices of the filter (core's filters),
 * one flight's detail and track, and the assignment edit's choices and request. Times are
 * in the operator's timezone (tz), with its abbreviation, through core's time.
 */
import type { Aircraft } from '@wingbeat/core/api/aircraft';
import type { AssignmentRequest } from '@wingbeat/core/api/corrections';
import type { FlightPoint } from '@wingbeat/core/api/flights';
import type { Pilot } from '@wingbeat/core/api/pilots';
import type { Tracker } from '@wingbeat/core/api/trackers';
import { flightAssignmentRequest } from '@wingbeat/core/corrections';
import {
  FLIGHT_EDIT_FIELD_NAMES, flightFieldEdited, flightOriginalText, flightRemarks,
  type EffectiveFlight, type FlightEditField,
} from '@wingbeat/core/flight-edits';
import type { FilterState } from '@wingbeat/core/filters';
import { fmtTzTime, tzAddDays, tzLongDateLabel, unixToTzDateStr } from '@wingbeat/core/time';

/** An effective flight with the fields the flight store's records carry. */
export type Flight = EffectiveFlight & {
  aircraft_tail?: string | null;
  pilot_id?: number | null;
  pilot_name?: string | null;
  points?: FlightPoint[];
  start_lat?: number | null;
  start_lon?: number | null;
  end_lat?: number | null;
  end_lon?: number | null;
};

export interface FlightRow {
  id: number;
  /** "14:05 AKDT" */
  time: string;
  /** The departure or arrival was corrected (the web's †). */
  timesEdited: boolean;
  /** "(1.2 hr)"; null while the flight is in progress. */
  duration: string | null;
  /** "Kodiak → Larsen Bay"; null when the flight has neither label and isn't manual. */
  route: string | null;
  routeEdited: boolean;
  manual: boolean;
  /** "N123AB · Jane Pilot", with "Unknown Aircraft"/"Unknown Pilot" when the instance has any. */
  assignment: string | null;
  remarks: string[];
}

export interface FlightDay {
  dayKey: string;
  /** "Mon, Oct 3, 2026" */
  title: string;
  data: FlightRow[];
}

/** Whether the instance has aircraft and pilots, which decides whether a missing one reads "Unknown". */
export interface Roster {
  hasAircraft: boolean;
  hasPilots: boolean;
}

function route(f: Flight): string | null {
  const manual = !!f.edit?.manual;
  if (!f.origin_label && !f.destination_label && !manual) return null;
  const dest = f.destination_label || (f.end_time ? '?' : '');
  return (f.origin_label || '?') + ' →' + (dest ? ' ' + dest : '');
}

function assignment(f: Flight, { hasAircraft, hasPilots }: Roster): string | null {
  const parts: string[] = [];
  if (f.aircraft_tail) parts.push(f.aircraft_tail);
  else if (hasAircraft) parts.push('Unknown Aircraft');
  if (f.pilot_name) parts.push(f.pilot_name);
  else if (f.pilot_id != null || hasPilots) parts.push('Unknown Pilot');
  return parts.length ? parts.join(' · ') : null;
}

/** One flight in the list, as the dashboard's buildFlightItem() shows it. */
export function flightRow(tz: string, f: Flight, roster: Roster): FlightRow {
  return {
    id: f.id,
    time: fmtTzTime(tz, f.start_time),
    timesEdited: flightFieldEdited(f, 'start_time') || flightFieldEdited(f, 'end_time'),
    duration: f.end_time ? '(' + ((f.end_time - f.start_time) / 3600).toFixed(1) + ' hr)' : null,
    route: route(f),
    routeEdited: flightFieldEdited(f, 'origin_label') || flightFieldEdited(f, 'destination_label'),
    manual: !!f.edit?.manual,
    assignment: assignment(f, roster),
    remarks: flightRemarks(f),
  };
}

/** flights (sorted by start time, as getAll() returns them) as operator days, newest first. */
export function flightDays(tz: string, flights: Flight[], roster: Roster): FlightDay[] {
  const days: FlightDay[] = [];
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    const dayKey = unixToTzDateStr(tz, f.start_time);
    let day = days.at(-1);
    if (day?.dayKey !== dayKey) days.push(day = { dayKey, title: tzLongDateLabel(dayKey), data: [] });
    day.data.push(flightRow(tz, f, roster));
  }
  return days;
}

// ── The filter ──

export const DATE_PRESETS = [
  { id: 'all', label: 'Any time', days: null },
  { id: 'today', label: 'Today', days: 1 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
] as const;
export type DatePresetId = (typeof DATE_PRESETS)[number]['id'];

/** The operator days a preset covers as of now (Unix seconds): its last `days` days, today included. */
export function presetDateRange(tz: string, now: number, id: DatePresetId): Pick<FilterState, 'dateFrom' | 'dateTo'> {
  const days = DATE_PRESETS.find((p) => p.id === id)?.days ?? null;
  if (days == null) return { dateFrom: null, dateTo: null };
  return { dateFrom: tzAddDays(unixToTzDateStr(tz, now), 1 - days), dateTo: null };
}

/** Whether any filter is set. */
export function isFiltered(s: FilterState): boolean {
  return !!(s.dateFrom || s.dateTo || s.trackerIds.length || s.pilotIds.length || s.aircraftTails.length);
}

export interface FilterChoice<V> {
  value: V;
  label: string;
}

/**
 * What the filter offers, as the web's shared filter section does: the trackers (and
 * "Manual entries" when there are manual flights), the pilots and the aircraft (each with
 * its "none"), the inactive pilots and aircraft too, since old flights have them.
 */
export function filterChoices(
  flights: Flight[],
  { trackers, pilots, aircraft }: { trackers: Pick<Tracker, 'id' | 'name'>[]; pilots: Pick<Pilot, 'id' | 'name'>[]; aircraft: Pick<Aircraft, 'tail_number'>[] },
): { trackers: FilterChoice<FilterState['trackerIds'][number]>[]; pilots: FilterChoice<FilterState['pilotIds'][number]>[]; aircraft: FilterChoice<FilterState['aircraftTails'][number]>[] } {
  return {
    trackers: [
      ...trackers.map((t) => ({ value: t.id, label: t.name })),
      ...(flights.some((f) => f.tracker_id == null) ? [{ value: '__manual__' as const, label: 'Manual entries' }] : []),
    ],
    pilots: [...pilots.map((p) => ({ value: p.id, label: p.name })), { value: '__null__' as const, label: 'No pilot' }],
    aircraft: [...aircraft.map((a) => ({ value: a.tail_number, label: a.tail_number })), { value: '__null__' as const, label: 'No aircraft' }],
  };
}

/** values with value added, or removed if it's there. */
export function toggled<V>(values: V[], value: V): V[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

// ── One flight ──

export interface DetailField {
  label: string;
  value: string;
  /** The tracker's value, when this one is a correction ("Tracker: 08:05"). */
  tracker?: string;
}

/** The detail's fields: date, departure, arrival, duration, origin, destination, aircraft, pilot. */
export function flightDetail(tz: string, f: Flight, roster: Roster): { title: string; fields: DetailField[]; remarks: string[]; manual: boolean } {
  const edited = (field: FlightEditField) => flightFieldEdited(f, field)
    ? { tracker: 'Tracker: ' + flightOriginalText(tz, field, f.edit!.original[field]) }
    : {};
  const fields: DetailField[] = [
    { label: FLIGHT_EDIT_FIELD_NAMES.start_time, value: fmtTzTime(tz, f.start_time), ...edited('start_time') },
    { label: FLIGHT_EDIT_FIELD_NAMES.end_time, value: f.end_time ? fmtTzTime(tz, f.end_time) : 'In progress', ...edited('end_time') },
  ];
  if (f.end_time) fields.push({ label: 'Duration', value: ((f.end_time - f.start_time) / 3600).toFixed(1) + ' hr' });
  fields.push(
    { label: FLIGHT_EDIT_FIELD_NAMES.origin_label, value: f.origin_label || '—', ...edited('origin_label') },
    { label: FLIGHT_EDIT_FIELD_NAMES.destination_label, value: f.destination_label || '—', ...edited('destination_label') },
    { label: 'Aircraft', value: f.aircraft_tail || (roster.hasAircraft ? 'Unknown Aircraft' : '—') },
    { label: 'Pilot', value: f.pilot_name || (f.pilot_id != null || roster.hasPilots ? 'Unknown Pilot' : '—') },
  );
  return {
    title: tzLongDateLabel(unixToTzDateStr(tz, f.start_time)),
    fields,
    remarks: flightRemarks(f),
    manual: !!f.edit?.manual,
  };
}

/**
 * The flight's track as a line, and its start and end as points (a manual flight's
 * named-point coordinates when it has no track), for the detail's map. bounds spans at
 * least MIN_BOUNDS_DEG, so a single point doesn't open at the map's full zoom; it's null
 * when there's nothing to show.
 */
const MIN_BOUNDS_DEG = 0.05;

function bboxOf(coords: [number, number][]): [number, number, number, number] | null {
  if (!coords.length) return null;
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const pad = (lo: number, hi: number) => Math.max(0, (MIN_BOUNDS_DEG - (hi - lo)) / 2);
  const [w, e, s, n] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  return [w - pad(w, e), s - pad(s, n), e + pad(w, e), n + pad(s, n)];
}

export function flightTrack(f: Flight, colors: { track: string; start: string; end: string }): {
  line: GeoJSON.FeatureCollection<GeoJSON.LineString>;
  ends: GeoJSON.FeatureCollection<GeoJSON.Point>;
  bounds: [number, number, number, number] | null;
} {
  const coords: [number, number][] = (f.points ?? []).map((p) => [p.lon, p.lat]);
  const start = coords[0] ?? (f.start_lon != null && f.start_lat != null ? [f.start_lon, f.start_lat] : null);
  const end = coords.at(-1) ?? (f.end_lon != null && f.end_lat != null ? [f.end_lon, f.end_lat] : null);
  const ends = ([[start, colors.start], [f.end_time ? end : null, colors.end]] as const).flatMap(([c, color], i) =>
    c ? [{ type: 'Feature' as const, id: i, geometry: { type: 'Point' as const, coordinates: c }, properties: { color, inFlight: false } }] : []);
  return {
    line: {
      type: 'FeatureCollection',
      features: coords.length >= 2
        ? [{ type: 'Feature', id: f.id, geometry: { type: 'LineString', coordinates: coords }, properties: { color: colors.track } }]
        : [],
    },
    ends: { type: 'FeatureCollection', features: ends },
    bounds: bboxOf(coords.length ? coords : ends.map((e) => e.geometry.coordinates as [number, number])),
  };
}

// ── The assignment edit ──

/**
 * The aircraft and pilots the edit offers: the active ones, plus the flight's own if it's
 * inactive (as the web's flight form does), and "none" (a manual flight always has a pilot).
 */
export function assignmentChoices(
  f: Flight,
  aircraft: Pick<Aircraft, 'tail_number' | 'name' | 'active'>[],
  pilots: Pick<Pilot, 'id' | 'name' | 'active'>[],
): { aircraft: FilterChoice<string | null>[]; pilots: FilterChoice<number | null>[] } {
  return {
    aircraft: [
      { value: null, label: 'Unknown Aircraft' },
      ...aircraft.filter((a) => a.active || a.tail_number === f.aircraft_tail)
        .map((a) => ({ value: a.tail_number, label: a.tail_number + (a.name ? ' – ' + a.name : '') })),
    ],
    pilots: [
      ...(f.edit?.manual ? [] : [{ value: null, label: 'Unknown Pilot' }]),
      ...pilots.filter((p) => p.active || p.id === f.pilot_id).map((p) => ({ value: p.id, label: p.name })),
    ],
  };
}

/** PUT /api/flights/assignment's body for what changed, or null when nothing did. */
export function assignmentRequest(f: Flight, aircraftTail: string | null, pilotId: number | null): AssignmentRequest | null {
  const assign: { aircraft_tail?: string | null; pilot_id?: number | null } = {};
  if (aircraftTail !== (f.aircraft_tail ?? null)) assign.aircraft_tail = aircraftTail;
  if (pilotId !== (f.pilot_id ?? null)) assign.pilot_id = pilotId;
  return Object.keys(assign).length ? flightAssignmentRequest([f], assign) : null;
}
