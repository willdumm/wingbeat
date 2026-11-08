/**
 * Maintenance compliance: flight hours, the estimated Hobbs and tach readings (the last
 * recorded reading plus the aircraft's flight hours since, times its correction factor),
 * calendar due dates in the operator's timezone, and each schedule item's status.
 *
 * Takes the operator's timezone (`tz`) and the clock (`now`, Unix seconds) as parameters.
 */
import { tzAddMonths, tzDayEndUnix, tzDaysInMonth, tzShortMonthLabel, unixToTzDateStr } from './time';

/** A maintenance schedule item (aircraft.maintenance_schedule). */
export interface MaintenanceItem {
  id: string;
  name: string;
  schedule_type: 'hobbs' | 'tach' | 'calendar';
  interval_hours?: number;
  last_done_value?: number;
  interval_months?: number;
  last_done_at?: number | null;
}

export type MaintenanceStatusKind = 'ok' | 'due_soon' | 'overdue' | 'timer_not_recorded';

export interface MaintenanceStatus {
  status: MaintenanceStatusKind;
  due_label: string;
  /** Meter items: hours left (negative when overdue). */
  remaining_hours?: number;
  /** Calendar items: days left (negative when overdue). */
  remaining_days?: number;
}

/** A meter item is due soon within this share of its interval. */
export const METER_DUE_SOON_SHARE = 0.1;
/** A calendar item is due soon within this many days. */
export const CALENDAR_DUE_SOON_DAYS = 30;

interface HoursFlight {
  start_time: number;
  end_time?: number | null;
  points?: { t: number }[];
}

/** A flight's hours: to its end, or for one in progress, to its newest point. */
export function flightHours(f: HoursFlight): number {
  const pts = f.points;
  const endTime = (f.end_time !== null && f.end_time !== undefined)
    ? f.end_time
    : (pts && pts.length > 0 ? Math.max(...pts.map(p => p.t)) : f.start_time);
  return (endTime - f.start_time) / 3600;
}

/**
 * The estimated current reading of a meter: the recorded reading plus the tail's flight
 * hours since it was taken, times the correction factor (1 when unset). Null when no
 * reading is recorded.
 */
export function estimatedMeter(
  recordedValue: number | null | undefined,
  recordedAt: number | null | undefined,
  correctionFactor: number | null | undefined,
  tail: string,
  flights: (HoursFlight & { aircraft_tail?: string | null })[],
): number | null {
  if (recordedValue === null || recordedValue === undefined ||
      recordedAt === null || recordedAt === undefined) return null;
  const cf = (correctionFactor !== null && correctionFactor !== undefined) ? correctionFactor : 1.0;
  const hours = flights
    .filter(f => f.aircraft_tail === tail && f.start_time >= recordedAt)
    .reduce((s, f) => s + flightHours(f), 0);
  return recordedValue + cf * hours;
}

/**
 * A calendar item's due date: the end (23:59:59, operator time) of the last day of the
 * month intervalMonths after the operator month it was last done in. Returns the epoch and
 * that month.
 */
export function calendarDueDate(tz: string, lastDoneAt: number, intervalMonths: number): { at: number; year: number; month: number } {
  const [y, m] = unixToTzDateStr(tz, lastDoneAt).split('-').map(Number);
  const [year, month] = tzAddMonths(y, m, intervalMonths);
  return { at: tzDayEndUnix(tz, year, month, tzDaysInMonth(year, month)), year, month };
}

/** A schedule item's status, from the estimated meters (null when not recorded) or the calendar. */
export function maintenanceStatus(tz: string, now: number, item: MaintenanceItem,
                                  estHobbs: number | null, estTach: number | null): MaintenanceStatus {
  if (item.schedule_type === 'hobbs' || item.schedule_type === 'tach') {
    const est = item.schedule_type === 'hobbs' ? estHobbs : estTach;
    if (est === null) {
      return { status: 'timer_not_recorded', due_label: (item.schedule_type === 'hobbs' ? 'Hobbs' : 'Tach') + ' not recorded' };
    }
    // An item saved without an interval reads NaN ("Due in NaN hr", status ok), as it always has.
    const interval = item.interval_hours as number;
    const due = (item.last_done_value || 0) + interval;
    const rem = due - est;
    const threshold = interval * METER_DUE_SOON_SHARE;
    const status = rem < 0 ? 'overdue' : rem <= threshold ? 'due_soon' : 'ok';
    const label = rem < 0
      ? 'Overdue ' + Math.abs(rem).toFixed(1) + ' hr'
      : 'Due in ' + rem.toFixed(1) + ' hr';
    return { status, remaining_hours: rem, due_label: label };
  }
  if (item.last_done_at == null) {
    return { status: 'timer_not_recorded', due_label: 'Last service date not set' };
  }
  const due = calendarDueDate(tz, item.last_done_at, item.interval_months as number);
  const remDays = (due.at - now) / 86400;
  const status = remDays < 0 ? 'overdue' : remDays <= CALENDAR_DUE_SOON_DAYS ? 'due_soon' : 'ok';
  const label = remDays < 0
    ? 'Overdue ' + Math.round(Math.abs(remDays)) + ' days'
    : 'Due ' + tzShortMonthLabel(due.year, due.month);
  return { status, remaining_days: remDays, due_label: label };
}
