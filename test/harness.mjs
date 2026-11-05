// Test harness for the client-side scripts that live inside TypeScript template strings
// (htmlEscapeScript(), flightEditsScript(), pilotDutyRenderScript(),
// editHistoryScript(), filterScript()).
// tsc can't see into those strings, so the tests run the real script text instead:
//
//   1. esbuild bundles a tiny in-memory entry that re-exports the script-string functions
//      and the @wingbeat/core browser bundle (nothing is written to disk), the same way
//      site/scripts/build-showcase.mjs does;
//   2. the core bundle runs first, as on the pages, then the scripts' text is concatenated and evaluated in a node:vm context with a stub
//      window (APP_SETTINGS) and no DOM, the same order the pages ship them;
//   3. the context's Date.now() reads a settable clock, so "today", the current month and
//      the "as of now" totals are deterministic.
//
// Values created inside the vm context belong to another realm (their Array/Object
// prototypes differ), so compare structures through plain() (test/core.mjs) rather than
// deepStrictEqual on them directly.
//
// Core's own logic is tested by importing it directly (test/core.mjs, and the duty spec
// tests' test/duty-fixtures.mjs). What runs here is what's still a script string, and each
// core-* test's check that the bundle's page globals bind the timezone and the clock.

import { build } from 'esbuild';
import { coreBundlePlugin } from '../scripts/build-core.mjs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TZ } from './core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bundle = await build({
  stdin: {
    contents: `
      export { coreBundle } from './src/shared/core-bundle';
      export { htmlEscapeScript } from './src/shared/html';
      export { flightEditsScript } from './src/shared/flight-edits';
      export { pilotDutyRenderScript } from './src/shared/pilot-duty';
      export { editHistoryScript } from './src/shared/edit-history';
      export { filterScript } from './src/shared/filters';
    `,
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  loader: { '.svg': 'text' },
  plugins: [coreBundlePlugin()],
  logLevel: 'warning',
});
const scripts = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

export const { coreBundle } = scripts;

// Everything the tests reach for, by name. Top-level const/let in the scripts aren't
// properties of the context's global object, so they're collected by a script evaluated
// in the same context.
const EXPORTS = [
  // the core bundle (@wingbeat/core/time)
  'tzLocalToEpoch', 'unixToTzDateStr', 'unixToTzTime', 'tzAddDays', 'fmtTzTime',
  // the core bundle (@wingbeat/core/flight-edits)
  'applyFlightEdits', 'flightRemarks', 'flightEntrySummary', 'flightFormTimes',
  // flight-edits.ts
  'flightEditedMark', 'flightRemarksHtml',
  // the core bundle (@wingbeat/core/duty)
  'computeDutyData',
  // pilot-duty.ts
  '_buildTypstSource',
  // the core bundle (@wingbeat/core/corrections, edit-history)
  'readFlightForm', 'flightFormTimesOf', 'lastEditText',
  // filters.ts
  'filterStore',
  // the core bundle (@wingbeat/core/live, maintenance, alerts)
  'isInFlight', 'isGpsFresh', 'nextLivePoll', '_maintenanceStatus', '_estimatedMeter', 'computeAlertsFor',
  // the core bundle (@wingbeat/core/regions, accounting, analytics)
  'haversineKm', 'homeBaseNamesIn', 'computeRegionHoursIn', 'computeMonthlyAccountingIn', 'tzLongMonthLabel',
  'sgGenerateBuckets', 'sgComputeDataIn', 'interpolateRoutePoints', 'endpointHeatPointsIn',
  // the core bundle (@wingbeat/core/elevation)
  'latLngToTilePixel', 'decodeTerrarium', 'demSubTile', 'paintElevationTint',
  // the core bundle (@wingbeat/core/settings, time's date formats)
  'trackerImportWindows', 'trackerImportDefaultFrom', 'timezoneChangeWarning', 'fmtTzDate', 'fmtTzDateTime',
];

/**
 * A fresh vm context with the scripts loaded. settings are merged into APP_SETTINGS;
 * now is the clock's start (a Date, epoch ms, or 'YYYY-MM-DD HH:MM' local to the
 * timezone). Returns the exported functions plus setNow() and storage (the Map behind
 * localStorage).
 */
export function loadEngine({ settings = {}, now = '2026-10-15 12:00' } = {}) {
  const clock = { ms: 0 };
  const storage = new Map();
  const context = vm.createContext({
    window: {
      APP_SETTINGS: { timezone: TZ, appName: 'Test', ...settings },
      addEventListener: () => {},
    },
    localStorage: {
      getItem: (k) => storage.has(k) ? storage.get(k) : null,
      setItem: (k, v) => { storage.set(k, String(v)); },
      removeItem: (k) => { storage.delete(k); },
    },
    fetch: () => Promise.reject(new Error('no fetch in this engine')),
    console,
    __clock: clock,
  });
  vm.runInContext('Date.now = () => __clock.ms;', context);
  const source = [
    scripts.coreBundle,
    scripts.htmlEscapeScript(),
    scripts.flightEditsScript(),
    scripts.pilotDutyRenderScript(),
    scripts.editHistoryScript(),
    scripts.filterScript(),
  ].join('\n');
  vm.runInContext(source, context, { filename: 'engine.js' });
  const api = vm.runInContext(`({ ${EXPORTS.join(', ')} })`, context);

  function setNow(when) {
    clock.ms = typeof when === 'string' ? api.tzLocalToEpoch(...splitLocal(when)) * 1000
      : when instanceof Date ? when.getTime() : when;
  }
  setNow(now);
  return { ...api, setNow, context, storage };
}

function splitLocal(s) {
  const [date, time = '00:00'] = s.trim().split(/\s+/);
  return [date, time];
}
