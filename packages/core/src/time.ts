/**
 * Calendar helpers in the operator's timezone (the tenant's `timezone` setting, an IANA
 * zone passed in as `tz`): local dates, months and times of an epoch, the epoch of a local
 * date and time, and the one way to show a time, with its zone abbreviation. Plus date-key
 * arithmetic and labels and H:MM durations, which involve no timezone.
 *
 * Epochs are Unix seconds. Date keys are 'YYYY-MM-DD' operator days.
 */

// One formatter per timezone: building an Intl.DateTimeFormat is far slower than
// formatting with one.
const partsFmts = new Map<string, Intl.DateTimeFormat>();
const abbrevFmts = new Map<string, Intl.DateTimeFormat>();

type Parts = { year: string; month: string; day: string; hour: string; minute: string; second: string };

function tzParts(tz: string, unix: number): Parts {
  let fmt = partsFmts.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    partsFmts.set(tz, fmt);
  }
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(unix * 1000)) p[type] = value;
  return p as Parts;
}

/** Seconds the timezone is ahead of UTC at an instant. */
export function tzOffsetAt(tz: string, unix: number): number {
  const p = tzParts(tz, unix);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000 - unix;
}

/** The epoch of local date (YYYY-MM-DD) and time (HH:MM, default midnight). */
export function tzLocalToEpoch(tz: string, dateKey: string, hhmm = '00:00'): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, h, mi) / 1000;
  return asUtc - tzOffsetAt(tz, asUtc - tzOffsetAt(tz, asUtc));
}

/** The first second of a local day. Where DST starts at midnight (Havana), that's the end of the gap. */
export function tzDayStartUnix(tz: string, y: number, m: number, d: number): number {
  const key = new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  const t = tzLocalToEpoch(tz, key);
  return unixToTzDateStr(tz, t) === key ? t : t + tzOffsetAt(tz, t + 86400) - tzOffsetAt(tz, t);
}

/** The last second of a local day: the next day's start, less one. */
export function tzDayEndUnix(tz: string, y: number, m: number, d: number): number {
  return tzDayStartUnix(tz, y, m, d + 1) - 1;
}

/** YYYY-MM-DD of an epoch: its operator day. */
export function unixToTzDateStr(tz: string, unix: number): string {
  const p = tzParts(tz, unix);
  return p.year + '-' + p.month + '-' + p.day;
}

/** YYYY-MM of an epoch. */
export function unixToTzMonthKey(tz: string, unix: number): string {
  const p = tzParts(tz, unix);
  return p.year + '-' + p.month;
}

/** HH:MM (24-hour) of an epoch, without the zone (for inputs and tables that say it once). */
export function unixToTzTime(tz: string, unix: number): string {
  const p = tzParts(tz, unix);
  return p.hour + ':' + p.minute;
}

/**
 * The zone's abbreviation at an instant: 'AKDT' in July and 'AKST' in January for
 * America/Anchorage. A zone without a common abbreviation in en-US shows its offset
 * ('GMT+2').
 */
export function tzAbbrev(tz: string, unix: number): string {
  let fmt = abbrevFmts.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' });
    abbrevFmts.set(tz, fmt);
  }
  return fmt.formatToParts(unix * 1000).find(p => p.type === 'timeZoneName')?.value ?? tz;
}

/** "14:05 AKDT": a time of day as lists, cards, popups and alerts show it. */
export function fmtTzTime(tz: string, unix: number): string {
  return unixToTzTime(tz, unix) + ' ' + tzAbbrev(tz, unix);
}

/** "Oct 3, 14:05:09 AKDT": a track point's time, to the second (the map's tooltips). */
export function fmtTzPointTime(tz: string, unix: number): string {
  const p = tzParts(tz, unix);
  return MONTH_ABBR[+p.month - 1] + ' ' + +p.day + ', ' + p.hour + ':' + p.minute + ':' + p.second + ' ' + tzAbbrev(tz, unix);
}

/** "Oct 3, 2026": an instant's operator day, with its year (Settings' last seen and expiry dates). */
export function fmtTzDate(tz: string, unix: number): string {
  const p = tzParts(tz, unix);
  return MONTH_ABBR[+p.month - 1] + ' ' + +p.day + ', ' + p.year;
}

/** "Oct 3, 2026, 14:05 AKDT": an instant as a date and time, for a one-off event (a webhook's last delivery). */
export function fmtTzDateTime(tz: string, unix: number): string {
  return fmtTzDate(tz, unix) + ', ' + fmtTzTime(tz, unix);
}

// ── Date keys (YYYY-MM-DD, no timezone involved) and durations ──

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

/** The date key n days after dateKey (before it for a negative n). */
export function tzAddDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function tzDateKey(y: number, m: number, d: number): string {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/** [year, month] n months after month m of year y. */
export function tzAddMonths(y: number, m: number, n: number): [number, number] {
  const t = y * 12 + (m - 1) + n;
  return [Math.floor(t / 12), t % 12 + 1];
}

function weekday(y: number, m: number, d: number): string {
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** "Mon Oct 3" */
export function tzDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return weekday(y, m, d) + ' ' + MONTH_ABBR[m - 1] + ' ' + d;
}

/** "Mon, Oct 3, 2026" */
export function tzLongDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return weekday(y, m, d) + ', ' + MONTH_ABBR[m - 1] + ' ' + d + ', ' + y;
}

/** "Oct 3" (with the year when it isn't sameYear) */
export function tzShortDate(dateKey: string, sameYear?: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return MONTH_ABBR[m - 1] + ' ' + d + (y === sameYear ? '' : ', ' + y);
}

/** "Oct 2026" */
export function tzShortMonthLabel(y: number, m: number): string {
  return MONTH_ABBR[m - 1] + ' ' + y;
}

/** "Oct 26", for a chart axis */
export function tzAxisMonthLabel(y: number, m: number): string {
  return MONTH_ABBR[m - 1] + ' ' + String(y % 100).padStart(2, '0');
}

/** "October 2026" */
export function tzLongMonthLabel(y: number, m: number): string {
  return MONTH_NAMES[m - 1] + ' ' + y;
}

/** The weekday of a date key, 0 (Sunday) to 6. */
export function tzWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The number of days in month m (1-12) of year y. */
export function tzDaysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * H:MM, rounded down to the minute; up: rounded up instead, for an amount over a limit,
 * so 8:00:40 against an 8:00 limit reads 8:01, not 8:00. (Rounding down is right for an
 * amount under a minimum: 9:59:30 of rest reads 9:59.)
 */
export function fmtDuration(secs: number, up?: boolean): string {
  const mins = up ? Math.ceil(secs / 60) : Math.floor(secs / 60);
  return Math.floor(mins / 60) + ':' + String(mins % 60).padStart(2, '0');
}
