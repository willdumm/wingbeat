/**
 * Flight corrections (flight_corrections rows) applied to tracked flights, so every client
 * shows the same corrected flights, plus the flight form's reading of its Dep/Arr times.
 * See docs/flight-editor-plan.md.
 *
 * Times are Unix seconds. The functions that show or read a time take the operator's
 * timezone (`tz`) first, as core's `time` does.
 */
import { fmtDuration, tzAddDays, tzLocalToEpoch, unixToTzTime } from './time';
import { MAX_FLIGHT_SECS } from './record-limits';

/** Tracked-flight fields a row can correct (NULL = the tracker's value). */
export const FLIGHT_EDIT_FIELDS = ['start_time', 'end_time', 'origin_label', 'destination_label'] as const;
export type FlightEditField = (typeof FLIGHT_EDIT_FIELDS)[number];

/** Each correctable field's short name, as shown beside a corrected value. */
export const FLIGHT_EDIT_FIELD_NAMES: Record<FlightEditField, string> = {
  start_time: 'Dep', end_time: 'Arr', origin_label: 'Origin', destination_label: 'Dest',
};

/**
 * A GET /api/flight-corrections row. A row with a tracker corrects that tracker's flight
 * starting at flight_start_time (its NULL fields keep the tracker's values); a row without
 * one is a manual flight.
 */
export interface FlightCorrection {
  id: number;
  tracker_id: number | null;
  flight_start_time: number | null;
  start_time: number | null;
  end_time: number | null;
  origin_label: string | null;
  destination_label: string | null;
  start_lat?: number | null;
  start_lon?: number | null;
  end_lat?: number | null;
  end_lon?: number | null;
  part91: number | boolean;
  unpaid: number | boolean;
  excluded: number | boolean;
  remark: string | null;
  pilot_id: number | null;
  aircraft_tail: string | null;
  updated_at?: number | null;
}

/** A flight as the flight store holds it (more fields pass through untouched). */
export interface FlightRecord {
  id: number;
  tracker_id: number | null;
  start_time: number;
  end_time: number | null;
  origin_label?: string | null;
  destination_label?: string | null;
  modified_at?: number | null;
  [key: string]: unknown;
}

/** What a correction did to a flight; original holds the tracker's value of each corrected field. */
export interface FlightEdit {
  entry: FlightCorrection;
  manual: boolean;
  part91: boolean;
  unpaid: boolean;
  remark: string | null;
  excluded: boolean;
  original: Partial<Record<FlightEditField, unknown>>;
}

/** A flight with its correction applied (edit null when it has none). */
export type EffectiveFlight<F extends FlightRecord = FlightRecord> = F & { edit?: FlightEdit | null };

export interface ApplyFlightEditsOptions {
  /** Keep removed (excluded) flights, with edit.excluded set. */
  includeRemoved?: boolean;
  /** For a manual flight's pilot_name. */
  pilots?: { id: number; name: string }[];
  /** The trackers whose flights the caller fetched (see applyFlightEdits()). */
  knownTrackerIds?: Iterable<number> | null;
}

/**
 * Applies entries (GET /api/flight-corrections rows) to flights (flight store records)
 * and returns { flights, unmatched, unplaced }, flights sorted by (corrected) start time.
 *
 * A corrected flight is a copy of the record with the row's non-NULL fields applied and
 * edit: { entry, manual, part91, unpaid, remark, excluded, original: { field: tracker's
 * value } }; an untouched one is the record itself, with edit null. A removed (excluded)
 * flight is left out unless includeRemoved. A manual flight (a row with no tracker) gets
 * id -entry.id, tracker_id null, points [], its named-point coordinates and its own
 * pilot/aircraft; pilot_name comes from pilots.
 *
 * unmatched lists rows whose flight is gone (a history import moved its first point, or
 * the tracker's points were wiped) for a tracker whose flights are loaded: one in flights
 * or in knownTrackerIds (the trackers the caller fetched, so a tracker left with no
 * flights still counts). They're shown for deletion and never applied. unplaced lists the
 * other unapplied rows, for trackers whose flights aren't loaded at all (deleted or
 * inactive ones).
 */
export function applyFlightEdits<F extends FlightRecord>(
  flights: F[],
  entries: FlightCorrection[] | null | undefined,
  { includeRemoved = false, pilots = [], knownTrackerIds = null }: ApplyFlightEditsOptions = {},
): { flights: EffectiveFlight[]; unmatched: FlightCorrection[]; unplaced: FlightCorrection[] } {
  const key = (trackerId: number | null, start: number | null) => trackerId + ':' + start;
  const byKey = new Map<string, FlightCorrection>();
  for (const e of entries || []) if (e.tracker_id != null) byKey.set(key(e.tracker_id, e.flight_start_time), e);
  const trackers = new Set<number | null>(knownTrackerIds || []);
  const matched = new Set<FlightCorrection>();
  const out: EffectiveFlight[] = [];

  for (const f of flights) {
    trackers.add(f.tracker_id);
    const e = byKey.get(key(f.tracker_id, f.start_time));
    if (!e) { out.push(f); continue; }
    matched.add(e);
    if (e.excluded && !includeRemoved) continue;
    const eff: EffectiveFlight = {
      ...f,
      // Bumped by an edit too, so anything that redraws on a changed flight notices.
      modified_at: Math.max(f.modified_at ?? 0, e.updated_at ?? 0),
      edit: { entry: e, manual: false, part91: !!e.part91, unpaid: !!e.unpaid, remark: e.remark || null, excluded: !!e.excluded, original: {} },
    };
    for (const field of FLIGHT_EDIT_FIELDS) {
      if (e[field] != null) { eff.edit!.original[field] = f[field]; (eff as Record<string, unknown>)[field] = e[field]; }
    }
    out.push(eff);
  }

  const pilotName = (id: number | null) => pilots.find(p => p.id === id)?.name || null;
  for (const e of entries || []) {
    if (e.tracker_id != null || (e.excluded && !includeRemoved)) continue;
    out.push({
      id: -e.id, tracker_id: null,
      start_time: e.start_time!, end_time: e.end_time!, modified_at: e.updated_at ?? 0,
      origin_label: e.origin_label, destination_label: e.destination_label,
      start_lat: e.start_lat, start_lon: e.start_lon, end_lat: e.end_lat, end_lon: e.end_lon,
      aircraft_tail: e.aircraft_tail, pilot_id: e.pilot_id, pilot_name: pilotName(e.pilot_id),
      points: [],
      edit: { entry: e, manual: true, part91: !!e.part91, unpaid: !!e.unpaid, remark: e.remark || null, excluded: !!e.excluded, original: {} },
    });
  }
  out.sort((a, b) => a.start_time - b.start_time);

  const unapplied = (entries || []).filter(e => e.tracker_id != null && !matched.has(e));
  return {
    flights: out,
    unmatched: unapplied.filter(e => trackers.has(e.tracker_id)),
    unplaced: unapplied.filter(e => !trackers.has(e.tracker_id)),
  };
}

/**
 * The remarks shown under a flight, in order: "Part 91" or "Part 91 (unpaid)" (nothing for
 * Part 135), then its free-text remark. Empty for most flights.
 */
export function flightRemarks(f: { edit?: FlightEdit | null }): string[] {
  const out: string[] = [];
  if (f.edit && f.edit.part91) out.push(f.edit.unpaid ? 'Part 91 (unpaid)' : 'Part 91');
  if (f.edit && f.edit.remark) out.push(f.edit.remark);
  return out;
}

/** Whether field of an effective flight was corrected from the tracker's value. */
export function flightFieldEdited(f: { edit?: FlightEdit | null }, field: FlightEditField): boolean {
  return !!(f.edit && field in f.edit.original);
}

/** What a row would change, e.g. "Dep 08:05, Part 91" (for unmatched rows). */
export function flightEntrySummary(tz: string, e: FlightCorrection): string {
  const parts: string[] = [];
  if (e.start_time != null) parts.push('Dep ' + unixToTzTime(tz, e.start_time));
  if (e.end_time != null) parts.push('Arr ' + unixToTzTime(tz, e.end_time));
  if (e.origin_label != null) parts.push('Origin ' + e.origin_label);
  if (e.destination_label != null) parts.push('Dest ' + e.destination_label);
  if (e.part91) parts.push(e.unpaid ? 'Part 91 (unpaid)' : 'Part 91');
  if (e.remark) parts.push('Remark “' + e.remark + '”');
  if (e.excluded) parts.push('removed');
  return parts.join(', ') || 'no corrections';
}

/** The tracker's value of a corrected field, as shown beside the correction. */
export function flightOriginalText(tz: string, field: FlightEditField, value: unknown): string {
  if (value == null || value === '') return '(none)';
  return field === 'start_time' || field === 'end_time' ? unixToTzTime(tz, value as number) : String(value);
}

/**
 * The flight form saves a flight longer than this only once confirmed, and never one
 * longer than the server's limit (FLIGHT_MAX_SECS, record-limits.ts).
 */
export const FLIGHT_CONFIRM_SECS = 12 * 3600;
export const FLIGHT_MAX_SECS = MAX_FLIGHT_SECS;

export interface FlightFormTimes {
  start_time: number;
  end_time: number;
  secs: number;
  /** The arrival is on the day after the departure. */
  nextDay: boolean;
  /** Over FLIGHT_CONFIRM_SECS: ask first. */
  long: boolean;
  /** Over FLIGHT_MAX_SECS: refuse. */
  tooLong: boolean;
  /** The form's line under the times; '' for a same-day arrival. */
  hint: string;
}

/**
 * The flight form's date and Dep/Arr times (YYYY-MM-DD, HH:MM, HH:MM) as a flight, in the
 * operator's timezone: an arrival before the departure is the next day.
 */
export function flightFormTimes(tz: string, dateKey: string, dep: string, arr: string): FlightFormTimes {
  const nextDay = arr < dep;
  const start_time = tzLocalToEpoch(tz, dateKey, dep);
  const end_time = tzLocalToEpoch(tz, nextDay ? tzAddDays(dateKey, 1) : dateKey, arr);
  const secs = end_time - start_time;
  return {
    start_time, end_time, secs, nextDay,
    long: secs > FLIGHT_CONFIRM_SECS,
    tooLong: secs > FLIGHT_MAX_SECS,
    hint: nextDay ? 'Arrives the next day, ' + fmtDuration(secs) + ' after departure.' : '',
  };
}

/**
 * The corrected times a tracked flight's form saves, from the form's times t
 * (flightFormTimes()) and the tracker's flight orig, each null where it's the tracker's.
 * Times compare to the minute, since the form has no seconds. Dep left alone and Arr set
 * to the same minute (a flight under a minute) would put the arrival at the minute's
 * start, before the tracker's departure (10:05 against 10:05:40), which the server
 * refuses: it lands at the departure instead.
 */
export function flightTrackedTimes(
  t: { start_time: number; end_time: number },
  orig: { start_time: number; end_time: number },
): { start_time: number | null; end_time: number | null } {
  const sameMinute = (a: number, b: number) => Math.floor(a / 60) === Math.floor(b / 60);
  const start_time = sameMinute(t.start_time, orig.start_time) ? null : t.start_time;
  let end_time = sameMinute(t.end_time, orig.end_time) ? null : t.end_time;
  if (start_time == null && end_time != null && end_time < orig.start_time) end_time = orig.start_time;
  return { start_time, end_time };
}
