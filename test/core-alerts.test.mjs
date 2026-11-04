// @wingbeat/core/alerts, imported directly: which flights, aircraft and pilots the
// dashboard's alerts feed flags, how each alert reads (times in the operator's timezone),
// and the order they're listed in. The feed had no tests before it moved to core.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore, plain, TZ } from './core.mjs';
import { loadEngine } from './harness.mjs';

const { computeAlerts, sortAlerts } = await importCore('alerts');
const time = await importCore('time');
const at = (s) => time.tzLocalToEpoch(TZ, ...s.split(' '));
const NOW = at('2026-11-03 12:00');

let nextId = 1;
const flight = (dep, hours, over = {}) => ({
  id: nextId++, tracker_id: 1, start_time: at(dep), end_time: at(dep) + hours * 3600,
  pilot_id: 1, aircraft_tail: 'N1', origin_label: 'Kodiak', destination_label: 'Larsen Bay', ...over,
});
const aircraft = (tail, over = {}) => ({
  tail_number: tail, name: null, active: 1,
  hobbs_time: null, hobbs_recorded_at: null, hobbs_correction: 1, tach_time: null, tach_recorded_at: null, tach_correction: 1,
  maintenance_schedule: null, ...over,
});
const lists = (over = {}) => ({
  flights: [],
  aircraft: [aircraft('N1'), aircraft('N9', { active: 0 })],
  pilots: [{ id: 1, name: 'Pat', active: 1 }, { id: 2, name: 'Quinn', active: 1 }, { id: 9, name: 'Gone', active: 0 }],
  trackers: [{ id: 1, active: 1, deleted: 0 }, { id: 2, active: 0, deleted: 0 }, { id: 3, active: 1, deleted: 1 }],
  ...over,
});
const of = (alerts, kind) => alerts.filter(a => a.kind === kind);

describe('unassigned flights', () => {
  test('flagged for 30 days, with the operator’s day and time, whatever the device’s', () => {
    const late = flight('2026-11-02 23:30', 1, { pilot_id: null });
    const alerts = computeAlerts(TZ, NOW, lists({ flights: [late] }));
    assert.deepEqual(alerts, [{
      kind: 'unassigned_flight', flight_id: late.id, flight_label: 'Nov 2 · N1 · no pilot', flight_time_str: '23:30 AKST',
      flight_origin: 'Kodiak', flight_destination: 'Larsen Bay', start_time: late.start_time, missing: ['pilot'], urgency: 'immediate',
    }]);
  });

  test('missing the aircraft, or both', () => {
    const labels = computeAlerts(TZ, NOW, lists({ flights: [
      flight('2026-10-20 09:00', 1, { aircraft_tail: null }),
      flight('2026-10-21 09:00', 1, { aircraft_tail: null, pilot_id: null }),
    ] })).map(a => [a.flight_label, a.missing]);
    assert.deepEqual(labels, [['Oct 20 · no aircraft', ['aircraft']], ['Oct 21 · no aircraft or pilot', ['aircraft', 'pilot']]]);
  });

  test('not flagged: older than 30 days, assigned, a manual flight, an inactive or deleted tracker, an inactive aircraft or pilot', () => {
    const alerts = computeAlerts(TZ, NOW, lists({ flights: [
      flight('2026-10-03 11:00', 1, { pilot_id: null }),
      flight('2026-11-01 09:00', 1),
      flight('2026-11-01 10:00', 1, { tracker_id: null, pilot_id: null }),
      flight('2026-11-01 11:00', 1, { tracker_id: 2, pilot_id: null }),
      flight('2026-11-01 12:00', 1, { tracker_id: 3, pilot_id: null }),
      flight('2026-11-01 13:00', 1, { aircraft_tail: 'N9', pilot_id: null }),
      flight('2026-11-01 14:00', 1, { aircraft_tail: null, pilot_id: 9 }),
    ] }));
    assert.deepEqual(alerts, []);
  });

  test('a flight from last year shows its year', () => {
    const jan = at('2027-01-10 12:00');
    const [a] = computeAlerts(TZ, jan, lists({ flights: [flight('2026-12-30 09:00', 1, { pilot_id: null })] }));
    assert.equal(a.flight_label, 'Dec 30, 2026 · N1 · no pilot');
  });
});

describe('maintenance', () => {
  const schedule = [
    { id: 'oil', name: 'Oil change', schedule_type: 'hobbs', interval_hours: 50, last_done_value: 960 },   // due at 1010: 5 h left
    { id: 'prop', name: 'Prop', schedule_type: 'hobbs', interval_hours: 500, last_done_value: 400 },     // overdue 105 h
    { id: '100h', name: '100 hour', schedule_type: 'tach', interval_hours: 100, last_done_value: 0 },
    { id: 'ann', name: 'Annual', schedule_type: 'calendar', interval_months: 12, last_done_at: at('2025-11-10 09:00') },  // due Nov 30
    { id: 'elt', name: 'ELT', schedule_type: 'calendar', interval_months: 12 },
    { id: 'pitot', name: 'Pitot-static', schedule_type: 'calendar', interval_months: 24, last_done_at: at('2024-09-01 09:00') },
    { id: 'ok', name: 'Fine', schedule_type: 'hobbs', interval_hours: 500, last_done_value: 900 },
  ];
  // Hobbs 1000 recorded a month ago, 5 hours flown since (in the last 30 days).
  const recorded = NOW - 31 * 86400;
  const n1 = aircraft('N1', { name: 'Cub', hobbs_time: 1000, hobbs_recorded_at: recorded, maintenance_schedule: schedule });
  const flights = [flight('2026-10-20 09:00', 5)];

  test('overdue items are immediate, due-soon items due soon; missing readings and dates are grouped per meter', () => {
    const alerts = computeAlerts(TZ, NOW, lists({ flights, aircraft: [n1, aircraft('N9', { active: 0, maintenance_schedule: schedule })] }));
    assert.deepEqual(alerts.map(a => [a.kind, a.urgency, a.item?.name ?? a.timer_type, a.status?.due_label ?? a.needed_for]), [
      ['timer_not_recorded', 'immediate', 'tach', '100 hour'],
      ['timer_not_recorded', 'immediate', 'calendar', 'ELT'],
      // Soonest first: 105 hours over at 5/30 hours a day is 630 days, before 34 days.
      ['maintenance', 'immediate', 'Prop', 'Overdue 105.0 hr'],
      ['maintenance', 'immediate', 'Pitot-static', 'Overdue 34 days'],
      // Annual is due in 27.5 days, the oil change in 30 (5 hours at 5/30 a day).
      ['maintenance', 'due_soon', 'Annual', 'Due Nov 2026'],
      ['maintenance', 'due_soon', 'Oil change', 'Due in 5.0 hr'],
    ]);
    const oil = alerts.find(a => a.item?.id === 'oil');
    // 5 hours left at the last 30 days' 5/30 hours a day.
    assert.ok(Math.abs(oil._estDays - 30) < 1e-9);
    assert.equal(oil.aircraft_name, 'Cub');
  });

  test('a meter item with no recent flying has no estimate, and sorts after the ones that do', () => {
    // No flights since the reading: the oil change, with 5 hours left, has no estimate in days.
    const oil = { ...schedule[0], last_done_value: 955 };
    const alerts = computeAlerts(TZ, NOW, lists({ aircraft: [{ ...n1, maintenance_schedule: [oil, schedule[3]] }] }));
    const dueSoon = alerts.filter(a => a.urgency === 'due_soon').map(a => [a.item.name, a._estDays === null]);
    assert.deepEqual(dueSoon, [['Annual', false], ['Oil change', true]]);
  });
});

describe('pilot duty', () => {
  test('the worst limit at 90% or more, per active pilot', () => {
    const flights = [
      flight('2026-11-03 01:00', 7.5, { pilot_id: 2 }),
      flight('2026-11-03 01:00', 7.5, { pilot_id: 9, tracker_id: null }),
      flight('2026-11-03 01:00', 7, { pilot_id: 1, tracker_id: null }),
    ];
    const duty = of(computeAlerts(TZ, NOW, lists({ flights })), 'pilot_duty');
    assert.deepEqual(duty, [{
      kind: 'pilot_duty', pilot_id: 2, pilot_name: 'Quinn', window_label: 'Last 24 h', hours_flown: 7.5, limit_hours: 8,
      pct: 0.9375, urgency: 'due_soon',
    }]);
  });
});

test('sortAlerts: immediate (unassigned oldest first, readings by tail, maintenance soonest), then due soon (maintenance, pilots highest share)', () => {
  const sorted = sortAlerts([
    { kind: 'pilot_duty', urgency: 'due_soon', pct: 0.91, id: 'p91' },
    { kind: 'maintenance', urgency: 'due_soon', _estDays: null, id: 'ds-none' },
    { kind: 'maintenance', urgency: 'due_soon', _estDays: 3, id: 'ds3' },
    { kind: 'pilot_duty', urgency: 'due_soon', pct: 0.99, id: 'p99' },
    { kind: 'maintenance', urgency: 'immediate', _estDays: -2, id: 'm-2' },
    { kind: 'maintenance', urgency: 'immediate', _estDays: -40, id: 'm-40' },
    { kind: 'timer_not_recorded', urgency: 'immediate', aircraft_tail: 'N2', id: 'tN2' },
    { kind: 'unassigned_flight', urgency: 'immediate', start_time: 20, id: 'u20' },
    { kind: 'timer_not_recorded', urgency: 'immediate', aircraft_tail: 'N1', id: 'tN1' },
    { kind: 'unassigned_flight', urgency: 'immediate', start_time: 10, id: 'u10' },
  ]);
  assert.deepEqual(sorted.map(a => a.id), ['u10', 'u20', 'tN1', 'tN2', 'm-40', 'm-2', 'ds3', 'ds-none', 'p99', 'p91']);
});

test('reads the clock only from now, and the page’s global binds the operator timezone and the clock', () => {
  const input = lists({ flights: [flight('2026-11-02 23:30', 1, { pilot_id: null }), flight('2026-11-03 01:00', 7.5, { pilot_id: 2 })] });
  const realNow = Date.now;
  Date.now = () => { throw new Error('Date.now() read'); };
  let direct;
  try {
    direct = computeAlerts(TZ, NOW, input);
  } finally {
    Date.now = realNow;
  }
  assert.equal(direct.length, 2);
  const engine = loadEngine({ now: '2026-11-03 12:00' });
  assert.deepEqual(plain(engine.computeAlertsFor(input)), direct);
});
