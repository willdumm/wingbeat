/**
 * Calendar helpers in the app's configured timezone (APP_SETTINGS.timezone): local
 * dates, months and times of an epoch, and the epoch of a local date and time. Used by
 * the shared filters, the analytics buckets and the duty log. Pure, so the docs-site
 * showcase (src/showcase/) can include them without the pages around them.
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
  `;
}
