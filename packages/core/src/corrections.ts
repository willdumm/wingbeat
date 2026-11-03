/**
 * The request side of the flight editor (src/shared/flight-editor.ts): which flight a
 * correction names, the bodies of the bulk aircraft/pilot and flag changes, and the flight
 * form's validation, from the fields as typed to an error or the save's request body. The
 * requests themselves go through api/corrections.ts.
 */
import { flightFormTimes, flightTrackedTimes, FLIGHT_MAX_SECS } from './flight-edits';
import type { EffectiveFlight, FlightFormTimes } from './flight-edits';
import type { AssignmentRequest, BulkFlagsRequest, CorrectionRequest, FlightRef } from './api/corrections-requests';

/**
 * The bulk route's key for a flight: its tracker's original start time, or its row. A
 * tracked flight's corrections are keyed by the start time the tracker recorded, so a
 * corrected start time doesn't change which flight they belong to.
 */
export function flightRef(f: EffectiveFlight): FlightRef {
  if (f.tracker_id == null) return { entry_id: f.edit!.entry.id };
  const start = f.edit && 'start_time' in f.edit.original ? f.edit.original.start_time as number : f.start_time;
  return { tracker_id: f.tracker_id, flight_start_time: start };
}

/** Aircraft/pilot for tracked flights (by id) and manual flights (by row) in one request. */
export function flightAssignmentRequest(
  flights: EffectiveFlight[],
  assign: { aircraft_tail?: string | null; pilot_id?: number | null },
): AssignmentRequest {
  const tracked = flights.filter(f => f.tracker_id != null);
  const manual = flights.filter(f => f.tracker_id == null);
  return { flight_ids: tracked.map(f => f.id), entry_ids: manual.map(f => f.edit!.entry.id), ...assign };
}

/** Part 91 and/or removed on many flights at once. */
export function flightFlagsRequest(
  flights: EffectiveFlight[],
  set: { part91?: boolean; excluded?: boolean },
): BulkFlagsRequest {
  return { flights: flights.map(flightRef), set };
}

/** The flight form's fields, as its inputs hold them. */
export interface FlightFormFields {
  date: string;
  dep: string;
  arr: string;
  origin: string;
  dest: string;
  /** A tail number, or '' for unknown. */
  aircraft: string;
  /** A pilot id, or '' for unknown (tracked) or not chosen (manual). */
  pilot: string;
  part: '135' | '91';
  pay: 'paid' | 'unpaid';
  remark: string;
}

/** The tracker's own values of a tracked flight (the effective flight with its corrections undone). */
export interface TrackerOriginal {
  tracker_id: number;
  start_time: number;
  end_time: number;
  origin_label?: string | null;
  destination_label?: string | null;
  aircraft_tail?: string | null;
  pilot_id?: number | null;
}

/** What the form is editing: a tracked flight (orig), or a manual flight (a new one when entryId is null). */
export type FlightFormTarget =
  | { tracked: true; orig: TrackerOriginal }
  | { tracked: false; entryId: number | null };

/** The form's values, read. */
export interface FlightFormValues {
  start_time: number;
  end_time: number;
  origin_label: string | null;
  destination_label: string | null;
  aircraft_tail: string | null;
  pilot_id: number | null;
  part91: boolean;
  unpaid: boolean;
  remark: string | null;
}

/**
 * The Date, Dep and Arr fields as flightFormTimes() reads them (an arrival before the
 * departure is the next day), or null while one is empty.
 */
export function flightFormTimesOf(tz: string, fields: Pick<FlightFormFields, 'date' | 'dep' | 'arr'>): FlightFormTimes | null {
  const { date, dep, arr } = fields;
  return date && dep && arr ? flightFormTimes(tz, date, dep, arr) : null;
}

/**
 * Whether the form's times t change the flight's: always for a manual flight; for a
 * tracked one, not when they're the tracker's to the minute (flightTrackedTimes()), so a
 * tracker's own overlong flight can still take a remark or Part 91, as the server allows.
 */
export function flightTimesChanged(t: FlightFormTimes, target: FlightFormTarget): boolean {
  if (!target.tracked) return true;
  const c = flightTrackedTimes(t, target.orig);
  return c.start_time != null || c.end_time != null;
}

/** The form's state as epochs/labels, or an error message. */
export function readFlightForm(tz: string, fields: FlightFormFields, target: FlightFormTarget): FlightFormValues | string {
  const t = flightFormTimesOf(tz, fields);
  if (!t) return 'Enter the date, departure and arrival times.';
  // A manual flight needs an arrival after its departure; a tracked one can land in the
  // minute it took off (a flight under a minute), and then saving it mustn't turn into a
  // 24-hour correction.
  if (t.secs === 0 && !target.tracked) return 'The arrival time is the same as the departure.';
  if (t.tooLong && flightTimesChanged(t, target)) {
    return 'A flight can’t be longer than ' + FLIGHT_MAX_SECS / 3600 + ' hours. Check the departure and arrival times ' +
      '(an arrival before the departure is the next day).';
  }
  return {
    start_time: t.start_time, end_time: t.end_time,
    origin_label: fields.origin.trim() || null,
    destination_label: fields.dest.trim() || null,
    aircraft_tail: fields.aircraft || null,
    pilot_id: fields.pilot ? parseInt(fields.pilot, 10) : null,
    part91: fields.part === '91',
    unpaid: fields.part === '91' && fields.pay === 'unpaid',
    remark: fields.remark.trim() || null,
  };
}

export interface FlightSaveOptions {
  /** Whether the flight is removed (kept as it is by the save). */
  removed: boolean;
  /** The store's history id the form's flight is as of (see "Edit conflicts" in src/index.ts). */
  baseHistoryId: number;
  /** A label's named-point coordinates (manual flights), or nulls. */
  coords: (label: string | null) => [number | null, number | null];
}

/**
 * The save's request from the form's values v (readFlightForm()): a manual flight's whole
 * row (entryId set: PUT /api/flight-corrections/:id, else POST), or a tracked flight's
 * correction (POST), or an error message.
 */
export function flightSaveRequest(v: FlightFormValues, target: FlightFormTarget, { removed, baseHistoryId, coords }: FlightSaveOptions):
  { entryId: number | null; body: CorrectionRequest } | string {
  if (!target.tracked) {
    if (v.pilot_id == null) return 'Choose a pilot.';
    const [startLat, startLon] = coords(v.origin_label);
    const [endLat, endLon] = coords(v.destination_label);
    const body = { ...v, excluded: removed, start_lat: startLat, start_lon: startLon, end_lat: endLat, end_lon: endLon };
    return target.entryId != null
      ? { entryId: target.entryId, body: { ...body, base_history_id: baseHistoryId } }
      : { entryId: null, body };
  }
  // Only what differs from the tracker is stored (the server drops a row left empty);
  // times compare to the minute (flightTrackedTimes()). The aircraft/pilot change goes in
  // the same request, so the server writes it with the correction in one batch.
  const { orig } = target;
  const times = flightTrackedTimes(v, orig);
  const assign: { aircraft_tail?: string | null; pilot_id?: number | null } = {};
  if (v.aircraft_tail !== (orig.aircraft_tail || null)) assign.aircraft_tail = v.aircraft_tail;
  if (v.pilot_id !== (orig.pilot_id ?? null)) assign.pilot_id = v.pilot_id;
  return {
    entryId: null,
    body: {
      tracker_id: orig.tracker_id, flight_start_time: orig.start_time,
      start_time: times.start_time, end_time: times.end_time,
      origin_label: v.origin_label === (orig.origin_label || null) ? null : v.origin_label,
      destination_label: v.destination_label === (orig.destination_label || null) ? null : v.destination_label,
      part91: v.part91, unpaid: v.unpaid, remark: v.remark, excluded: removed,
      assign: Object.keys(assign).length ? assign : undefined,
      base_history_id: baseHistoryId,
    },
  };
}
