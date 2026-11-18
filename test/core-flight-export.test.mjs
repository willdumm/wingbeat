// @wingbeat/core/flight-export, imported directly: the admin flights export's rows (times
// in UTC and the operator's timezone, duration, names, ends with their elevation and
// speed, flags), its date range, and
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
  start_lat: 57.75, start_lon: -152.49, end_lat: 57.54, end_lon: -153.98, edit: null,
  points: [
    { t: at('2026-07-03 09:00'), lat: 57.75, lon: -152.49, v: 20, e: 10, c: 90 },
    { t: at('2026-07-03 09:05'), lat: 57.7, lon: -152.6, v: 185.2, e: 304.8, c: 250 },
    { t: at('2026-07-03 10:25'), lat: 57.55, lon: -153.9, v: 150, e: 152.4, c: 250 },
    { t: at('2026-07-03 10:30'), lat: 57.54, lon: -153.98, v: null, e: null, c: null },
  ],
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

  test('each end\'s elevation (ft) and speed (kt) come from the track point nearest its time', () => {
    const [r] = x.flightExportRows(TZ, [tracked]);
    assert.deepEqual([r.start_elevation_ft, r.start_speed_kt], [33, 10.8]);
    // The last fix has neither: blank, not an earlier fix's from the air.
    assert.deepEqual([r.end_elevation_ft, r.end_speed_kt], [null, null]);
    // Corrected times: the nearest points, not the first and last.
    const corrected = { ...tracked, start_time: at('2026-07-03 09:04'), end_time: at('2026-07-03 10:24') };
    const [c] = x.flightExportRows(TZ, [corrected]);
    assert.deepEqual([c.start_elevation_ft, c.start_speed_kt, c.end_elevation_ft, c.end_speed_kt], [1000, 100, 500, 81]);
    // A manual flight has no track.
    const [m] = x.flightExportRows(TZ, [manual]);
    assert.deepEqual([m.start_elevation_ft, m.start_speed_kt, m.end_elevation_ft, m.end_speed_kt], [null, null, null, null]);
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

  test('CSV text that starts like a formula is shown, not run; numbers are left alone', () => {
    const formula = { ...manual, origin_label: '=HYPERLINK("x")', edit: { ...manual.edit, remark: '@SUM(1)' } };
    const [, row] = x.flightsCsv(x.flightExportRows(TZ, [formula])).trimEnd().split('\r\n');
    assert.match(row, /,"'=HYPERLINK\(""x""\)",/);
    assert.match(row, /,'@SUM\(1\)$/);
    const [, tracked1] = x.flightsCsv(x.flightExportRows(TZ, [tracked])).trimEnd().split('\r\n');
    assert.match(tracked1, /,-152\.49,/);
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
