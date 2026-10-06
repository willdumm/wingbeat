/**
 * Calendar helpers in the app's configured timezone (APP_SETTINGS.timezone), used to
 * bucket flights by local day/month. Pure, so the docs-site showcase (src/showcase/)
 * can include them without the rest of the analytics page.
 */
export function analyticsScriptsTime(): string {
  return `
    function getTzOffset(refUTC) {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: window.APP_SETTINGS.timezone,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
      });
      const parts = Object.fromEntries(
        fmt.formatToParts(refUTC).filter(p => p.type !== 'literal').map(p => [p.type, +p.value])
      );
      return (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second) - refUTC.getTime()) / 1000;
    }

    function tzDayStartUnix(y, m, d) {
      const ref = new Date(Date.UTC(y, m - 1, d, 9, 0, 0));
      return Math.floor(Date.UTC(y, m - 1, d) / 1000) - getTzOffset(ref);
    }

    function tzDayEndUnix(y, m, d) {
      const ref = new Date(Date.UTC(y, m - 1, d, 20, 0, 0));
      return Math.floor(Date.UTC(y, m - 1, d, 23, 59, 59) / 1000) - getTzOffset(ref);
    }

    function unixToTzDateStr(unix) {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: window.APP_SETTINGS.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      });
      const parts = Object.fromEntries(
        fmt.formatToParts(new Date(unix * 1000)).filter(p => p.type !== 'literal').map(p => [p.type, p.value])
      );
      return parts.year + '-' + parts.month + '-' + parts.day;
    }

    function unixToTzMonthKey(unix) {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: window.APP_SETTINGS.timezone, year: 'numeric', month: '2-digit',
      });
      const parts = fmt.formatToParts(new Date(unix * 1000));
      const y = parts.find(p => p.type === 'year').value;
      const mo = parts.find(p => p.type === 'month').value;
      return y + '-' + mo;
    }
  `;
}
