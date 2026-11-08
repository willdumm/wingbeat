// @wingbeat/core/flight-edits: corrections applied to tracked flights (applyFlightEdits()),
// what they show (flightRemarks(), flightEntrySummary(), flightOriginalText()), and the
// flight form's Dep/Arr reading: flightFormTimes() (an arrival before the departure is
// the next day, which the form says under the times; over 12 h asks before saving and over
// 24 h, the server's limit in record-limits.ts, is refused) and what a tracked flight's
// form saves of them, flightTrackedTimes().

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore } from './core.mjs';

const fe = await importCore('flight-edits');
const time = await importCore('time');
const TZ = 'America/Anchorage';
const at = (s) => time.tzLocalToEpoch(TZ, ...s.split(' '));
const flightFormTimes = (dateKey, dep, arr) => fe.flightFormTimes(TZ, dateKey, dep, arr);
const { flightTrackedTimes } = fe;

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

describe('applyFlightEdits', () => {
  const f1 = tracked(1, 10, '2026-03-10 09:00', '2026-03-10 10:00');
  const f2 = tracked(2, 10, '2026-03-10 11:00', '2026-03-10 12:00');

  test('no entries: the records themselves, sorted', () => {
    const { flights, unmatched, unplaced } = fe.applyFlightEdits([f2, f1], []);
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
    const { flights } = fe.applyFlightEdits([f1, f2], [e]);
    const eff = flights[0];
    assert.notEqual(eff, f1, 'a copy, not the record');
    assert.equal(f1.start_time, at('2026-03-10 09:00'), 'the record is untouched');
    assert.equal(eff.start_time, at('2026-03-10 08:45'));
    assert.equal(eff.end_time, f1.end_time);
    assert.equal(eff.origin_label, 'PAEN');
    assert.equal(eff.destination_label, 'PADQ');
    assert.deepEqual(eff.edit.original, { start_time: f1.start_time, origin_label: 'PAKN' });
    assert.equal(eff.edit.manual, false);
    assert.equal(eff.edit.part91, true);
    assert.equal(eff.edit.entry, e);
    assert.equal(eff.modified_at, 500, 'bumped by the edit');
    assert.deepEqual(fe.flightRemarks(eff), ['Part 91', 'Ferry']);
    assert.equal(flights[1], f2, 'an untouched flight is the record itself');
  });

  test('flights are sorted by corrected start time', () => {
    const e = entry(7, { tracker_id: 10, flight_start_time: f1.start_time, start_time: at('2026-03-10 11:30'), end_time: at('2026-03-10 12:30') });
    const { flights } = fe.applyFlightEdits([f1, f2], [e]);
    assert.deepEqual(ids(flights), [2, 1]);
  });

  test('a Part 91 classification alone is not an edited field', () => {
    const e = entry(7, { tracker_id: 10, flight_start_time: f1.start_time, part91: 1, unpaid: 1 });
    const eff = fe.applyFlightEdits([f1], [e]).flights[0];
    assert.deepEqual(eff.edit.original, {});
    assert.equal(eff.edit.unpaid, true);
    assert.deepEqual(fe.flightRemarks(eff), ['Part 91 (unpaid)']);
  });

  test('a removed flight is hidden unless includeRemoved', () => {
    const e = entry(7, { tracker_id: 10, flight_start_time: f1.start_time, excluded: 1 });
    assert.deepEqual(ids(fe.applyFlightEdits([f1, f2], [e]).flights), [2]);
    const all = fe.applyFlightEdits([f1, f2], [e], { includeRemoved: true }).flights;
    assert.deepEqual(ids(all), [1, 2]);
    assert.equal(all[0].edit.excluded, true);
  });

  test('manual flights: negative id, no tracker, their own pilot and aircraft', () => {
    const m = entry(9, {
      start_time: at('2026-03-10 14:00'), end_time: at('2026-03-10 15:30'),
      origin_label: 'PAKN', destination_label: 'PAIL', pilot_id: 2, aircraft_tail: 'N2',
    });
    const { flights } = fe.applyFlightEdits([f1], [m], { pilots: [{ id: 1, name: 'Ann' }, { id: 2, name: 'Bob' }] });
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
    assert.equal(fe.applyFlightEdits([], [m]).flights[0].pilot_name, null);
    const removed = { ...m, excluded: 1 };
    assert.equal(fe.applyFlightEdits([], [removed]).flights.length, 0);
    assert.equal(fe.applyFlightEdits([], [removed], { includeRemoved: true }).flights.length, 1);
  });

  test('unmatched (tracker loaded, flight gone) vs unplaced (tracker not loaded)', () => {
    const gone = entry(7, { tracker_id: 10, flight_start_time: at('2026-03-09 09:00'), origin_label: 'X' });
    const other = entry(8, { tracker_id: 99, flight_start_time: at('2026-03-09 09:00'), origin_label: 'Y' });
    const r = fe.applyFlightEdits([f1, f2], [gone, other]);
    assert.deepEqual(ids(r.unmatched), [7]);
    assert.deepEqual(ids(r.unplaced), [8]);
    assert.deepEqual(ids(r.flights), [1, 2], 'neither is applied');
    // A tracker the caller fetched counts as loaded even with no flights left.
    const r2 = fe.applyFlightEdits([f1, f2], [gone, other], { knownTrackerIds: [99] });
    assert.deepEqual(ids(r2.unmatched), [7, 8]);
    assert.equal(r2.unplaced.length, 0);
  });

  test('flightEntrySummary describes what a row would change', () => {
    const e = entry(7, { tracker_id: 10, flight_start_time: f1.start_time, start_time: at('2026-03-10 08:05'), part91: 1, excluded: 1 });
    assert.equal(fe.flightEntrySummary(TZ, e), 'Dep 08:05, Part 91, removed');
    assert.equal(fe.flightEntrySummary(TZ, entry(7, { tracker_id: 10 })), 'no corrections');
  });
});


describe('flightFieldEdited / flightOriginalText', () => {
  const f1 = tracked(1, 10, '2026-03-10 09:00', '2026-03-10 10:00');

  test('only the fields the row corrected count as edited', () => {
    const e = entry(7, { tracker_id: 10, flight_start_time: f1.start_time, end_time: at('2026-03-10 10:20'), part91: 1 });
    const eff = fe.applyFlightEdits([f1], [e]).flights[0];
    assert.equal(fe.flightFieldEdited(eff, 'end_time'), true);
    assert.equal(fe.flightFieldEdited(eff, 'start_time'), false);
    assert.equal(fe.flightFieldEdited(f1, 'end_time'), false, 'a flight with no edit');
  });

  test('the tracker’s value: times in the operator’s timezone, labels as they are', () => {
    assert.equal(fe.flightOriginalText(TZ, 'start_time', at('2026-07-15 09:05')), '09:05');
    assert.equal(fe.flightOriginalText(TZ, 'end_time', at('2026-01-15 23:59')), '23:59');
    assert.equal(fe.flightOriginalText('UTC', 'end_time', at('2026-01-15 23:59')), '08:59');
    assert.equal(fe.flightOriginalText(TZ, 'origin_label', 'PAKN'), 'PAKN');
    assert.equal(fe.flightOriginalText(TZ, 'origin_label', ''), '(none)');
    assert.equal(fe.flightOriginalText(TZ, 'destination_label', null), '(none)');
  });

  test('flightRemarks: nothing for Part 135, Part 91 before the remark', () => {
    assert.deepEqual(fe.flightRemarks(f1), []);
    assert.deepEqual(fe.flightRemarks({ edit: { part91: false, unpaid: false, remark: 'Training' } }), ['Training']);
    assert.deepEqual(fe.flightRemarks({ edit: { part91: true, unpaid: true, remark: 'Ferry' } }), ['Part 91 (unpaid)', 'Ferry']);
  });
});

describe('flightFormTimes', () => {
  test('a same-day flight: no hint, no confirm', () => {
    assert.deepEqual((flightFormTimes('2026-03-10', '09:00', '09:40')), {
      start_time: at('2026-03-10 09:00'), end_time: at('2026-03-10 09:40'), secs: 40 * 60,
      nextDay: false, long: false, tooLong: false, hint: '',
    });
  });

  test('an arrival before the departure is the next day, and says so', () => {
    const t = flightFormTimes('2026-03-10', '23:30', '00:45');
    assert.equal(t.end_time, at('2026-03-11 00:45'));
    assert.equal(t.nextDay, true);
    assert.equal(t.long, false);
    assert.equal(t.hint, 'Arrives the next day, 1:15 after departure.');
  });

  test('Dep moved past Arr (09:00–09:40 → 09:50) is a 23:50 flight: confirm, not refused', () => {
    const t = flightFormTimes('2026-03-10', '09:50', '09:40');
    assert.equal(t.secs, 23 * 3600 + 50 * 60);
    assert.equal(t.long, true);
    assert.equal(t.tooLong, false);
    assert.equal(t.hint, 'Arrives the next day, 23:50 after departure.');
  });

  test('exactly 12 h saves without asking; a minute more asks', () => {
    assert.equal(flightFormTimes('2026-03-10', '20:00', '08:00').long, false);
    assert.equal(flightFormTimes('2026-03-10', '20:00', '08:01').long, true);
  });

  test('the same time for Dep and Arr is a zero-length flight, not 24 h', () => {
    const t = flightFormTimes('2026-03-10', '09:00', '09:00');
    assert.equal(t.secs, 0);
    assert.equal(t.nextDay, false);
  });

  test('across the fall-back night a next-day arrival can pass 24 h: refused', () => {
    // Anchorage falls back 2026-11-01 02:00: that day has 25 hours.
    const t = flightFormTimes('2026-10-31', '09:00', '08:50');
    assert.equal(t.secs, 24 * 3600 + 50 * 60);
    assert.equal(t.tooLong, true);
  });

  test('across the spring-forward night the clock times are kept', () => {
    // Anchorage springs forward 2026-03-08 02:00: that day has 23 hours.
    const t = flightFormTimes('2026-03-07', '22:00', '06:00');
    assert.equal(t.end_time, at('2026-03-08 06:00'));
    assert.equal(t.secs, 7 * 3600);
  });
});

describe('flightTrackedTimes', () => {
  // The tracker's flight, with seconds the form can't show.
  const orig = { start_time: at('2026-03-10 10:05') + 40, end_time: at('2026-03-10 10:42') + 15 };

  test('times left as the tracker’s, to the minute, are no correction', () => {
    assert.deepEqual((flightTrackedTimes(flightFormTimes('2026-03-10', '10:05', '10:42'), orig)),
      { start_time: null, end_time: null });
  });

  test('a changed time is saved as typed, the other left to the tracker', () => {
    assert.deepEqual((flightTrackedTimes(flightFormTimes('2026-03-10', '10:05', '10:50'), orig)),
      { start_time: null, end_time: at('2026-03-10 10:50') });
    assert.deepEqual((flightTrackedTimes(flightFormTimes('2026-03-10', '10:00', '10:42'), orig)),
      { start_time: at('2026-03-10 10:00'), end_time: null });
  });

  test('Arr set to the tracker’s departure minute lands at the departure, not before it', () => {
    // 10:05:00 would be 40 s before the tracker's 10:05:40, which the server refuses.
    assert.deepEqual((flightTrackedTimes(flightFormTimes('2026-03-10', '10:05', '10:05'), orig)),
      { start_time: null, end_time: orig.start_time });
  });

  test('Dep and Arr both moved to the same minute are kept as typed', () => {
    assert.deepEqual((flightTrackedTimes(flightFormTimes('2026-03-10', '10:00', '10:00'), orig)),
      { start_time: at('2026-03-10 10:00'), end_time: at('2026-03-10 10:00') });
  });

  test('Dep moved to the tracker’s arrival minute stays before the arrival', () => {
    const t = flightTrackedTimes(flightFormTimes('2026-03-10', '10:42', '10:42'), orig);
    assert.deepEqual((t), { start_time: at('2026-03-10 10:42'), end_time: null });
    assert.ok(t.start_time <= orig.end_time);
  });
});
