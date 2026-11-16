/**
 * The native date pickers take and give Dates on the phone's clock; the forms' dates and
 * times are the operator's wall-clock values, so they go through the phone's local time
 * unconverted (noon, and a day without a DST change, keep a date and time as typed).
 */
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
