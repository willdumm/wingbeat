/**
 * Calendar helpers in the app's configured timezone (APP_SETTINGS.timezone): local
 * dates, months and times of an epoch, and the epoch of a local date and time; plus
 * date-key arithmetic and labels and H:MM durations. Used by the shared filters, the
 * analytics buckets, the flight form and editor and the duty log. Pure, so the docs-site
 * showcase (src/showcase/) and the tests can include them without the pages around them.
 */
export function tzCalendarScript(): string {
  return `
    // One formatter per timezone: building an Intl.DateTimeFormat is far slower than
    // formatting with one.
    const _tzPartsFmts = {};
    function _tzParts(unix) {
      const tz = window.APP_SETTINGS.timezone;
      const fmt = _tzPartsFmts[tz] || (_tzPartsFmts[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }));
      const p = {};
      for (const { type, value } of fmt.formatToParts(new Date(unix * 1000))) p[type] = value;
      return p;
    }

    // Seconds the timezone is ahead of UTC at an instant.
    function _tzOffsetAt(unix) {
      const p = _tzParts(unix);
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000 - unix;
    }

    // The epoch of local date (YYYY-MM-DD) and time (HH:MM, default midnight).
    function tzLocalToEpoch(dateKey, hhmm = '00:00') {
      const [y, m, d] = dateKey.split('-').map(Number);
      const [h, mi] = hhmm.split(':').map(Number);
      const asUtc = Date.UTC(y, m - 1, d, h, mi) / 1000;
      return asUtc - _tzOffsetAt(asUtc - _tzOffsetAt(asUtc));
    }

    function tzDayStartUnix(y, m, d) {
      const ref = Date.UTC(y, m - 1, d, 9, 0, 0) / 1000;
      return Date.UTC(y, m - 1, d) / 1000 - _tzOffsetAt(ref);
    }

    function tzDayEndUnix(y, m, d) {
      const ref = Date.UTC(y, m - 1, d, 20, 0, 0) / 1000;
      return Date.UTC(y, m - 1, d, 23, 59, 59) / 1000 - _tzOffsetAt(ref);
    }

    // YYYY-MM-DD of an epoch.
    function unixToTzDateStr(unix) {
      const p = _tzParts(unix);
      return p.year + '-' + p.month + '-' + p.day;
    }

    // YYYY-MM of an epoch.
    function unixToTzMonthKey(unix) {
      const p = _tzParts(unix);
      return p.year + '-' + p.month;
    }

    // HH:MM (24-hour) of an epoch.
    function unixToTzTime(unix) {
      const p = _tzParts(unix);
      return p.hour + ':' + p.minute;
    }

    // ── Date keys (YYYY-MM-DD, no timezone involved) and durations ──

    const _TZ_DAY_NAMES  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const _TZ_MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // The date key n days after dateKey (before it for a negative n).
    function tzAddDays(dateKey, n) {
      const [y, m, d] = dateKey.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
    }
    function tzDateKey(y, m, d) {
      return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    // [year, month] n months after month m of year y.
    function tzAddMonths(y, m, n) {
      const t = y * 12 + (m - 1) + n;
      return [Math.floor(t / 12), t % 12 + 1];
    }
    // "Mon Oct 3"
    function tzDateLabel(dateKey) {
      const [y, m, d] = dateKey.split('-').map(Number);
      return _TZ_DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + ' ' + _TZ_MONTH_ABBR[m - 1] + ' ' + d;
    }
    // "Oct 3" (with the year when it isn't sameYear)
    function tzShortDate(dateKey, sameYear) {
      const [y, m, d] = dateKey.split('-').map(Number);
      return _TZ_MONTH_ABBR[m - 1] + ' ' + d + (y === sameYear ? '' : ', ' + y);
    }

    // H:MM, rounded down to the minute; up: rounded up instead, for an amount over a
    // limit, so 8:00:40 against an 8:00 limit reads 8:01, not 8:00. (Rounding down is right
    // for an amount under a minimum: 9:59:30 of rest reads 9:59.)
    function fmtDuration(secs, up) {
      const mins = up ? Math.ceil(secs / 60) : Math.floor(secs / 60);
      return Math.floor(mins / 60) + ':' + String(mins % 60).padStart(2, '0');
    }
  `;
}
