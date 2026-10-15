// Flight corrections: applyFlightEdits() (flight-edits.ts) and the flight store's
// flightCorrectionKey() / mergeFlightCorrections() (flight-store.ts), plus a correction
// flowing through to the duty log.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, fixtures, plain } from './harness.mjs';

const engine = loadEngine({ now: '2026-10-15 12:00' });
const { at, duty, dutyMonth, dayOf } = fixtures(engine);

// ids in this realm (arrays from the engine have the vm context's prototypes).
const ids = (list) => [...list].map(x => x.id);

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

describe('applyFlightEdits', () => {
  const f1 = tracked(1, 10, '2026-03-10 09:00', '2026-03-10 10:00');
  const f2 = tracked(2, 10, '2026-03-10 11:00', '2026-03-10 12:00');

  test('no entries: the records themselves, sorted', () => {
    const { flights, unmatched, unplaced } = engine.applyFlightEdits([f2, f1], []);
    assert.equal(flights.length, 2);
    assert.equal(flights[0], f1);
    assert.equal(flights[1], f2);
    assert.equal(unmatched.length + unplaced.length, 0);
  });

  test('corrected fields are applied and the tracker’s values kept in original', () => {
    const e = entry(7, {
      tracker_id: 10, flight_start_time: f1.start_time,
      start_time: at('2026-03-10 08:45'), origin_label: 'PAEN', part91: 1, remark: 'Ferry',
    });
    const { flights } = engine.applyFlightEdits([f1, f2], [e]);
    const eff = flights[0];
    assert.notEqual(eff, f1, 'a copy, not the record');
    assert.equal(f1.start_time, at('2026-03-10 09:00'), 'the record is untouched');
    assert.equal(eff.start_time, at('2026-03-10 08:45'));
    assert.equal(eff.end_time, f1.end_time);
    assert.equal(eff.origin_label, 'PAEN');
    assert.equal(eff.destination_label, 'PADQ');
    assert.deepEqual(plain(eff.edit.original), { start_time: f1.start_time, origin_label: 'PAKN' });
    assert.equal(eff.edit.manual, false);
    assert.equal(eff.edit.part91, true);
    assert.equal(eff.edit.entry, e);
    assert.equal(eff.modified_at, 500, 'bumped by the edit');
    assert.deepEqual([...engine.flightRemarks(eff)], ['Part 91', 'Ferry']);
    assert.equal(flights[1], f2, 'an untouched flight is the record itself');
  });

  test('flights are sorted by corrected start time', () => {
    const e = entry(7, { tracker_id: 10, flight_start_time: f1.start_time, start_time: at('2026-03-10 11:30'), end_time: at('2026-03-10 12:30') });
    const { flights } = engine.applyFlightEdits([f1, f2], [e]);
    assert.deepEqual(ids(flights), [2, 1]);
  });

  test('a Part 91 classification alone is not an edited field', () => {
    const e = entry(7, { tracker_id: 10, flight_start_time: f1.start_time, part91: 1, unpaid: 1 });
    const eff = engine.applyFlightEdits([f1], [e]).flights[0];
    assert.deepEqual(plain(eff.edit.original), {});
    assert.equal(eff.edit.unpaid, true);
    assert.deepEqual([...engine.flightRemarks(eff)], ['Part 91 (unpaid)']);
  });

  test('a removed flight is hidden unless includeRemoved', () => {
    const e = entry(7, { tracker_id: 10, flight_start_time: f1.start_time, excluded: 1 });
    assert.deepEqual(ids(engine.applyFlightEdits([f1, f2], [e]).flights), [2]);
    const all = engine.applyFlightEdits([f1, f2], [e], { includeRemoved: true }).flights;
    assert.deepEqual(ids(all), [1, 2]);
    assert.equal(all[0].edit.excluded, true);
  });

  test('manual flights: negative id, no tracker, their own pilot and aircraft', () => {
    const m = entry(9, {
      start_time: at('2026-03-10 14:00'), end_time: at('2026-03-10 15:30'),
      origin_label: 'PAKN', destination_label: 'PAIL', pilot_id: 2, aircraft_tail: 'N2',
    });
    const { flights } = engine.applyFlightEdits([f1], [m], { pilots: [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }] });
    const mf = flights[1];
    assert.equal(mf.id, -9);
    assert.equal(mf.tracker_id, null);
    assert.equal(mf.pilot_id, 2);
    assert.equal(mf.pilot_name, 'Bob');
    assert.equal(mf.aircraft_tail, 'N2');
    assert.equal(mf.points.length, 0);
    assert.equal(mf.edit.manual, true);
    assert.equal(mf.end_time - mf.start_time, 90 * 60);
  });

  test('an unknown pilot gives a null pilot_name; a removed manual flight is hidden', () => {
    const m = entry(9, { start_time: at('2026-03-10 14:00'), end_time: at('2026-03-10 15:00'), pilot_id: 3 });
    assert.equal(engine.applyFlightEdits([], [m]).flights[0].pilot_name, null);
    const removed = { ...m, excluded: 1 };
    assert.equal(engine.applyFlightEdits([], [removed]).flights.length, 0);
    assert.equal(engine.applyFlightEdits([], [removed], { includeRemoved: true }).flights.length, 1);
  });

  test('unmatched (tracker loaded, flight gone) vs unplaced (tracker not loaded)', () => {
    const gone = entry(7, { tracker_id: 10, flight_start_time: at('2026-03-09 09:00'), origin_label: 'X' });
    const other = entry(8, { tracker_id: 99, flight_start_time: at('2026-03-09 09:00'), origin_label: 'Y' });
    const r = engine.applyFlightEdits([f1, f2], [gone, other]);
    assert.deepEqual(ids(r.unmatched), [7]);
    assert.deepEqual(ids(r.unplaced), [8]);
    assert.deepEqual(ids(r.flights), [1, 2], 'neither is applied');
    // A tracker the caller fetched counts as loaded even with no flights left.
    const r2 = engine.applyFlightEdits([f1, f2], [gone, other], { knownTrackerIds: [99] });
    assert.deepEqual(ids(r2.unmatched), [7, 8]);
    assert.equal(r2.unplaced.length, 0);
  });

  test('flightEntrySummary describes what a row would change', () => {
    const e = entry(7, { tracker_id: 10, flight_start_time: f1.start_time, start_time: at('2026-03-10 08:05'), part91: 1, excluded: 1 });
    assert.equal(engine.flightEntrySummary(e), 'Dep 08:05, Part 91, removed');
    assert.equal(engine.flightEntrySummary(entry(7, { tracker_id: 10 })), 'no corrections');
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
    const run = (entries) => [...dayOf(dutyMonth(engine.applyFlightEdits(flights, entries).flights, D, { days }), D).warnings];
    assert.deepEqual(run([]), ['8:30 flight time in the 24 h to 15:00 (§135.267(b) limit 8:00)']);
    assert.deepEqual(run([entry(5, { tracker_id: 10, flight_start_time: flights[2].start_time, part91: 1, unpaid: 1 })]), []);
    assert.deepEqual(run([entry(5, { tracker_id: 10, flight_start_time: flights[1].start_time, end_time: at(`${D} 14:00`) })]),
      ['7:30 flight time in the 24 h to 14:00 (§135.267(b) limit 8:00)'].slice(0, 0));
  });

  test('a removed flight is left out of the log and totals', () => {
    const D = '2026-03-10';
    const flights = [tracked(1, 10, `${D} 07:00`, `${D} 11:00`)];
    const e = entry(5, { tracker_id: 10, flight_start_time: flights[0].start_time, excluded: 1 });
    const data = dutyMonth(engine.applyFlightEdits(flights, [e], { includeRemoved: true }).flights, D);
    assert.equal(dayOf(data, D).flights.length, 0);
    assert.equal(data.totals.hours[0].secs, 0);
  });
});

describe('flightCorrectionKey / mergeFlightCorrections', () => {
  const a = entry(1, { tracker_id: 10, flight_start_time: 1000, origin_label: 'A' });
  const m = entry(2, { start_time: 5000, end_time: 6000, pilot_id: 1 });
  const base = [a, m];

  test('keys: tracker/start for tracked rows, manual/id for manual ones', () => {
    assert.equal(engine.flightCorrectionKey(a), '10/1000');
    assert.equal(engine.flightCorrectionKey(m), 'manual/2');
  });

  test('nothing incoming returns the same array', () => {
    assert.equal(engine.mergeFlightCorrections(base, {}), base);
    assert.equal(engine.mergeFlightCorrections(base, { entries: [], deleted: [] }), base);
  });

  test('upserts by key, so a re-inserted row under a new id replaces the old one', () => {
    const a2 = { ...a, id: 11, origin_label: 'A2' };
    const b = entry(3, { tracker_id: 20, flight_start_time: 2000 });
    const out = engine.mergeFlightCorrections(base, { entries: [a2, b] });
    assert.deepEqual(ids(out).sort((x, y) => x - y), [2, 3, 11]);
    assert.equal(out.find(e => e.tracker_id === 10).origin_label, 'A2');
    assert.deepEqual(ids(base), [1, 2], 'the input is not mutated');
  });

  test('deleted keys are tombstones', () => {
    assert.deepEqual(ids(engine.mergeFlightCorrections(base, { deleted: ['manual/2'] })), [1]);
    assert.deepEqual(ids(engine.mergeFlightCorrections(base, { deleted: ['10/1000', 'manual/99'] })), [2]);
  });

  test('a row deleted and re-added in the same delta is kept', () => {
    const a2 = { ...a, id: 12 };
    assert.deepEqual(ids(engine.mergeFlightCorrections(base, { entries: [a2], deleted: ['10/1000'] })).sort((x, y) => x - y), [2, 12]);
  });

  test('full replaces everything, or returns the same array when identical', () => {
    const b = entry(3, { tracker_id: 20, flight_start_time: 2000 });
    const incoming = [b];
    assert.equal(engine.mergeFlightCorrections(base, { entries: incoming, full: true }), incoming);
    assert.equal(engine.mergeFlightCorrections(base, { entries: plain(base), full: true }), base);
    assert.deepEqual(engine.mergeFlightCorrections(base, { entries: [], full: true }), []);
  });
});
