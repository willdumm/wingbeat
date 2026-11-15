/**
 * What the Duty tab shows, from core's computeDutyData (the web's duty log, a pilot's month
 * under §135.267): the totals as meters, the days planned after today, and the month's days
 * newest first, each with its duty or rest, its flights (as the flight list's rows), the
 * corrections whose flight is gone, and its warnings. Times are in the operator's timezone
 * (tz), through core's time.
 */
import type { DutyDaysRequest, DutyLogResponse } from '@wingbeat/core/api/duty';
import type { Pilot } from '@wingbeat/core/api/pilots';
import {
  computeDutyData, dutyDayKeys, dutyDayText, dutyDefaultOn, dutyExportEarliest, dutyExportPresets, dutyPeriodLabel,
  dutyRangeLabel, dutyRemarksText, dutyTimesError,
  type DutyData, type DutyFlight, type DutyInputFlight,
} from '@wingbeat/core/duty';
import { dutyLogPdfName, dutyLogTypstSource } from '@wingbeat/core/duty-pdf';
import { flightEntrySummary, flightFieldEdited, type FlightCorrection } from '@wingbeat/core/flight-edits';
import { fmtDuration, fmtTzTime, tzShortDate, unixToTzTime } from '@wingbeat/core/time';
import type { FilterChoice, FlightRow } from './flights';

/** An hours limit or the quarter's rest days, as a bar toward its limit. */
export interface DutyMeter {
  label: string;
  /** "412:30", or "9 + 2 planned" for rest days. */
  value: string;
  /** "500:00", or "13". */
  limit: string;
  /** How full the bar is, 0 to 1. */
  fraction: number;
  /** Over an hours limit, or rest days that can no longer reach the minimum. */
  over: boolean;
}

export type DutyItem =
  | { kind: 'flight'; key: string; row: FlightRow }
  | { kind: 'unmatched'; key: string; text: string }
  | { kind: 'warning'; key: string; text: string };

export interface DutyDaySection {
  dayKey: string;
  /** "Thu Nov 13" */
  title: string;
  /** "08:00–17:00", "08:00–17:00 (default)", "Rest · designated Oct 3" or "—". */
  duty: string;
  rest: boolean;
  note: string | null;
  /** The day's flight time ("2:15"); null without flights. */
  total: string | null;
  data: DutyItem[];
}

export interface DutyUpcomingRow {
  dayKey: string;
  /** "Nov 20 Thu" */
  title: string;
  duty: string;
  rest: boolean;
  note: string | null;
}

export interface DutyMonthView {
  /** "§135.267 totals as of Nov 13, 14:05 AKST" */
  totalsTitle: string;
  limitsLabel: string;
  meters: DutyMeter[];
  /** "Month total 12:30" */
  monthTotal: string;
  isCurrentMonth: boolean;
  upcoming: DutyUpcomingRow[];
  days: DutyDaySection[];
}

/** The pilots the tab offers: the active ones, and the shown one if it isn't. */
export function dutyPilots(pilots: Pick<Pilot, 'id' | 'name' | 'active'>[], shown: number | null): Pick<Pilot, 'id' | 'name'>[] {
  return pilots.filter((p) => p.active || p.id === shown);
}

/**
 * The pilot to show: the one picked, while there's such a pilot, else the user's own
 * (users.pilot_id), else the first offered.
 */
export function dutyPilotShown(pilots: Pick<Pilot, 'id' | 'name' | 'active'>[], picked: number | null,
                               own: number | null): Pick<Pilot, 'id' | 'name'> | null {
  return pilots.find((p) => p.id === picked) ?? pilots.find((p) => p.id === own) ?? pilots.find((p) => p.active) ?? null;
}

/** A month as one number (year * 12 + month - 1), to step through months. */
export function dutyMonthIndex(year: number, month: number): number {
  return year * 12 + month - 1;
}

export function dutyMonthOf(index: number): [number, number] {
  return [Math.floor(index / 12), (index % 12) + 1];
}

/**
 * The pilot's month (core's computeDutyData, as the web's log computes it) from the flight
 * store's completed flights and unmatched corrections and the pilot's log (GET /api/duty-days).
 */
export function dutyMonth(tz: string, now: number, flights: DutyInputFlight[], unmatched: FlightCorrection[],
                          pilot: Pick<Pilot, 'id' | 'name'>, year: number, month: number, log: DutyLogResponse): DutyData {
  return computeDutyData(tz, now, flights, pilot.id, pilot.name, year, month, {
    days: log.days, defaultDuty: log.default_duties, unmatched, method: log.duty_methods,
  });
}

/** A period the Export PDF menu offers: from..to are month indexes (dutyMonthIndex). */
export interface DutyExportOption {
  key: string;
  title: string;
  /** "July – September 2026" */
  subtitle: string;
  from: number;
  to: number;
}

const EXPORT_TITLES: Record<string, string> = {
  month: 'Month', quarter: 'Quarter', prevQuarter: 'Previous quarter', year: 'Last 12 months',
};

/**
 * The Export PDF menu's periods (core's presets, as the web's export form offers them): the
 * shown month, its quarter through this month (cur), the quarter before, the last 12 months.
 */
export function dutyExportOptions(tz: string, flights: DutyInputFlight[], pilotId: number, shown: number, cur: number): DutyExportOption[] {
  const earliest = dutyExportEarliest(tz, flights, pilotId, shown, cur);
  const ym = (i: number) => { const [year, month] = dutyMonthOf(i); return { year, month }; };
  return dutyExportPresets(shown, cur, earliest).map((p) => ({
    key: p.key,
    title: EXPORT_TITLES[p.key] ?? p.label,
    subtitle: dutyRangeLabel(p.from === p.to ? [ym(p.from)] : [ym(p.from), ym(p.to)]),
    from: p.from,
    to: p.to,
  }));
}

/** The months a Custom export's From and To offer, newest first: earliest (dutyExportEarliest's) through cur. */
export function dutyExportMonths(earliest: number, cur: number): FilterChoice<number>[] {
  const out: FilterChoice<number>[] = [];
  for (let i = cur; i >= earliest; i--) {
    const [year, month] = dutyMonthOf(i);
    out.push({ value: i, label: dutyPeriodLabel({ year, month }) });
  }
  return out;
}

/** The PDF of the pilot's months from..to: its Typst source and file name, as of now. */
export function dutyPdfOf(tz: string, now: number, flights: DutyInputFlight[], unmatched: FlightCorrection[],
                          pilot: Pick<Pilot, 'id' | 'name'>, from: number, to: number, log: DutyLogResponse,
                          appName: string): { source: string; name: string } {
  const months = dutyMonths(tz, now, flights, unmatched, pilot, from, to, log);
  return { source: dutyLogTypstSource(tz, now, months, appName), name: dutyLogPdfName(months) };
}

/** The pilot's months from..to (month indexes), in order, each as dutyMonth computes it. */
export function dutyMonths(tz: string, now: number, flights: DutyInputFlight[], unmatched: FlightCorrection[],
                           pilot: Pick<Pilot, 'id' | 'name'>, from: number, to: number, log: DutyLogResponse): DutyData[] {
  const months: DutyData[] = [];
  for (let i = from; i <= to; i++) months.push(dutyMonth(tz, now, flights, unmatched, pilot, ...dutyMonthOf(i), log));
  return months;
}

function flightRow(tz: string, f: DutyFlight): FlightRow {
  return {
    id: f.id,
    time: unixToTzTime(tz, f.start_time) + '–' + fmtTzTime(tz, f.end_time),
    timesEdited: flightFieldEdited(f, 'start_time') || flightFieldEdited(f, 'end_time'),
    duration: fmtDuration(f.secs),
    route: (f.origin_label || '—') + ' → ' + (f.destination_label || '—'),
    routeEdited: flightFieldEdited(f, 'origin_label') || flightFieldEdited(f, 'destination_label'),
    manual: f.manual,
    assignment: typeof f.aircraft_tail === 'string' && f.aircraft_tail ? f.aircraft_tail : null,
    remarks: f.remarks.length ? [dutyRemarksText(f)] : [],
  };
}

/** data (dutyMonth's) as the tab shows it. */
export function dutyMonthView(tz: string, data: DutyData): DutyMonthView {
  const { totals, year } = data;
  const meters: DutyMeter[] = totals.hours.map((h) => ({
    label: h.label,
    value: fmtDuration(h.secs, h.over),
    limit: fmtDuration(h.limit),
    fraction: Math.min(1, h.secs / h.limit),
    over: h.over,
  }));
  const r = totals.rest;
  if (r) {
    meters.push({
      label: r.label,
      value: r.taken + (r.scheduled ? ' + ' + r.scheduled + ' planned' : ''),
      limit: String(r.required),
      fraction: Math.min(1, (r.taken + r.scheduled) / r.required),
      over: r.short,
    });
  }
  const days = data.days.slice().reverse().map((day): DutyDaySection => ({
    dayKey: day.dateKey,
    title: day.label,
    duty: dutyDayText(tz, day, year),
    rest: day.rest,
    note: day.note,
    total: day.flights.length ? fmtDuration(day.daySecs) : null,
    data: [
      ...day.flights.map((f): DutyItem => ({ kind: 'flight', key: 'f' + f.id, row: flightRow(tz, f) })),
      ...day.unmatched.map((e): DutyItem => ({
        kind: 'unmatched', key: 'u' + e.id,
        text: 'Tracked flight from ' + unixToTzTime(tz, e.flight_start_time as number) + ' no longer found; its corrections (' +
          flightEntrySummary(tz, e) + ') aren’t counted.',
      })),
      ...day.warnings.map((text, i): DutyItem => ({ kind: 'warning', key: 'w' + i, text })),
    ],
  }));
  return {
    totalsTitle: '§135.267 totals as of ' + totals.asOfLabel,
    limitsLabel: data.limitsLabel,
    meters,
    monthTotal: 'Month total ' + fmtDuration(data.monthSecs),
    isCurrentMonth: data.isCurrentMonth,
    upcoming: data.upcoming.map((u) => ({
      dayKey: u.dateKey,
      title: tzShortDate(u.dateKey, year) + ' ' + u.label.slice(0, 3),
      duty: dutyDayText(tz, u, year),
      rest: u.rest,
      note: u.note,
    })),
    days,
  };
}

/**
 * The day form (the web's "Duty or rest"): duty times or a rest day, and a note, for from
 * or every day from it through through.
 */
export interface DutyDayForm {
  from: string;
  /** null: from alone. */
  through: string | null;
  rest: boolean;
  /** Duty start and end (HH:MM); null records none (the default applies on a flying day). */
  times: { start: string; end: string } | null;
  note: string;
}

/** The form for from..through, filled from from's record in log, as the web's fills it. */
export function dutyDayFormOf(log: DutyLogResponse, from: string, through: string | null): DutyDayForm {
  const r = log.days.find((d) => d.date === from);
  return {
    from,
    through,
    rest: !!r?.rest,
    times: r?.duty_start && r.duty_end ? { start: r.duty_start, end: r.duty_end } : null,
    note: r?.note ?? '',
  };
}

/** The times the form's Duty Times switch starts with: the pilot's default on from, else 08:00–17:00. */
export function dutyTimesSuggested(log: DutyLogResponse, from: string): { start: string; end: string } {
  const def = dutyDefaultOn(log.default_duties, from);
  return def?.duty_start && def.duty_end ? { start: def.duty_start, end: def.duty_end } : { start: '08:00', end: '17:00' };
}

/** The form's days and its PUT /api/duty-days body (without base_history_id), or what's wrong with it. */
export function dutyDayRequest(form: DutyDayForm): { keys: string[]; body: Omit<DutyDaysRequest, 'base_history_id'> } | string {
  const keys = dutyDayKeys(form.from, form.through ?? '');
  if (typeof keys === 'string') return keys;
  const times = form.rest ? null : form.times;
  const error = dutyTimesError(times?.start ?? null, times?.end ?? null);
  if (error) return error;
  return { keys, body: { dates: keys, duty_start: times?.start ?? null, duty_end: times?.end ?? null, rest: form.rest, note: form.note } };
}

/** Whether any of the form's days has a record: it offers Clear. */
export function dutyDaysRecorded(log: DutyLogResponse, form: Pick<DutyDayForm, 'from' | 'through'>): boolean {
  const keys = dutyDayKeys(form.from, form.through ?? '');
  return typeof keys !== 'string' && log.days.some((d) => keys.includes(d.date));
}

// The native date pickers take and give Dates on the phone's clock; the form's dates and
// times are the operator's wall-clock values, so they go through the phone's local time
// unconverted (noon, and a day without a DST change, keep a date and time as typed).

export function dateOfDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function dayKeyOfDate(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function dateOfTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m);
}

export function timeOfDate(d: Date): string {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
