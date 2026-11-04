// @wingbeat/core/corrections: the flight editor's requests. Which flight a correction names
// (flightRef(): a tracked flight by its tracker's original start time), the bulk
// aircraft/pilot and flag bodies, and the flight form's validation (readFlightForm()) and
// save body (flightSaveRequest()). The request bodies parse with the route's request
// schema (api/corrections-requests.ts), which the Worker validates with.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod/mini';
import { importCore, plain, TZ } from './core.mjs';
import { loadEngine } from './harness.mjs';

const corrections = await importCore('corrections');
const api = await importCore('api/corrections-requests');
const time = await importCore('time');
const at = (s) => time.tzLocalToEpoch(TZ, ...s.split(' '));
const engine = loadEngine();

const parses = (schema, body) => {
  const r = z.safeParse(schema, body);
  assert.ok(r.success, JSON.stringify(r.error?.issues));
};

// Effective flights as the flight store returns them.
const trackedFlight = (id, dep, arr, edit = null) => ({
  id, tracker_id: 3, start_time: at(dep), end_time: at(arr), origin_label: 'PAKN', destination_label: 'PADQ',
  pilot_id: 1, aircraft_tail: 'N1', edit,
});
const manualFlight = (entryId, dep, arr) => ({
  id: 'm' + entryId, tracker_id: null, start_time: at(dep), end_time: at(arr), pilot_id: 1, aircraft_tail: null,
  edit: { entry: { id: entryId }, manual: true, original: {} },
});

describe('flightRef', () => {
  test('a tracked flight by its tracker’s start time, even when the correction moved it', () => {
    assert.deepEqual(corrections.flightRef(trackedFlight(1, '2026-07-01 09:00', '2026-07-01 10:00')),
      { tracker_id: 3, flight_start_time: at('2026-07-01 09:00') });
    const moved = trackedFlight(1, '2026-07-01 09:15', '2026-07-01 10:00',
      { entry: { id: 4 }, original: { start_time: at('2026-07-01 09:00') } });
    assert.deepEqual(corrections.flightRef(moved), { tracker_id: 3, flight_start_time: at('2026-07-01 09:00') });
  });

  test('a manual flight by its row', () => {
    assert.deepEqual(corrections.flightRef(manualFlight(8, '2026-07-01 09:00', '2026-07-01 10:00')), { entry_id: 8 });
  });
});

describe('bulk requests', () => {
  const flights = [trackedFlight(1, '2026-07-01 09:00', '2026-07-01 10:00'), manualFlight(8, '2026-07-02 09:00', '2026-07-02 10:00')];

  test('aircraft/pilot: tracked flights by id, manual flights by row', () => {
    const body = corrections.flightAssignmentRequest(flights, { pilot_id: 2 });
    assert.deepEqual(body, { flight_ids: [1], entry_ids: [8], pilot_id: 2 });
    parses(api.AssignmentRequest, body);
  });

  test('flags: each flight’s ref and the change', () => {
    const body = corrections.flightFlagsRequest(flights, { excluded: true });
    assert.deepEqual(body, { flights: [{ tracker_id: 3, flight_start_time: at('2026-07-01 09:00') }, { entry_id: 8 }], set: { excluded: true } });
    parses(api.BulkFlagsRequest, body);
  });
});

describe('the flight form', () => {
  const fields = (over = {}) => ({
    date: '2026-07-01', dep: '09:00', arr: '10:30', origin: ' PAKN ', dest: '', aircraft: 'N2', pilot: '2',
    part: '91', pay: 'unpaid', remark: '  Training ', ...over,
  });
  const manualNew = { tracked: false, entryId: null };
  const orig = { tracker_id: 3, start_time: at('2026-07-01 09:00'), end_time: at('2026-07-01 10:30'),
    origin_label: 'PAKN', destination_label: 'PADQ', aircraft_tail: 'N1', pilot_id: 1 };
  const tracked = { tracked: true, orig };
  const save = { removed: false, baseHistoryId: 12, coords: (label) => label === 'PAKN' ? [58.7, -157] : [null, null] };

  test('the fields read as epochs and labels, trimmed', () => {
    assert.deepEqual(corrections.readFlightForm(TZ, fields(), manualNew), {
      start_time: at('2026-07-01 09:00'), end_time: at('2026-07-01 10:30'), origin_label: 'PAKN', destination_label: null,
      aircraft_tail: 'N2', pilot_id: 2, part91: true, unpaid: true, remark: 'Training',
    });
    // Unpaid only with Part 91.
    assert.equal(corrections.readFlightForm(TZ, fields({ part: '135' }), manualNew).unpaid, false);
  });

  test('its errors', () => {
    assert.equal(corrections.readFlightForm(TZ, fields({ arr: '' }), manualNew), 'Enter the date, departure and arrival times.');
    assert.equal(corrections.readFlightForm(TZ, fields({ arr: '09:00' }), manualNew), 'The arrival time is the same as the departure.');
    // A tracked flight can land in the minute it took off.
    assert.equal(typeof corrections.readFlightForm(TZ, fields({ arr: '09:00' }), tracked), 'object');
    // Over 24 hours: only across the night the clocks go back (Nov 1, 2026 in Anchorage).
    assert.match(corrections.readFlightForm(TZ, fields({ date: '2026-10-31', dep: '10:00', arr: '09:59' }), manualNew),
      /can’t be longer than 24 hours/);
  });

  test('a tracker’s own overlong flight can still be saved when its times aren’t changed', () => {
    const long = { ...orig, end_time: orig.start_time + 25 * 3600 };
    const t = corrections.flightFormTimesOf(TZ, { date: '2026-07-01', dep: '09:00', arr: '10:00' });
    assert.equal(corrections.flightTimesChanged(t, { tracked: true, orig: long }), true);
    assert.equal(corrections.flightTimesChanged(t, { tracked: false, entryId: null }), true);
    assert.equal(corrections.flightTimesChanged(t, { tracked: true, orig: { ...orig, end_time: orig.start_time + 3600 } }), false);
  });

  test('a new manual flight: POST, with its named points’ coordinates and no base', () => {
    const v = corrections.readFlightForm(TZ, fields(), manualNew);
    const req = corrections.flightSaveRequest(v, manualNew, save);
    assert.deepEqual(req, { entryId: null, body: { ...v, excluded: false, start_lat: 58.7, start_lon: -157, end_lat: null, end_lon: null } });
    parses(api.CorrectionRequest, req.body);
    assert.equal(corrections.flightSaveRequest({ ...v, pilot_id: null }, manualNew, save), 'Choose a pilot.');
  });

  test('an edited manual flight: PUT its row, against the base', () => {
    const target = { tracked: false, entryId: 8 };
    const req = corrections.flightSaveRequest(corrections.readFlightForm(TZ, fields(), target), target, { ...save, removed: true });
    assert.equal(req.entryId, 8);
    assert.equal(req.body.base_history_id, 12);
    assert.equal(req.body.excluded, true);
    parses(api.CorrectionRequest, req.body);
  });

  test('a tracked flight: only what differs from the tracker, with the aircraft/pilot change', () => {
    const v = corrections.readFlightForm(TZ, fields({ origin: 'PAKN', dest: 'PADL', arr: '10:45' }), tracked);
    const req = corrections.flightSaveRequest(v, tracked, save);
    assert.deepEqual(req, { entryId: null, body: {
      tracker_id: 3, flight_start_time: orig.start_time, start_time: null, end_time: at('2026-07-01 10:45'),
      origin_label: null, destination_label: 'PADL', part91: true, unpaid: true, remark: 'Training', excluded: false,
      assign: { aircraft_tail: 'N2', pilot_id: 2 }, base_history_id: 12,
    } });
    parses(api.CorrectionRequest, req.body);
    // The tracker's aircraft and pilot: no assign.
    const same = corrections.flightSaveRequest({ ...v, aircraft_tail: 'N1', pilot_id: 1 }, tracked, save);
    assert.equal(same.body.assign, undefined);
  });

  test('the page’s globals bind the operator timezone', () => {
    assert.deepEqual(plain(engine.readFlightForm(fields(), tracked)), plain(corrections.readFlightForm(TZ, fields(), tracked)));
    assert.deepEqual(plain(engine.flightFormTimesOf(fields())), plain(corrections.flightFormTimesOf(TZ, fields())));
  });
});
