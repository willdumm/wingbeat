/**
 * The browser entry of @wingbeat/core (built by scripts/build-core.mjs). It assigns the
 * core functions to the global names the pages' inline scripts already call, so a script
 * string's logic can move to core without its callers changing. Glue only: anything that
 * reads the page (window.APP_SETTINGS, the clock) is bound here, and core itself takes it
 * as a parameter.
 *
 * Pages load it through coreBundleScript() (src/shared/core-bundle.ts), before their own
 * script.
 */
import * as flightEdits from '@wingbeat/core/flight-edits';
import type { FlightCorrection, FlightEditField } from '@wingbeat/core/flight-edits';
import * as time from '@wingbeat/core/time';

declare const window: { APP_SETTINGS: { timezone: string } };

// Read on every call: the settings modal can change the timezone without a reload.
const tz = () => window.APP_SETTINGS.timezone;

Object.assign(globalThis, {
  // ── time: in the operator's timezone ──
  tzLocalToEpoch: (dateKey: string, hhmm?: string) => time.tzLocalToEpoch(tz(), dateKey, hhmm),
  tzDayStartUnix: (y: number, m: number, d: number) => time.tzDayStartUnix(tz(), y, m, d),
  tzDayEndUnix: (y: number, m: number, d: number) => time.tzDayEndUnix(tz(), y, m, d),
  unixToTzDateStr: (unix: number) => time.unixToTzDateStr(tz(), unix),
  unixToTzMonthKey: (unix: number) => time.unixToTzMonthKey(tz(), unix),
  unixToTzTime: (unix: number) => time.unixToTzTime(tz(), unix),
  tzAbbrev: (unix: number) => time.tzAbbrev(tz(), unix),
  fmtTzTime: (unix: number) => time.fmtTzTime(tz(), unix),
  // ── time: date keys and durations ──
  tzAddDays: time.tzAddDays,
  tzDateKey: time.tzDateKey,
  tzAddMonths: time.tzAddMonths,
  tzDateLabel: time.tzDateLabel,
  tzLongDateLabel: time.tzLongDateLabel,
  tzShortDate: time.tzShortDate,
  fmtDuration: time.fmtDuration,
  // ── flight-edits: corrections applied to tracked flights, the flight form ──
  FLIGHT_EDIT_FIELDS: flightEdits.FLIGHT_EDIT_FIELDS,
  FLIGHT_EDIT_FIELD_NAMES: flightEdits.FLIGHT_EDIT_FIELD_NAMES,
  FLIGHT_CONFIRM_SECS: flightEdits.FLIGHT_CONFIRM_SECS,
  FLIGHT_MAX_SECS: flightEdits.FLIGHT_MAX_SECS,
  applyFlightEdits: flightEdits.applyFlightEdits,
  flightRemarks: flightEdits.flightRemarks,
  flightFieldEdited: flightEdits.flightFieldEdited,
  flightEntrySummary: (e: FlightCorrection) => flightEdits.flightEntrySummary(tz(), e),
  flightOriginalText: (field: FlightEditField, value: unknown) => flightEdits.flightOriginalText(tz(), field, value),
  flightFormTimes: (dateKey: string, dep: string, arr: string) => flightEdits.flightFormTimes(tz(), dateKey, dep, arr),
  flightTrackedTimes: flightEdits.flightTrackedTimes,
});
