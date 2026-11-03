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
import * as duty from '@wingbeat/core/duty';
import type { ComputeDutyDataOptions, DutyDay, DutyInputFlight, DutyInterval, DutyTotalsOptions } from '@wingbeat/core/duty';
import { createApiClient } from '@wingbeat/core/api/client';
import { getDutyLog, getDutyMethods } from '@wingbeat/core/api/duty';
import { createFlightStore, flightCorrectionKey, mergeFlightCorrections, FLIGHT_STORE_KEY } from '@wingbeat/core/flight-store';
import { SPEED_THRESHOLD_KMH } from '../geo';

declare const window: {
  APP_SETTINGS: { timezone: string };
  addEventListener(type: 'storage', listener: (e: { key: string | null }) => void): void;
};
declare const localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };

// Read on every call: the settings modal can change the timezone without a reload.
const tz = () => window.APP_SETTINGS.timezone;
// The clock, in Unix seconds (tests set the page's Date.now()).
const now = () => Math.floor(Date.now() / 1000);

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
  // ── duty: the §135.267 duty log's rows, warnings and totals ──
  _DUTY_LIMITS: duty.DUTY_LIMITS,
  DUTY_TOTALS_FOOTNOTE: duty.DUTY_TOTALS_FOOTNOTE,
  currentDutyMonth: () => duty.currentDutyMonth(tz(), now()),
  dutyPeriodLabel: duty.dutyPeriodLabel,
  dutyRangeLabel: duty.dutyRangeLabel,
  dutyEntryOn: duty.dutyEntryOn,
  dutyDefaultOn: duty.dutyDefaultOn,
  dutyMethodOn: duty.dutyMethodOn,
  computeDutyData: (allFlights: DutyInputFlight[], pilotId: number, pilotName: string, year: number, month: number,
                    opts?: ComputeDutyDataOptions) =>
    duty.computeDutyData(tz(), now(), allFlights, pilotId, pilotName, year, month, opts),
  dutyTotals: (flights: DutyInputFlight[], pilotId: number, asOf: number, opts?: DutyTotalsOptions) =>
    duty.dutyTotals(tz(), flights, pilotId, asOf, opts),
  dutyDayText: (day: { rest: boolean; restDesignatedAt: number | null; duty: DutyInterval | null; defaultDuty: boolean }, year: number) =>
    duty.dutyDayText(tz(), day, year),
  dutySaveConfirmText: (records: DutyDay[], keys: string[], values: Parameters<typeof duty.dutySaveConfirmText>[3]) =>
    duty.dutySaveConfirmText(tz(), records, keys, values),
  dutyRemarksText: duty.dutyRemarksText,
  dutyExportPresets: duty.dutyExportPresets,
});

// ── flight-store: the page's one store, cached in localStorage ──
// The page's API client. Warn-only: a response that doesn't match its schema is logged and
// used anyway, until a release shows no mismatches (docs/mobile-app-plan.md, "The API
// contract"). Same-origin, so the session cookie goes with it.
const api = createApiClient({ mismatch: 'warn' });

Object.assign(globalThis, {
  // The duty log's reads (the duty route group).
  fetchDutyLog: (pilotId: number | string) => getDutyLog(api, pilotId),
  fetchDutyMethods: () => getDutyMethods(api),
  flightCorrectionKey,
  mergeFlightCorrections,
  flightStore: createFlightStore({
    // Read when used, not now: tests swap the page's localStorage.
    storage: {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    },
    client: api,
    flightThresholdKmh: SPEED_THRESHOLD_KMH,
    // Another tab saved its copy.
    watchExternalChanges: (onChange) => window.addEventListener('storage', (e) => {
      if (e.key === FLIGHT_STORE_KEY) onChange();
    }),
  }),
});
