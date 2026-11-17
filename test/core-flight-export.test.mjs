// @wingbeat/core/flight-export, imported directly: the admin flights export's rows (times
// in UTC and the operator's timezone, duration, names, ends, flags), its date range, and
// the CSV and JSON it writes.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore, TZ } from './core.mjs';

const x = await importCore('flight-export');
const time = await importCore('time');
const at = (s) => time.tzLocalToEpoch(TZ, ...s.split(' '));

const tracked = {
  id: 7, tracker_id: 1, start_time: at('2026-07-03 09:00'), end_time: at('2026-07-03 10:30'),
  pilot_id: 2, pilot_name: 'Sam', aircraft_tail: 'N123', origin_label: 'Kodiak, AK', destination_label: 'Larsen Bay',
  start_lat: 57.75, start_lon: -152.49, end_lat: 57.54, end_lon: -153.98, points: [{ t: 0 }], edit: null,
};
const manual = {
  id: -4, tracker_id: null, start_time: at('2026-07-01 14:00'), end_time: at('2026-07-01 14:20'),
  pilot_id: null, pilot_name: null, aircraft_tail: null, origin_label: 'Old Harbor', destination_label: null,
  edit: { manual: true, part91: true, unpaid: false, remark: 'Ferry, "test"' },
};

describe('flightExportRows', () => {
  test('a row per flight, oldest first, with both clocks, the duration and the names', () => {
    const rows = x.flightExportRows(TZ, [tracked, manual], {
      trackers: [{ id: 1, name: 'InReach 1' }], aircraft: [{ tail_number: 'N123', name: 'Beaver' }],
    });
    assert.deepEqual(rows.map(r => r.id), [-4, 7]);
    const r = rows[1];
    assert.equal(r.date, '2026-07-03');
    assert.equal(r.start_utc, '2026-07-03T17:00:00Z');
    assert.equal(r.start_local, '2026-07-03 09:00 AKDT');
    assert.equal(r.duration_minutes, 90);
    assert.equal(r.duration_hours, 1.5);
    assert.equal(r.tracker_name, 'InReach 1');
    assert.equal(r.aircraft_name, 'Beaver');
    assert.equal(r.origin, 'Kodiak, AK');
    assert.equal(r.end_lon, -153.98);
    assert.equal('points' in r, false);
    assert.deepEqual([rows[0].manual, rows[0].part91, rows[0].start_lat], [true, true, null]);
  });

  test('from and to are inclusive operator dates', () => {
    const ids = (o) => x.flightExportRows(TZ, [tracked, manual], o).map(r => r.id);
    assert.deepEqual(ids({ from: '2026-07-02' }), [7]);
    assert.deepEqual(ids({ to: '2026-07-01' }), [-4]);
    assert.deepEqual(ids({ from: '2026-07-01', to: '2026-07-03' }), [-4, 7]);
  });
});

describe('flightsCsv and flightsJson', () => {
  test('CSV quotes commas and quotes, and leaves nulls empty', () => {
    const csv = x.flightsCsv(x.flightExportRows(TZ, [manual]));
    const [head, row] = csv.trimEnd().split('\r\n');
    assert.equal(head, x.FLIGHT_EXPORT_COLUMNS.join(','));
    assert.match(row, /,"Ferry, ""test"""$/);
    assert.match(row, /,Old Harbor,,/);
  });

  test('JSON carries the range and timezone', () => {
    const j = JSON.parse(x.flightsJson(TZ, at('2026-11-17 08:00'), x.flightExportRows(TZ, [tracked]), { from: '2026-07-01' }));
    assert.deepEqual([j.timezone, j.from, j.to, j.flights.length], [TZ, '2026-07-01', null, 1]);
  });

  test('file names', () => {
    assert.equal(x.flightExportFileName('csv'), 'flights-all.csv');
    assert.equal(x.flightExportFileName('json', '2026-01-01', null), 'flights-2026-01-01-to-now.json');
  });
});
