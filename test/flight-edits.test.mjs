// Flight corrections on the page: the core bundle's flight-edits globals and the HTML
// built from them (flight-edits.ts), the flight store's flightCorrectionKey() /
// mergeFlightCorrections() (@wingbeat/core/flight-store), and a correction flowing through to the
// duty log (@wingbeat/core/flight-edits into @wingbeat/core/duty).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore, plain } from './core.mjs';
import { loadEngine } from './harness.mjs';
import { fixtures } from './duty-fixtures.mjs';

const { applyFlightEdits } = await importCore('flight-edits');
const { flightCorrectionKey, mergeFlightCorrections } = await importCore('flight-store');
const engine = loadEngine({ now: '2026-10-15 12:00' });
const { at, duty, dutyMonth, dayOf } = fixtures({ now: '2026-10-15 12:00' });

const ids = (list) => list.map(x => x.id);

// Tracker records as the flight store holds them.
function tracked(id, tracker, dep, arr, extra = {}) {
  return {
    id, tracker_id: tracker, start_time: at(dep), end_time: at(arr), modified_at: 100,
    origin_label: 'PAKN', destination_label: 'PADQ', pilot_id: 1, aircraft_tail: 'N1', points: [{}],
    ...extra,
  };
}
// A flight_corrections row: NULL fields mean "the tracker's value".
function entry(id, fields = {}) {
  return {
    id, tracker_id: null, flight_start_time: null, start_time: null, end_time: null,
    origin_label: null, destination_label: null, part91: 0, unpaid: 0, excluded: 0, remark: null,
    pilot_id: null, aircraft_tail: null, updated_at: 500, ...fields,
  };
}

// applyFlightEdits() and the rest of @wingbeat/core/flight-edits are tested in
// core-flight-edits.test.mjs. This checks the shipped browser bundle's globals and the
// HTML the script string builds from them.
describe('core bundle flight-edits globals', () => {
  const f1 = tracked(1, 10, '2026-03-10 09:00', '2026-03-10 10:00');

  test('applyFlightEdits, flightRemarks and flightFormTimes are on the page', () => {
    const e = entry(7, { tracker_id: 10, flight_start_time: f1.start_time, part91: 1, remark: 'Ferry' });
    assert.deepEqual([...engine.flightRemarks(engine.applyFlightEdits([f1], [e]).flights[0])], ['Part 91', 'Ferry']);
    assert.equal(engine.flightFormTimes('2026-03-10', '23:30', '00:45').end_time, at('2026-03-11 00:45'));
  });

  test('the timezone-taking ones read APP_SETTINGS.timezone', () => {
    const e = entry(7, { tracker_id: 10, flight_start_time: f1.start_time, start_time: at('2026-03-10 08:05'), part91: 1, excluded: 1 });
    assert.equal(engine.flightEntrySummary(e), 'Dep 08:05, Part 91, removed');
    const utc = loadEngine({ settings: { timezone: 'UTC' } });
    assert.equal(utc.flightEntrySummary(e), 'Dep 16:05, Part 91, removed');
    assert.equal(utc.flightFormTimes('2026-03-10', '09:00', '09:40').start_time, Date.UTC(2026, 2, 10, 9) / 1000);
  });

  test('flightEditedMark: † with the tracker’s values; flightRemarksHtml: the remarks line', () => {
    const e = entry(7, {
      tracker_id: 10, flight_start_time: f1.start_time,
      start_time: at('2026-03-10 08:45'), origin_label: 'PA<EN', part91: 1, remark: 'A & B',
    });
    const eff = engine.applyFlightEdits([f1], [e]).flights[0];
    assert.equal(engine.flightEditedMark(eff, ['start_time', 'end_time']),
      '<span class="flight-edited" title="Tracker: Dep 09:00">†</span>');
    assert.equal(engine.flightEditedMark(eff, ['end_time']), '');
    assert.equal(engine.flightEditedMark({ ...f1, origin_label: 'X', edit: { original: { origin_label: 'P<Q' } } }, ['origin_label']),
      '<span class="flight-edited" title="Tracker: Origin P&lt;Q">†</span>');
    assert.equal(engine.flightRemarksHtml(eff), '<div class="flight-remarks">Part 91 · A &amp; B</div>');
    assert.equal(engine.flightRemarksHtml(f1), '');
  });
});

describe('corrections in the duty log', () => {
  test('a corrected time and an unpaid Part 91 flag change the daily check', () => {
    const D = '2026-03-10';
    const flights = [
      tracked(1, 10, `${D} 07:00`, `${D} 11:00`),
      tracked(2, 10, `${D} 12:00`, `${D} 15:00`),
      tracked(3, 10, `${D} 05:00`, `${D} 06:30`),
    ];
    const days = [duty(D, '04:00', '17:00')];
    const run = (entries) => [...dayOf(dutyMonth(applyFlightEdits(flights, entries).flights, D, { days }), D).warnings];
    assert.deepEqual(run([]), ['8:30 flight time in the 24 h to 15:00 (§135.267(b) limit 8:00)']);
    assert.deepEqual(run([entry(5, { tracker_id: 10, flight_start_time: flights[2].start_time, part91: 1, unpaid: 1 })]), []);
    assert.deepEqual(run([entry(5, { tracker_id: 10, flight_start_time: flights[1].start_time, end_time: at(`${D} 14:00`) })]),
      ['7:30 flight time in the 24 h to 14:00 (§135.267(b) limit 8:00)'].slice(0, 0));
  });

  test('a removed flight is left out of the log and totals', () => {
    const D = '2026-03-10';
    const flights = [tracked(1, 10, `${D} 07:00`, `${D} 11:00`)];
    const e = entry(5, { tracker_id: 10, flight_start_time: flights[0].start_time, excluded: 1 });
    const data = dutyMonth(applyFlightEdits(flights, [e], { includeRemoved: true }).flights, D);
    assert.equal(dayOf(data, D).flights.length, 0);
    assert.equal(data.totals.hours[0].secs, 0);
  });
});

describe('flightCorrectionKey / mergeFlightCorrections', () => {
  const a = entry(1, { tracker_id: 10, flight_start_time: 1000, origin_label: 'A' });
  const m = entry(2, { start_time: 5000, end_time: 6000, pilot_id: 1 });
  const base = [a, m];

  test('keys: tracker/start for tracked rows, manual/id for manual ones', () => {
    assert.equal(flightCorrectionKey(a), '10/1000');
    assert.equal(flightCorrectionKey(m), 'manual/2');
  });

  test('nothing incoming returns the same array', () => {
    assert.equal(mergeFlightCorrections(base, {}), base);
    assert.equal(mergeFlightCorrections(base, { entries: [], deleted: [] }), base);
  });

  test('upserts by key, so a re-inserted row under a new id replaces the old one', () => {
    const a2 = { ...a, id: 11, origin_label: 'A2' };
    const b = entry(3, { tracker_id: 20, flight_start_time: 2000 });
    const out = mergeFlightCorrections(base, { entries: [a2, b] });
    assert.deepEqual(ids(out).sort((x, y) => x - y), [2, 3, 11]);
    assert.equal(out.find(e => e.tracker_id === 10).origin_label, 'A2');
    assert.deepEqual(ids(base), [1, 2], 'the input is not mutated');
  });

  test('deleted keys are tombstones', () => {
    assert.deepEqual(ids(mergeFlightCorrections(base, { deleted: ['manual/2'] })), [1]);
    assert.deepEqual(ids(mergeFlightCorrections(base, { deleted: ['10/1000', 'manual/99'] })), [2]);
  });

  test('a row deleted and re-added in the same delta is kept', () => {
    const a2 = { ...a, id: 12 };
    assert.deepEqual(ids(mergeFlightCorrections(base, { entries: [a2], deleted: ['10/1000'] })).sort((x, y) => x - y), [2, 12]);
  });

  test('full replaces everything, or returns the same array when identical', () => {
    const b = entry(3, { tracker_id: 20, flight_start_time: 2000 });
    const incoming = [b];
    assert.equal(mergeFlightCorrections(base, { entries: incoming, full: true }), incoming);
    assert.equal(mergeFlightCorrections(base, { entries: plain(base), full: true }), base);
    assert.deepEqual(mergeFlightCorrections(base, { entries: [], full: true }), []);
  });
});
