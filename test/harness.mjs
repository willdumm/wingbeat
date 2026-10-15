// Test harness for the client-side scripts that live inside TypeScript template strings
// (pilotDutyRenderScript(), flightEditsScript(), tzCalendarScript(), flightStoreScript()).
// tsc can't see into those strings, so the tests run the real script text instead:
//
//   1. esbuild bundles a tiny in-memory entry that re-exports the script-string functions
//      (nothing is written to disk), the same way site/scripts/build-showcase.mjs does;
//   2. the scripts' text is concatenated and evaluated in a node:vm context with a stub
//      window (APP_SETTINGS) and no DOM, the same order the pages ship them;
//   3. the context's Date.now() reads a settable clock, so "today", the current month and
//      the "as of now" totals are deterministic.
//
// Values created inside the vm context belong to another realm (their Array/Object
// prototypes differ), so compare structures through plain() rather than deepStrictEqual
// on them directly.

import { build } from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bundle = await build({
  stdin: {
    contents: `
      export { tzCalendarScript } from './src/shared/time';
      export { flightEditsScript } from './src/shared/flight-edits';
      export { pilotDutyRenderScript } from './src/shared/pilot-duty';
      export { flightStoreScript } from './src/shared/flight-store';
    `,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  loader: { '.svg': 'text' },
  logLevel: 'warning',
});
const scripts = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

// Everything the tests reach for, by name. Top-level const/let in the scripts aren't
// properties of the context's global object, so they're collected by a script evaluated
// in the same context.
const EXPORTS = [
  // time.ts
  'tzLocalToEpoch', 'unixToTzDateStr', 'unixToTzTime', 'unixToTzMonthKey', 'tzDayStartUnix', 'tzDayEndUnix',
  // flight-edits.ts
  'applyFlightEdits', 'flightRemarks', 'flightEntrySummary',
  // pilot-duty.ts
  'computeDutyData', 'dutyTotals', 'fmtBlock', 'dutyAddDays', 'dutyDayText', 'currentDutyMonth', '_DUTY_LIMITS',
  // flight-store.ts
  'flightCorrectionKey', 'mergeFlightCorrections',
];

export const TZ = 'America/Anchorage';

/**
 * A fresh vm context with the scripts loaded. settings are merged into APP_SETTINGS;
 * now is the clock's start (a Date, epoch ms, or 'YYYY-MM-DD HH:MM' local to the
 * timezone). Returns the exported functions plus setNow().
 */
export function loadEngine({ settings = {}, now = '2026-10-15 12:00' } = {}) {
  const clock = { ms: 0 };
  const noop = () => {};
  const context = vm.createContext({
    window: {
      APP_SETTINGS: { timezone: TZ, dutyMethod: 'b', appName: 'Test', ...settings },
      addEventListener: noop,
    },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    console,
    __clock: clock,
  });
  vm.runInContext('Date.now = () => __clock.ms;', context);
  const source = [
    scripts.tzCalendarScript(),
    scripts.flightEditsScript(),
    scripts.pilotDutyRenderScript(),
    scripts.flightStoreScript(),
  ].join('\n');
  vm.runInContext(source, context, { filename: 'engine.js' });
  const api = vm.runInContext(`({ ${EXPORTS.join(', ')} })`, context);

  function setNow(when) {
    clock.ms = typeof when === 'string' ? api.tzLocalToEpoch(...splitLocal(when)) * 1000
      : when instanceof Date ? when.getTime() : when;
  }
  setNow(now);
  return { ...api, setNow, context };
}

/** A deep copy in this realm (JSON round trip), for deepStrictEqual. */
export function plain(x) {
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
}

function splitLocal(s) {
  const [date, time = '00:00'] = s.trim().split(/\s+/);
  return [date, time];
}

/**
 * Fixture builders bound to an engine: local times are 'YYYY-MM-DD HH:MM' in TZ.
 *
 *   flight('2026-03-10 09:00', '11:30', { pilot: 1, part91, unpaid, manual })
 *
 * An arrival given as 'HH:MM' is on the departure's date, or the next day when it isn't
 * after the departure. The result is an effective flight, as applyFlightEdits() returns
 * it: a part91/unpaid/manual flight carries an edit.
 */
export function fixtures(engine) {
  let nextId = 1;
  const at = (s) => engine.tzLocalToEpoch(...splitLocal(s));

  function arrival(dep, arr) {
    if (/^\d{4}-/.test(arr)) return at(arr);
    const [date, depTime] = splitLocal(dep);
    return arr > depTime ? at(date + ' ' + arr) : at(engine.dutyAddDays(date, 1) + ' ' + arr);
  }

  function flight(dep, arr, { pilot = 1, part91 = false, unpaid = false, manual = false, tracker = 1, id } = {}) {
    const f = {
      id: id ?? nextId++,
      tracker_id: manual ? null : tracker,
      start_time: at(dep),
      end_time: arrival(dep, arr),
      pilot_id: pilot,
      aircraft_tail: 'N123',
      origin_label: 'A',
      destination_label: 'B',
    };
    if (part91 || unpaid || manual) {
      f.edit = { entry: null, manual, part91: part91 || unpaid, unpaid, remark: null, excluded: false, original: {} };
    }
    return f;
  }

  /** A duty_days row with duty times. */
  function duty(date, start, end, { note = null } = {}) {
    return { date, duty_start: start, duty_end: end, rest: 0, rest_designated_at: null, note };
  }

  /** A duty_days rest row, designated at a local time (default: a week before). */
  function rest(date, { designated = engine.dutyAddDays(date, -7) + ' 12:00', note = null } = {}) {
    return { date, duty_start: null, duty_end: null, rest: 1, rest_designated_at: designated == null ? null : at(designated), note };
  }

  /**
   * computeDutyData for pilot 1 and the month of dateKey (any 'YYYY-MM…'), with the
   * opts computeDutyData takes (days, defaultDuty, method, unmatched).
   */
  function dutyMonth(flights, ym, opts = {}) {
    const [y, m] = ym.split('-').map(Number);
    return engine.computeDutyData(flights, 1, 'Pilot', y, m, opts);
  }

  /** The row for dateKey in a computeDutyData result (or its prevDay). */
  function dayOf(data, dateKey) {
    const d = data.prevDay.dateKey === dateKey ? data.prevDay : data.days.find(x => x.dateKey === dateKey);
    if (!d) throw new Error('no day ' + dateKey + ' in ' + data.year + '-' + data.month);
    return d;
  }

  /** dateKey's warnings for these flights and opts (in the month of dateKey). */
  function warningsOn(flights, dateKey, opts) {
    return [...dayOf(dutyMonth(flights, dateKey, opts), dateKey).warnings];
  }

  /** The warnings in list that match re. */
  const matching = (list, re) => [...list].filter(w => re.test(w));

  return { at, flight, duty, rest, dutyMonth, dayOf, warningsOn, matching };
}
