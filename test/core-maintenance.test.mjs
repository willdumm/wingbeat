// @wingbeat/core/maintenance, imported directly: flight hours, the estimated Hobbs and tach
// readings, calendar due dates (in the operator's timezone, whatever the device's) and
// each schedule item's status. This compliance logic had no tests before it moved to core.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore } from './core.mjs';
import { loadEngine, plain, TZ } from './harness.mjs';

const m = await importCore('maintenance');
const time = await importCore('time');
const at = (s) => time.tzLocalToEpoch(TZ, ...s.split(' '));
const NOW = at('2026-11-03 12:00');

describe('flightHours and estimatedMeter', () => {
  test('a flight’s hours run to its end, or for one in progress to its newest point', () => {
    assert.equal(m.flightHours({ start_time: 0, end_time: 5400 }), 1.5);
    assert.equal(m.flightHours({ start_time: 0, end_time: null, points: [{ t: 1800 }, { t: 3600 }, { t: 2000 }] }), 1);
    assert.equal(m.flightHours({ start_time: 100, end_time: null, points: [] }), 0);
  });

  test('the reading plus the tail’s hours flown since it, times the correction factor', () => {
    const recordedAt = at('2026-10-01 00:00');
    const flights = [
      { aircraft_tail: 'N1', start_time: recordedAt + 3600, end_time: recordedAt + 3 * 3600 },     // 2 h
      { aircraft_tail: 'N1', start_time: recordedAt, end_time: recordedAt + 3600 },                // 1 h, at the reading
      { aircraft_tail: 'N1', start_time: recordedAt - 3600, end_time: recordedAt },                // before it
      { aircraft_tail: 'N2', start_time: recordedAt + 3600, end_time: recordedAt + 7200 },         // another aircraft
    ];
    assert.equal(m.estimatedMeter(1000, recordedAt, 1.1, 'N1', flights), 1000 + 1.1 * 3);
    assert.equal(m.estimatedMeter(1000, recordedAt, null, 'N1', flights), 1003, 'an unset factor is 1');
    assert.equal(m.estimatedMeter(null, recordedAt, 1, 'N1', flights), null);
    assert.equal(m.estimatedMeter(1000, null, 1, 'N1', flights), null);
  });
});

describe('calendarDueDate', () => {
  test('the end of the last day of the month interval months after the operator month it was done in', () => {
    const due = m.calendarDueDate(TZ, at('2026-01-15 10:00'), 12);
    assert.deepEqual([due.year, due.month], [2027, 1]);
    assert.equal(due.at, at('2027-01-31 23:59') + 59);
    // Across a year end, to a short month.
    const feb = m.calendarDueDate(TZ, at('2026-11-30 12:00'), 3);
    assert.deepEqual([feb.year, feb.month, feb.at], [2027, 2, at('2027-02-28 23:59') + 59]);
  });

  test('done on the evening of Oct 31 in Alaska (Nov 1 in UTC and Europe): due at the end of October', () => {
    const done = at('2025-10-31 18:00');
    assert.equal(time.unixToTzDateStr('Europe/Berlin', done), '2025-11-01');
    const due = m.calendarDueDate(TZ, done, 12);
    assert.deepEqual([due.year, due.month], [2026, 10]);
    // The device's timezone used to decide it: the same record read in Berlin was due in November.
    const berlin = m.calendarDueDate('Europe/Berlin', done, 12);
    assert.deepEqual([berlin.year, berlin.month], [2026, 11]);
  });
});

describe('maintenanceStatus', () => {
  const meter = (type, interval, last) => ({ id: 'x', name: 'Item', schedule_type: type, interval_hours: interval, last_done_value: last });
  const cal = (months, lastDone) => ({ id: 'c', name: 'Annual', schedule_type: 'calendar', interval_months: months, last_done_at: lastDone });

  test('meter items: ok, due soon within 10% of the interval, overdue past it', () => {
    assert.deepEqual(m.maintenanceStatus(TZ, NOW, meter('hobbs', 50, 1000), 1030, null),
      { status: 'ok', remaining_hours: 20, due_label: 'Due in 20.0 hr' });
    assert.deepEqual(m.maintenanceStatus(TZ, NOW, meter('hobbs', 50, 1000), 1045, null),
      { status: 'due_soon', remaining_hours: 5, due_label: 'Due in 5.0 hr' });
    assert.deepEqual(m.maintenanceStatus(TZ, NOW, meter('tach', 100, 800), 0, 902.5),
      { status: 'overdue', remaining_hours: -2.5, due_label: 'Overdue 2.5 hr' });
    // No last service reading counts from zero.
    assert.equal(m.maintenanceStatus(TZ, NOW, meter('tach', 100, undefined), null, 95).status, 'due_soon');
  });

  test('a meter that isn’t recorded, and a calendar item with no service date', () => {
    assert.deepEqual(m.maintenanceStatus(TZ, NOW, meter('hobbs', 50, 0), null, 10),
      { status: 'timer_not_recorded', due_label: 'Hobbs not recorded' });
    assert.deepEqual(m.maintenanceStatus(TZ, NOW, meter('tach', 50, 0), 10, null),
      { status: 'timer_not_recorded', due_label: 'Tach not recorded' });
    assert.deepEqual(m.maintenanceStatus(TZ, NOW, cal(12, null), 0, 0),
      { status: 'timer_not_recorded', due_label: 'Last service date not set' });
  });

  test('calendar items: ok, due soon within 30 days, overdue in whole days', () => {
    const ok = m.maintenanceStatus(TZ, NOW, cal(12, at('2026-01-10 09:00')), null, null);
    assert.deepEqual([ok.status, ok.due_label], ['ok', 'Due Jan 2027']);
    const soon = m.maintenanceStatus(TZ, NOW, cal(12, at('2025-11-02 09:00')), null, null);
    assert.deepEqual([soon.status, soon.due_label], ['due_soon', 'Due Nov 2026']);
    assert.ok(Math.abs(soon.remaining_days - (at('2026-11-30 23:59') + 59 - NOW) / 86400) < 1e-9);
    const over = m.maintenanceStatus(TZ, NOW, cal(12, at('2025-10-31 18:00')), null, null);
    assert.deepEqual([over.status, over.due_label], ['overdue', 'Overdue 3 days']);
  });

  test('reads the clock only from now', () => {
    const realNow = Date.now;
    Date.now = () => { throw new Error('Date.now() read'); };
    try {
      const item = cal(12, at('2025-11-02 09:00'));
      assert.equal(m.maintenanceStatus(TZ, NOW, item, null, null).status, 'due_soon');
      assert.equal(m.maintenanceStatus(TZ, NOW + 40 * 86400, item, null, null).status, 'overdue');
    } finally {
      Date.now = realNow;
    }
  });
});

test('the page’s globals bind the operator timezone and the clock', () => {
  const engine = loadEngine({ now: '2026-11-03 12:00' });
  const item = { id: 'c', name: 'Annual', schedule_type: 'calendar', interval_months: 12, last_done_at: at('2025-10-31 18:00') };
  assert.deepEqual(plain(engine._maintenanceStatus(item, null, null)), m.maintenanceStatus(TZ, NOW, item, null, null));
  const flights = [{ aircraft_tail: 'N1', start_time: NOW - 7200, end_time: NOW - 3600 }];
  assert.equal(engine._estimatedMeter(10, NOW - 86400, 2, 'N1', flights), 12);
});
