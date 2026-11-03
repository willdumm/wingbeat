/**
 * The pilot duty log's compliance logic (14 CFR §135.267, unscheduled, one-pilot crew):
 * a pilot's month as day rows with warnings, the quarter/year totals, and the texts the
 * log, its PDF and its forms show. See docs/duty-log-editing-plan.md.
 *
 * Moved from the duty log's script string as it was: the output shapes and the warning
 * strings are the ones renderDutyLog(), the PDF builder, the dashboard's alerts and the
 * showcase already use.
 *
 * Times are Unix seconds; dates are YYYY-MM-DD keys and duty times HH:MM, both in the
 * operator's timezone. The functions that need it take that timezone (`tz`) first, as
 * core's `time` does, and the two that read the clock take `now` (Unix seconds) after it.
 */
import type { EffectiveFlight, FlightCorrection, FlightEdit } from './flight-edits';
import { flightRemarks } from './flight-edits';
import {
  fmtDuration, tzAddDays, tzAddMonths, tzDateKey, tzDateLabel, tzLocalToEpoch, tzShortDate,
  unixToTzDateStr, unixToTzTime,
} from './time';

/** A duty_days row: one pilot's duty period, rest day or note on one date. */
export interface DutyDay {
  pilot_id?: number;
  date: string;
  duty_start: string | null;
  duty_end: string | null;
  rest: number | boolean;
  rest_designated_at: number | null;
  note: string | null;
}

/** A pilot's default duty from effective_date (duty_start null: none from then on). */
export interface DefaultDuty {
  effective_date: string;
  duty_start: string | null;
  duty_end: string | null;
}

export type DutyMethod = 'b' | 'c';

/** The operator's §135.267 method from effective_date. */
export interface DutyMethodEntry {
  effective_date: string;
  method: DutyMethod;
}

/** Duty times, from a duty_days row or a default. */
export interface DutyTimes {
  duty_start: string | null;
  duty_end: string | null;
}

/** A day's duty period as epochs. */
export interface DutyInterval {
  start: number;
  end: number;
  secs: number;
  duty_start: string;
  duty_end: string;
  /** From the pilot's default, not a record. */
  isDefault?: boolean;
}

/** An effective flight (flight-edits) with its pilot. */
export type DutyInputFlight = EffectiveFlight & { pilot_id?: number | null };
type Completed = DutyInputFlight & { end_time: number };

/** A pilot's flight in the log. */
export type DutyFlight = Completed & {
  manual: boolean;
  part91: boolean;
  commercial: boolean;
  remarks: string[];
  entry: FlightCorrection | null;
  /** Each corrected field's tracker value. */
  edited: FlightEdit['original'];
  secs: number;
};

export interface DutyDayRow {
  dateKey: string;
  label: string;
  method: DutyMethod;
  record: DutyDay | null;
  duty: DutyInterval | null;
  defaultDuty: boolean;
  rest: boolean;
  restDesignatedAt: number | null;
  note: string | null;
  flights: DutyFlight[];
  unmatched: FlightCorrection[];
  daySecs: number;
  warnings: string[];
}

export interface DutyUpcoming {
  dateKey: string;
  label: string;
  record: DutyDay;
  rest: boolean;
  restDesignatedAt: number | null;
  note: string | null;
  duty: DutyInterval | null;
  defaultDuty: false;
}

export interface DutyLimitRow { label: string; secs: number; limit: number; over: boolean }

export interface DutyTotals {
  asOfLabel: string;
  hours: DutyLimitRow[];
  flight24: DutyLimitRow;
  rest: { label: string; taken: number; scheduled: number; required: number; short: boolean } | null;
}

export interface DutyData {
  pilotName: string;
  year: number;
  month: number;
  isCurrentMonth: boolean;
  method: DutyMethod;
  limitsLabel: string;
  days: DutyDayRow[];
  prevDay: DutyDayRow;
  upcoming: DutyUpcoming[];
  monthSecs: number;
  totals: DutyTotals;
}

/** A dated list, or one value for every day. */
type DefaultDutyOption = DefaultDuty[] | DutyTimes | null;
type MethodOption = DutyMethodEntry[] | string;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// §135.267, unscheduled, one-pilot crew: the one place the numbers live. A two-pilot
// crew would get 10 h of flight time under (b) and (c) (not yet implemented: no flight
// records its crew; see docs/duty-log-editing-plan.md).
export const DUTY_LIMITS = {
  flightDaySecs:   8 * 3600,      // (b) in any 24 consecutive hours; (c)(2) in the duty period
  dutySecs:        14 * 3600,     // (c) duty period
  restSecs:        10 * 3600,     // (c)(1) rest before and after a duty period; (d) look-back
  quarterSecs:     500 * 3600,    // (a) calendar quarter
  twoQuarterSecs:  800 * 3600,    // (a) two consecutive calendar quarters
  yearSecs:        1400 * 3600,   // (a) calendar year
  quarterRestDays: 13,            // (f) 24-hour rest periods per calendar quarter
  // (e) rest after going over the daily limit, by how far over: the first row whose
  // overSecs isn't exceeded.
  extendedRest: [
    { overSecs: 30 * 60,  restSecs: 11 * 3600 },
    { overSecs: 60 * 60,  restSecs: 12 * 3600 },
    { overSecs: Infinity, restSecs: 16 * 3600 },
  ],
};

// The operator's choice of daily limits under §135.267 (Global Settings; dated, see
// dutyMethodOn).
const DUTY_METHODS: Record<DutyMethod, string> = {
  b: 'Limits: §135.267(b), flight time in any 24 hours · one-pilot crew',
  c: 'Limits: §135.267(c), regularly assigned duty period · one-pilot crew',
};

/** Under the totals, in the log and the PDF. */
export const DUTY_TOTALS_FOOTNOTE =
  'Hour totals count commercial flying: Part 135 and Part 91 flights, but not Part 91 flights ' +
  'marked unpaid. Rest periods are days marked rest in advance, with no flights and the ' +
  'previous duty over by midnight (a rest day with a warning isn’t counted). The daily flight ' +
  'time limit counts paid Part 91 flying before a Part 135 flight and leaves out Part 91 flying ' +
  'after the last one (FAA interpretation to Converse, 2011).';

// Whether an effective flight is commercial flying, which the §135.267 limits count: all
// but Part 91 flying marked unpaid (FAA interpretations to Martindell, 2009, and
// Rodriguez, 2012).
function dutyCommercial(f: DutyInputFlight): boolean {
  return !(f.edit && f.edit.unpaid);
}

/** [year, month] of now's month in the operator's timezone. */
export function currentDutyMonth(tz: string, now: number): [number, number] {
  const [y, m] = unixToTzDateStr(tz, now).split('-').map(Number);
  return [y, m];
}

/** "October 2026". */
export function dutyPeriodLabel(data: { year: number; month: number }): string {
  return MONTH_NAMES[data.month - 1] + ' ' + data.year;
}

// Duty period of a day's duty times (a duty_days row, or the pilot's default) as epochs;
// an end at or before the start is the next day.
function dutyInterval(tz: string, dateKey: string, times: DutyTimes | null): DutyInterval | null {
  if (!times || !times.duty_start || !times.duty_end) return null;
  const start = tzLocalToEpoch(tz, dateKey, times.duty_start);
  const end = tzLocalToEpoch(tz, times.duty_end > times.duty_start ? dateKey : tzAddDays(dateKey, 1), times.duty_end);
  return { start, end, secs: end - start, duty_start: times.duty_start, duty_end: times.duty_end };
}

// ── Dated defaults ──

/**
 * The entry of a dated list ([{ effective_date, ... }], any order: a pilot's default
 * duties or the operator's methods, GET /api/duty-days) in force on dateKey: the one with
 * the latest effective_date on or before it, or the earliest when they're all later
 * (there's no earlier one to apply). null for an empty list.
 */
export function dutyEntryOn<E extends { effective_date: string }>(entries: E[] | null | undefined, dateKey: string): E | null {
  let on: E | null = null, earliest: E | null = null;
  for (const e of entries || []) {
    if (!earliest || e.effective_date < earliest.effective_date) earliest = e;
    if (e.effective_date <= dateKey && (!on || e.effective_date > on.effective_date)) on = e;
  }
  return on || earliest;
}

/**
 * The pilot's default duty on dateKey ({ effective_date, duty_start, duty_end }), or
 * null: no entries, or one in force that sets no default.
 */
export function dutyDefaultOn(defaults: DefaultDuty[] | null | undefined, dateKey: string): DefaultDuty | null {
  const e = dutyEntryOn(defaults, dateKey);
  return e && e.duty_start ? e : null;
}

/** The §135.267 method on dateKey, 'b' (also with no entries) or 'c'. */
export function dutyMethodOn(methods: DutyMethodEntry[] | null | undefined, dateKey: string): DutyMethod {
  const e = dutyEntryOn(methods, dateKey);
  return e && e.method === 'c' ? 'c' : 'b';
}

// computeDutyData's and dutyTotals' defaultDuty and method options as lookups by date:
// a dated list, or one value for every day.
function dutyDefaultLookup(defaultDuty: DefaultDutyOption): (dateKey: string) => DutyTimes | null {
  if (Array.isArray(defaultDuty)) return dateKey => dutyDefaultOn(defaultDuty, dateKey);
  const d = defaultDuty && defaultDuty.duty_start ? defaultDuty : null;
  return () => d;
}
function dutyMethodLookup(method: MethodOption): (dateKey: string) => DutyMethod {
  if (Array.isArray(method)) return dateKey => dutyMethodOn(method, dateKey);
  const m = method === 'c' ? 'c' : 'b';
  return () => m;
}

// The limits line for a month's day rows: the method's label or, for a month that
// changed method, each method with its dates ("Limits: §135.267(b) to Jun 14,
// §135.267(c) from Jun 15 · one-pilot crew").
function dutyLimitsLabel(days: { method: DutyMethod; dateKey: string }[], year: number): string {
  const runs: { method: DutyMethod; from: string; to: string }[] = [];
  for (const d of days) {
    const last = runs[runs.length - 1];
    if (last && last.method === d.method) last.to = d.dateKey;
    else runs.push({ method: d.method, from: d.dateKey, to: d.dateKey });
  }
  if (runs.length <= 1) return DUTY_METHODS[runs.length ? runs[0].method : 'b'];
  const date = (k: string) => tzShortDate(k, year);
  return 'Limits: ' + runs.map((r, i) => '§135.267(' + r.method + ') ' +
    (i === 0 ? 'to ' + date(r.to) : i === runs.length - 1 ? 'from ' + date(r.from) : date(r.from) + '–' + date(r.to))
  ).join(', ') + ' · one-pilot crew';
}

// One pilot's days: their flights (any kind) by local date, their duty_days rows by
// date, each day's duty period, and what's wrong with a rest day. Shared by the row
// model and the totals, so a rest day that gets a warning doesn't count as rest.
// defaultOn(dateKey): the pilot's default duty that day, or null (dutyDefaultLookup).
function dutyCalendar<F extends Completed>(tz: string, flights: F[], dayRecords: DutyDay[],
                                           defaultOn: (dateKey: string) => DutyTimes | null) {
  const flightsByDate: Record<string, F[]> = {};
  for (const f of flights) {
    const dk = unixToTzDateStr(tz, f.start_time);
    (flightsByDate[dk] = flightsByDate[dk] || []).push(f);
  }
  const recordByDate: Record<string, DutyDay> = {};
  for (const r of dayRecords) recordByDate[r.date] = r;

  // A day's duty period: its record's times, or the default in force that day on a
  // flying day with no times recorded (no record, or one with only a note); a rest day
  // has none. { ..., isDefault } or null.
  function dutyOf(dateKey: string): DutyInterval | null {
    const rec = recordByDate[dateKey];
    if (rec && rec.rest) return null;
    if (rec && rec.duty_start) return dutyInterval(tz, dateKey, rec);
    const def = flightsByDate[dateKey] && defaultOn(dateKey);
    if (!def) return null;
    const d = dutyInterval(tz, dateKey, def);
    return d && { ...d, isDefault: true };
  }

  // The time a day keeps the pilot busy: its duty period stretched to cover its flights
  // (a flight outside duty is still duty), as { start, end }, or null for a day with
  // neither.
  function spanOf(dateKey: string): { start: number; end: number } | null {
    const duty = dutyOf(dateKey);
    let start = duty ? duty.start : Infinity, end = duty ? duty.end : -Infinity;
    for (const f of flightsByDate[dateKey] || []) {
      start = Math.min(start, f.start_time);
      end = Math.max(end, f.end_time);
    }
    return start < end ? { start, end } : null;
  }

  // Why a day marked rest isn't a 24-hour rest period (§135.267(f)), as warnings: it
  // has flights, it wasn't designated in advance, or the previous day's duty or flying
  // (spanOf, so a flight outside duty that lands after midnight counts) ran past
  // midnight. [] for a valid rest day or a day not marked rest. year: the shown year,
  // for dates.
  function restProblems(dateKey: string, year: number): string[] {
    const rec = recordByDate[dateKey];
    if (!rec || !rec.rest) return [];
    const out: string[] = [];
    if (flightsByDate[dateKey]) out.push('Flights on a rest day');
    if (rec.rest_designated_at != null && unixToTzDateStr(tz, rec.rest_designated_at) >= dateKey) {
      out.push('Rest day designated ' + tzShortDate(unixToTzDateStr(tz, rec.rest_designated_at), year) +
        ', not in advance');
    }
    const prev = spanOf(tzAddDays(dateKey, -1));
    if (prev && prev.end > tzLocalToEpoch(tz, dateKey, '00:00')) {
      out.push('Previous duty or flight ended ' + unixToTzTime(tz, prev.end) + ', so this rest is under 24 h');
    }
    return out;
  }

  return { flightsByDate, recordByDate, dutyOf, spanOf, restProblems };
}

// ── The row model ──

export interface ComputeDutyDataOptions {
  /** The pilot's duty_days rows (GET /api/duty-days). */
  days?: DutyDay[];
  /** A dated list (GET /api/duty-days's default_duties) or one { duty_start, duty_end } for every day. */
  defaultDuty?: DefaultDutyOption;
  /** The corrections whose flight is gone (flightStore.getUnmatched()). */
  unmatched?: FlightCorrection[];
  /** A dated list (GET /api/duty-days's duty_methods) or 'b' / 'c' for every day. */
  method?: MethodOption;
}

/**
 * One pilot's month as day rows plus §135.267 totals, in the operator's timezone tz, as of
 * now. allFlights are effective flights (flightStore.getCompleted(), or applyFlightEdits()
 * output: corrections applied, manual flights added, removed flights left out) for every
 * pilot; days are the pilot's duty_days rows (GET /api/duty-days), defaultDuty the pilot's
 * usual duty period and unmatched the corrections whose flight is gone
 * (flightStore.getUnmatched()). method is the operator's §135.267 method, 'b' (the
 * default) or 'c'; it picks the daily checks. defaultDuty and method are each a dated list
 * (GET /api/duty-days's default_duties, [{ effective_date, duty_start, duty_end }], and
 * duty_methods, [{ effective_date, method }]), every day using the entry in force on it
 * (dutyEntryOn), or one value for every day ({ duty_start, duty_end } HH:MM or null; 'b' or
 * 'c'). So a past month is checked with what was in force then.
 *
 * Returns { pilotName, year, month, isCurrentMonth, method, limitsLabel, days, prevDay,
 * upcoming, monthSecs, totals }: method is the one in force on the last day shown,
 * limitsLabel names each one the month used.
 * days run through today in the current month. Each is { dateKey, label, method,
 * record, duty, defaultDuty, rest, restDesignatedAt, note, flights, unmatched, daySecs,
 * warnings }: duty is the day's duty period from its record or, on a flying day with
 * no record, from the default in force that day (then defaultDuty is true). A day's flight
 * is the effective flight plus { manual, part91, remarks, entry, secs, edited: { field:
 * tracker's value }, commercial }. upcoming (current month only) lists the records dated
 * after today, for planning. prevDay is the last day of the previous month, built the same
 * way (the PDF shows it, so the month's first rolling checks can be followed).
 */
export function computeDutyData(tz: string, now: number, allFlights: DutyInputFlight[], pilotId: number,
                                pilotName: string, year: number, month: number,
                                { days: dayRecords = [], defaultDuty = null, unmatched: unmatchedEntries = [], method = 'b' }: ComputeDutyDataOptions = {}): DutyData {
  const defaultOn = dutyDefaultLookup(defaultDuty), methodOn = dutyMethodLookup(method);
  const todayKey = unixToTzDateStr(tz, now);

  // 1. The pilot's flights.
  const completed = allFlights.filter(f => f.end_time != null && !(f.edit && f.edit.excluded)) as Completed[];
  const flights: DutyFlight[] = completed.filter(f => f.pilot_id === pilotId).map(f => ({
    ...f,
    manual: !!(f.edit && f.edit.manual),
    part91: !!(f.edit && f.edit.part91),
    commercial: dutyCommercial(f),
    remarks: flightRemarks(f),
    entry: f.edit ? f.edit.entry : null,
    edited: f.edit ? f.edit.original : {},
    secs: Math.max(0, f.end_time - f.start_time),
  }));
  flights.sort((a, b) => a.start_time - b.start_time);

  // A row whose flight is gone (a history import moved its first point) carries no
  // pilot, so it goes to the pilot of the same tracker's flight nearest its start time
  // (within 12 h: the flight that replaced it, or that day's flying). With no flight
  // that close it shows only in the flight editor, rather than in every pilot's log.
  const unmatchedByDate: Record<string, FlightCorrection[]> = {};
  for (const e of unmatchedEntries) {
    const start = e.flight_start_time!;
    let near: Completed | null = null, nearGap = 12 * 3600;
    for (const f of completed) {
      if (f.tracker_id !== e.tracker_id) continue;
      const gap = start < f.start_time ? f.start_time - start : Math.max(0, start - f.end_time);
      if (gap <= nearGap) { near = f; nearGap = gap; }
    }
    if (!near || near.pilot_id !== pilotId) continue;
    const dk = unixToTzDateStr(tz, start);
    (unmatchedByDate[dk] = unmatchedByDate[dk] || []).push(e);
  }

  const { flightsByDate, recordByDate, dutyOf, spanOf, restProblems } = dutyCalendar(tz, flights, dayRecords, defaultOn);

  // Flight time in the 24 h ending at end, in all commercial flying (§135.267(b)): Part
  // 135 and paid Part 91 alike. Only evaluated at the end of a Part 135 flight, so Part 91
  // flying before a Part 135 flight counts and Part 91 flying after the last one falls
  // in no window (FAA interpretation to Converse, 2011).
  function flightTime24(end: number): number {
    const from = end - 86400;
    let s = 0;
    for (const g of flights) {
      if (!g.commercial || g.end_time <= from || g.start_time >= end) continue;
      s += Math.min(g.end_time, end) - Math.max(g.start_time, from);
    }
    return s;
  }

  // A day's worst 24-hour flight time, at the end of one of its Part 135 flights:
  // { secs, end } (secs 0 on a day without Part 135 flights).
  function worst24Of(dateKey: string): { secs: number; end: number | null } {
    let secs = 0, end: number | null = null;
    for (const f of flightsByDate[dateKey] || []) {
      if (f.part91) continue;
      const s = flightTime24(f.end_time);
      if (s > secs) { secs = s; end = f.end_time; }
    }
    return { secs, end };
  }

  // A day's flight time against the daily limit: under (b) its worst 24-hour window;
  // under (c) the whole commercial flights that start in its duty period stretched to
  // cover its flights (spanOf: a flight outside duty still counts, besides its own
  // warning, and none is clipped), before the end of its last Part 135 flight (the
  // same Converse ordering as flightTime24). { secs, text }, the text rounded up for
  // the over-limit warning (secs 0 when there's nothing to check). The method is the
  // day's own.
  function dailyFlightOf(dateKey: string): { secs: number; text: string } {
    if (methodOn(dateKey) === 'b') {
      const w = worst24Of(dateKey);
      return { secs: w.secs, text: fmtDuration(w.secs, true) + ' flight time in the 24 h to ' + (w.end ? unixToTzTime(tz, w.end) : '') };
    }
    const span = spanOf(dateKey);
    if (!span || !dutyOf(dateKey)) return { secs: 0, text: '' };
    const inDuty = flights.filter(f => f.start_time >= span.start && f.start_time < span.end);
    const last135 = Math.max(-Infinity, ...inDuty.filter(f => !f.part91).map(f => f.end_time));
    const secs = inDuty.reduce((t, f) => t + (f.commercial && f.start_time < last135 ? f.secs : 0), 0);
    return { secs, text: fmtDuration(secs, true) + ' flight time in the duty period' };
  }

  // The longest stretch of [from, to] outside every duty period and flight (§135.267(d)).
  function longestRest(from: number, to: number): number {
    const busy: [number, number][] = [];
    for (let k = tzAddDays(unixToTzDateStr(tz, from), -1); k <= unixToTzDateStr(tz, to); k = tzAddDays(k, 1)) {
      const d = dutyOf(k);
      if (d) busy.push([d.start, d.end]);
      for (const f of flightsByDate[k] || []) busy.push([f.start_time, f.end_time]);
    }
    busy.sort((a, b) => a[0] - b[0]);
    let best = 0, free = from;
    for (const [start, end] of busy) {
      if (end <= free) continue;
      if (start >= to) break;
      best = Math.max(best, start - free);
      free = end;
    }
    return Math.max(best, to - free);
  }

  // 2. Days, each checked with the method and default duty in force on it.
  function buildDay(dateKey: string): DutyDayRow {
    const method = methodOn(dateKey), defaultDuty = defaultOn(dateKey);
    const ref = '§135.267(' + method + ')';
    const rec = recordByDate[dateKey] || null;
    const dayFlights = flightsByDate[dateKey] || [];
    const duty = dutyOf(dateKey);
    const prevKey = tzAddDays(dateKey, -1);
    const prevDuty = dutyOf(prevKey);
    const span = spanOf(dateKey);
    const rest = !!(rec && rec.rest);
    const L = DUTY_LIMITS;
    const warnings: string[] = [];

    warnings.push(...restProblems(dateKey, year));
    const daily = dailyFlightOf(dateKey);
    if (daily.secs > L.flightDaySecs) {
      warnings.push(daily.text + ' (' + ref + ' limit ' + fmtDuration(L.flightDaySecs) + ')');
    }
    // Without a duty period the duty and rest checks have nothing to go on.
    if (dayFlights.length && !duty && !rest) {
      warnings.push('No duty times recorded: record the duty period, including any on-call or standby time');
    }
    // §135.267(e): after going over the daily limit, a longer rest before the next duty.
    const prevOver = dailyFlightOf(prevKey).secs - L.flightDaySecs;
    const prevSpan = spanOf(prevKey);
    if (prevOver > 0 && prevSpan && span) {
      const need = L.extendedRest.find(r => prevOver <= r.overSecs)!.restSecs;
      const restSecs = span.start - prevSpan.end;
      if (restSecs < need) {
        warnings.push('Rest ' + fmtDuration(Math.max(0, restSecs)) + ' after going ' + fmtDuration(prevOver, true) +
          ' over the flight time limit on ' + tzShortDate(prevKey, year) + ' (§135.267(e) minimum ' + fmtDuration(need) + ')');
      }
    }
    // (c) needs a regularly assigned duty period: the pilot's default duty that day.
    if (method === 'c' && !defaultDuty && (duty || dayFlights.length)) {
      warnings.push('No regularly assigned duty period: set the pilot’s default duty (§135.267(c))');
    }
    if (duty && method === 'b') {
      // (d): 10 consecutive hours of rest in the 24 h before the duty period ends. A duty
      // period over 14 h can't leave that, so this is also the duty-length check.
      const restSecs = longestRest(duty.end - 86400, duty.end);
      if (restSecs < L.restSecs) {
        warnings.push((duty.secs > 86400 - L.restSecs
          ? 'Duty period ' + fmtDuration(duty.secs, true) + ' leaves at most ' + fmtDuration(Math.max(0, 86400 - duty.secs)) + ' of rest'
          : 'Longest rest ' + fmtDuration(restSecs)) +
          ' in the 24 h before duty ended ' + unixToTzTime(tz, duty.end) + ' (§135.267(d) minimum ' + fmtDuration(L.restSecs) + ')');
      }
    }
    if (duty && method === 'c') {
      if (duty.secs > L.dutySecs) {
        warnings.push('Duty period ' + fmtDuration(duty.secs, true) + ' (§135.267(c) limit ' + fmtDuration(L.dutySecs) + ')');
      }
      // The rest between two duty periods, checked once, on the later day: that covers
      // both "preceded by" and "followed by". Busy time that runs into this duty period
      // (an overnight flight, a previous duty past its start) leaves no rest at all.
      // (A day with a duty period has a span.)
      const spanStart = span!.start;
      const prevEnd = Math.max(-Infinity, ...[prevSpan, spanOf(tzAddDays(dateKey, -2))]
        .filter(x => x && x.start < spanStart).map(x => x!.end));
      if (spanStart - prevEnd < L.restSecs) {
        warnings.push('Rest before duty ' + fmtDuration(Math.max(0, spanStart - prevEnd)) + ' (§135.267(c) minimum ' + fmtDuration(L.restSecs) + ')');
      }
      if (defaultDuty && !duty.isDefault &&
          (duty.duty_start !== defaultDuty.duty_start || duty.duty_end !== defaultDuty.duty_end)) {
        warnings.push('Duty ' + duty.duty_start + '–' + duty.duty_end + ' differs from the regularly assigned ' +
          defaultDuty.duty_start + '–' + defaultDuty.duty_end + ' (§135.267(c))');
      }
      // Duty plus rest is 24 h: no duty may start earlier on the clock than the previous
      // day's did (clock times, so a DST day doesn't warn).
      if (prevDuty && duty.start < tzLocalToEpoch(tz, dateKey, prevDuty.duty_start)) {
        warnings.push('Duty starts ' + duty.duty_start + ', earlier than the previous day’s ' + prevDuty.duty_start +
          ', so duty plus rest is under 24 h (§135.267(c))');
      }
    }
    if (duty) {
      // A default that doesn't fit the day's flying shows up here; the fix is to
      // record the actual duty times.
      for (const f of dayFlights) {
        if (f.start_time < duty.start || f.end_time > duty.end) {
          warnings.push('Flight ' + unixToTzTime(tz, f.start_time) + '–' + unixToTzTime(tz, f.end_time) +
            ' outside duty ' + duty.duty_start + '–' + duty.duty_end + (duty.isDefault ? ' (default)' : ''));
        }
      }
    }

    return {
      dateKey,
      label: tzDateLabel(dateKey),
      method,
      record: rec,
      duty,
      defaultDuty: !!(duty && duty.isDefault),
      rest,
      restDesignatedAt: rest ? rec!.rest_designated_at : null,
      note: rec ? rec.note : null,
      flights: dayFlights,
      unmatched: unmatchedByDate[dateKey] || [],
      daySecs: dayFlights.reduce((s, f) => s + f.secs, 0),
      warnings,
    };
  }

  // Past days only: planning ahead goes through the Upcoming list.
  const [curY, curM] = currentDutyMonth(tz, now);
  const isCurrentMonth = year === curY && month === curM;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDay = isCurrentMonth ? Number(todayKey.slice(8, 10)) : daysInMonth;
  const days: DutyDayRow[] = [];
  for (let d = 1; d <= lastDay; d++) days.push(buildDay(tzDateKey(year, month, d)));
  const prevDay = buildDay(tzAddDays(tzDateKey(year, month, 1), -1));

  const upcoming: DutyUpcoming[] = isCurrentMonth
    ? dayRecords.filter(r => r.date > todayKey).sort((a, b) => a.date < b.date ? -1 : 1).map(r => ({
        dateKey: r.date, label: tzDateLabel(r.date), record: r, rest: !!r.rest,
        restDesignatedAt: r.rest ? r.rest_designated_at : null, note: r.note,
        duty: dutyInterval(tz, r.date, r), defaultDuty: false as const,
      }))
    : [];

  // 3. Totals: as of now for the current month, as of month end for a past one, so a
  // past month's PDF comes out the same whenever it's exported. Planned rest later in
  // the quarter counts as "planned".
  const [nextY, nextM] = tzAddMonths(year, month, 1);
  const asOf = isCurrentMonth ? now : tzLocalToEpoch(tz, tzDateKey(nextY, nextM, 1), '00:00');
  const totals = dutyTotals(tz, completed, pilotId, asOf, {
    days: dayRecords,
    defaultDuty,
    asOfLabel: isCurrentMonth ? 'now' : tzShortDate(tzDateKey(year, month, daysInMonth)),
  });

  return {
    pilotName,
    year,
    month,
    isCurrentMonth,
    method: days[days.length - 1].method,
    limitsLabel: dutyLimitsLabel(days, year),
    days,
    prevDay,
    upcoming,
    monthSecs: days.reduce((s, d) => s + d.daySecs, 0),
    totals,
  };
}

export interface DutyTotalsOptions {
  /** The pilot's duty_days rows (omitted: no rest counted). */
  days?: DutyDay[];
  /** Dated or not, as for computeDutyData (for the previous-day check). */
  defaultDuty?: DefaultDutyOption;
  asOfLabel?: string;
  /** Hours only (the dashboard alert, which shows no rest): rest is null. */
  hoursOnly?: boolean;
}

/**
 * One pilot's §135.267 totals as of the epoch asOf: flight time in the calendar quarter
 * containing it, that plus the previous quarter, and the calendar year, flight time in the
 * 24 h before it (all commercial flying, Part 91 included: the 24 h are the window of the
 * pilot's next flight, so any Part 91 flying in them came before it; unpaid flights left
 * out), and 24-hour rest periods in the quarter (days marked rest that get no rest
 * warning: no flights, designated in advance, previous day's duty and flights over by
 * midnight). flights are effective flights, any pilot's (only pilotId's count); days the
 * pilot's duty_days rows (omitted: no rest counted) and defaultDuty their default duty
 * period, dated or not as for computeDutyData (for the previous-day check). Returns
 * { asOfLabel, hours: [{ label, secs, limit, over }], flight24: { secs, limit, over },
 * rest: { label, taken, scheduled, required, short } }. With hoursOnly (the dashboard
 * alert, which shows no rest) rest is null and the rest checks are skipped.
 */
export function dutyTotals(tz: string, flights: DutyInputFlight[], pilotId: number, asOf: number,
                           { days: dayRecords = [], defaultDuty = null, asOfLabel = 'now', hoursOnly = false }: DutyTotalsOptions = {}): DutyTotals {
  const own = flights.filter(f => f.pilot_id === pilotId && f.end_time != null && !(f.edit && f.edit.excluded)) as Completed[];
  const commercial = own.filter(dutyCommercial);
  const secsOf = (f: Completed) => Math.max(0, f.end_time - f.start_time);
  const asOfDateKey = unixToTzDateStr(tz, asOf - 1);
  const [year, month] = asOfDateKey.split('-').map(Number);
  const qy = year, qm = Math.floor((month - 1) / 3) * 3 + 1;
  const [pqy, pqm] = tzAddMonths(qy, qm, -3);
  const [nqy, nqm] = tzAddMonths(qy, qm, 3);
  const qStartKey = tzDateKey(qy, qm, 1);
  const qEndKey = tzAddDays(tzDateKey(nqy, nqm, 1), -1);
  const quarterName = (y: number, m: number) => 'Q' + ((m - 1) / 3 + 1) + ' ' + y;
  function flownSince(dateKey: string): number {
    const from = tzLocalToEpoch(tz, dateKey, '00:00');
    return commercial.reduce((s, f) => s + (f.start_time >= from && f.start_time < asOf ? secsOf(f) : 0), 0);
  }
  let flight24 = 0;
  for (const f of commercial) {
    if (f.end_time <= asOf - 86400 || f.start_time >= asOf) continue;
    flight24 += Math.min(f.end_time, asOf) - Math.max(f.start_time, asOf - 86400);
  }
  const limitRow = (label: string, secs: number, limit: number): DutyLimitRow => ({ label, secs, limit, over: secs > limit });
  const totals: DutyTotals = {
    asOfLabel,
    hours: [
      limitRow(quarterName(qy, qm), flownSince(qStartKey), DUTY_LIMITS.quarterSecs),
      limitRow(quarterName(pqy, pqm) + ' + ' + quarterName(qy, qm), flownSince(tzDateKey(pqy, pqm, 1)), DUTY_LIMITS.twoQuarterSecs),
      limitRow('Calendar year ' + qy, flownSince(tzDateKey(qy, 1, 1)), DUTY_LIMITS.yearSecs),
    ],
    flight24: limitRow('Last 24 h', flight24, DUTY_LIMITS.flightDaySecs),
    rest: null,
  };
  if (hoursOnly) return totals;

  // Rest periods: days marked rest that the duty log doesn't warn about.
  const { restProblems } = dutyCalendar(tz, own, dayRecords, dutyDefaultLookup(defaultDuty));
  let restTaken = 0, restScheduled = 0;
  for (const r of dayRecords) {
    if (!r.rest || r.date < qStartKey || r.date > qEndKey || restProblems(r.date, year).length) continue;
    if (r.date <= asOfDateKey) restTaken++; else restScheduled++;
  }
  // Days still to come in the quarter.
  let daysLeft = 0;
  const tomorrow = tzAddDays(asOfDateKey, 1);
  for (let k = tomorrow > qStartKey ? tomorrow : qStartKey; k <= qEndKey; k = tzAddDays(k, 1)) daysLeft++;

  return {
    ...totals,
    rest: {
      label: '24 h rest periods, ' + quarterName(qy, qm),
      taken: restTaken,
      scheduled: restScheduled,
      required: DUTY_LIMITS.quarterRestDays,
      // Can no longer reach 13 even if every remaining day were rest.
      short: restTaken + daysLeft < DUTY_LIMITS.quarterRestDays,
    },
  };
}

/** "Rest · designated Oct 3", "08:00–17:00", "08:00–17:00 (default)" or "—". */
export function dutyDayText(tz: string,
                            day: { rest: boolean; restDesignatedAt: number | null; duty: DutyInterval | null; defaultDuty: boolean },
                            year: number): string {
  if (day.rest) {
    return 'Rest' + (day.restDesignatedAt != null
      ? ' · designated ' + tzShortDate(unixToTzDateStr(tz, day.restDesignatedAt), year) : '');
  }
  if (day.duty) return day.duty.duty_start + '–' + day.duty.duty_end + (day.defaultDuty ? ' (default)' : '');
  return '—';
}

/**
 * The question the day form's Save asks before writing values ({ duty_start, duty_end,
 * rest, note }) to keys over records (the pilot's duty_days rows), or null when nothing
 * recorded is lost. A record already the same as values, as the server stores them (note
 * trimmed, empty as none), isn't replaced. Over a range, any other record on a key is;
 * for one day, only unmarking a rest day with its designation on record asks, since that
 * drops when it was designated for good.
 */
export function dutySaveConfirmText(tz: string, records: DutyDay[], keys: string[],
                                    values: { duty_start?: string | null; duty_end?: string | null; rest?: unknown; note?: string | null }): string | null {
  const norm = (r: typeof values) => JSON.stringify([r.duty_start || null, r.duty_end || null, !!r.rest, (r.note || '').trim() || null]);
  const want = norm(values);
  const byDate: Record<string, DutyDay> = {};
  for (const r of records) byDate[r.date] = r;
  const replaced = keys.map(k => byDate[k]).filter(r => r && norm(r) !== want);
  const restLost = values.rest ? [] : replaced.filter(r => r.rest);
  if (keys.length === 1) {
    const r = restLost[0];
    if (!r || r.rest_designated_at == null) return null;
    return 'This rest day was designated ' +
      tzShortDate(unixToTzDateStr(tz, r.rest_designated_at), Number(r.date.slice(0, 4))) +
      '. Unmarking it drops that designation: marking it rest again records the day you do. Save?';
  }
  if (!replaced.length) return null;
  return (replaced.length === keys.length ? 'All ' + keys.length + ' of these days already have'
      : replaced.length + ' of these ' + keys.length + ' days already ' + (replaced.length === 1 ? 'has a record' : 'have')) +
    (replaced.length === 1 ? ' that will be replaced' : ' records that will be replaced') +
    (restLost.length === 1 ? ', including a rest day that loses its designation'
      : restLost.length ? ', including ' + restLost.length + ' rest days that lose their designation' : '') +
    '. Save?';
}

/** "Remarks: Part 91 · Training" for a flight with remarks, else ''. */
export function dutyRemarksText(f: { remarks: string[] }): string {
  return f.remarks.length ? 'Remarks: ' + f.remarks.join(' · ') : '';
}

/**
 * The Export PDF form's period presets as { key, label, from, to } (month indexes,
 * year * 12 + month - 1): the shown month, its calendar quarter (through this month,
 * cur), the quarter before it (the usual quarterly sign-off), and the last 12 months.
 * Each is clamped to earliest..cur, the months the From/To selects offer; a quarter
 * wholly before earliest is left out. The labels are short so that five segments (with
 * Custom) fit a 320px phone; the From/To selects show the months a preset picked.
 */
export function dutyExportPresets(shown: number, cur: number, earliest: number): { key: string; label: string; from: number; to: number }[] {
  const qStart = shown - (shown % 12) % 3;
  const clamp = (from: number, to: number) => [Math.max(from, earliest), Math.min(to, cur)];
  const out = [{ key: 'month', label: 'Month', from: shown, to: shown }];
  for (const [key, label, start] of [['quarter', 'This qtr', qStart], ['prevQuarter', 'Last qtr', qStart - 3]] as const) {
    const [from, to] = clamp(start, start + 2);
    if (from <= to) out.push({ key, label, from, to });
  }
  out.push({ key: 'year', label: '12 mo', from: cur - 11, to: cur });
  return out;
}

/**
 * "October 2026", "July – September 2026" or "November 2025 – October 2026" for the
 * months (computeDutyData results, in order) an export covers.
 */
export function dutyRangeLabel(months: { year: number; month: number }[]): string {
  const a = months[0], b = months[months.length - 1];
  if (a === b) return dutyPeriodLabel(a);
  return (a.year === b.year ? MONTH_NAMES[a.month - 1] : dutyPeriodLabel(a)) + ' – ' + dutyPeriodLabel(b);
}
