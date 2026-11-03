/**
 * Limits on flight corrections and duty days, shared by the server's validation
 * (src/index.ts) and the forms that write them (flight-editor.ts, pilot-duty.ts), so the
 * two can't disagree.
 */

/** Most days one duty-day request (the day form's Through range) may set or clear. */
export const MAX_DUTY_DAYS_PER_REQUEST = 366;

/** Longest origin/destination label or remark on a flight correction, in characters. */
export const MAX_FLIGHT_TEXT_LENGTH = 200;

/** Longest duty-day note, in characters. */
export const MAX_DUTY_NOTE_LENGTH = 1000;

/**
 * Longest flight, in seconds: a correction or manual flight whose arrival is more than
 * this after its departure is refused (the flight form reads an arrival before the
 * departure as the next day, so a mistyped time otherwise saves a day-long flight).
 */
export const MAX_FLIGHT_SECS = 24 * 3600;
