/**
 * The text of a record's edit history in the flight form and the duty log's forms
 * (src/shared/edit-history.ts): the "Last changed by …" line, from GET /api/edit-history
 * (the edit_history triggers of migration 0002), and what a form shows when a save is
 * refused because the record changed since it loaded it (409, "Edit conflicts" in
 * src/index.ts). Times are in the operator's timezone, tz.
 */
import { tzDateLabel, unixToTzDateStr, unixToTzTime } from './time';
import type { EditHistoryRow } from './api/edit-history';

/**
 * "Changed by <user> since this was loaded (<date> <time>)." for an edit conflict
 * ({ at, user_name }: the server's 409, or a newer history row than the form's data).
 */
export function editConflictText(tz: string, conflict: { at: number; user_name?: string | null }): string {
  return 'Changed by ' + (conflict.user_name || 'an unknown user') + ' since this was loaded (' +
    tzDateLabel(unixToTzDateStr(tz, conflict.at)) + ' ' + unixToTzTime(tz, conflict.at) + ').';
}

/**
 * "Pilot last changed", "Aircraft last changed" or both, for a flight_assignment history
 * row (before/after: { pilot_id, aircraft_tail } as JSON).
 */
export function editAssignmentChanged(h: { before?: string | null; after?: string | null }): string {
  let before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  try { before = JSON.parse(h.before as string) || {}; after = JSON.parse(h.after as string) || {}; } catch (_) {}
  const aircraft = before.aircraft_tail !== after.aircraft_tail, pilot = before.pilot_id !== after.pilot_id;
  return (aircraft && pilot ? 'Aircraft and pilot' : aircraft ? 'Aircraft' : pilot ? 'Pilot' : 'Aircraft or pilot') + ' last changed';
}

/**
 * "Last changed by <user>, <date> <time>." for a record's newest history row h (prev: the
 * one before it). An aircraft/pilot change on its own says which; one saved together with
 * the flight's corrections (the flight form writes both in one batch) is a plain change.
 */
export function lastEditText(tz: string, h: EditHistoryRow, prev?: EditHistoryRow | null): string {
  const withPrev = prev && prev.entity !== h.entity && prev.at === h.at && prev.user_id === h.user_id;
  return (h.entity === 'flight_assignment' && !withPrev ? editAssignmentChanged(h) : 'Last changed') +
    ' by ' + (h.user_name || 'an unknown user') + ', ' +
    tzDateLabel(unixToTzDateStr(tz, h.at)) + ' ' + unixToTzTime(tz, h.at) + '.';
}
