/**
 * The settings modal's logic: the tracker history import's month windows and default start
 * date, in operator days, and the warning before a timezone change moves the duty log's
 * records (docs/mobile-app-plan.md, "Times and the operator's timezone"). The modal itself,
 * and its requests (api/settings.ts, api/trackers.ts, …), stay with the page.
 */
import { tzAddMonths, tzDateKey, tzShortMonthLabel, unixToTzDateStr } from './time';

/** One import request: d1 to d2 (YYYY-MM-DD; d2 null: to now), labeled with d1's month ("Oct 2026"). */
export interface ImportWindow {
  d1: string;
  d2: string | null;
  label: string;
}

/**
 * The windows that import a tracker's history from the date key from to today (the
 * operator's): from to the first of the next month, then a month at a time, the last one
 * open-ended. Oldest first, since the feed returns everything after d1 when it isn't
 * bounded. Empty when from is after today.
 */
export function importWindows(tz: string, now: number, from: string): ImportWindow[] {
  const today = unixToTzDateStr(tz, now);
  const windows: ImportWindow[] = [];
  let start = from;
  while (start <= today) {
    const y = +start.slice(0, 4), m = +start.slice(5, 7);
    const [ny, nm] = tzAddMonths(y, m, 1);
    const next = tzDateKey(ny, nm, 1);
    windows.push({ d1: start, d2: next <= today ? next : null, label: tzShortMonthLabel(y, m) });
    start = next;
  }
  return windows;
}

/** The import form's default start: a year before today (Feb 29 → Mar 1). */
export function importDefaultFrom(tz: string, now: number): string {
  const [y, m, d] = unixToTzDateStr(tz, now).split('-').map(Number);
  return new Date(Date.UTC(y - 1, m - 1, d)).toISOString().slice(0, 10);
}

/** The duty records a timezone change would move (GET /api/settings/duty-records). */
export interface DutyRecordCounts {
  duty_days: number;
  default_duties: number;
}

const plural = (n: number, one: string, many: string) => n.toLocaleString('en-US') + ' ' + (n === 1 ? one : many);

/**
 * What Global Settings asks before saving the timezone `to` in place of `from`, or null when
 * there's nothing to warn about (the same zone, or no duty records). Duty days and default
 * duties are stored as dates and wall-clock times in the operator's timezone, so a change
 * re-reads them in the new one.
 */
export function timezoneChangeWarning(from: string, to: string, counts: DutyRecordCounts): string | null {
  if (from === to) return null;
  const parts: string[] = [];
  if (counts.duty_days) parts.push(plural(counts.duty_days, 'duty day', 'duty days'));
  if (counts.default_duties) parts.push(plural(counts.default_duties, 'default duty entry', 'default duty entries'));
  if (!parts.length) return null;
  return 'The duty log has ' + parts.join(' and ') + ', stored as dates and times in ' + from + '. ' +
    'After the change they’re read in ' + to + ': a duty start of 08:00 stays 08:00, now in ' + to +
    ', and flights near midnight can move to a different day, which changes that day’s flight time and rest. ' +
    'Change the timezone to ' + to + ' anyway?';
}
