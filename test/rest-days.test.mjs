// Days marked rest (§135.267(f) 24-hour rest periods): restProblems() warnings in the row
// model, and which rest days the totals count.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, fixtures } from './harness.mjs';

const engine = loadEngine({ now: '2026-10-15 12:00' });
const { flight, duty, rest, warningsOn, dutyMonth, dayOf, at } = fixtures(engine);

const PREV = '2026-03-11', REST = '2026-03-12';

describe('rest day warnings', () => {
  test('a rest day designated in advance, after a day off, has no warnings', () => {
    const data = dutyMonth([], REST, { days: [rest(REST)] });
    const day = dayOf(data, REST);
    assert.equal(day.rest, true);
    assert.equal(day.duty, null);
    assert.deepEqual([...day.warnings], []);
    assert.equal(engine.dutyDayText(day, 2026), 'Rest · designated Mar 5');
  });

  test('flights on a rest day', () => {
    assert.deepEqual(warningsOn([flight(`${REST} 10:00`, '11:00')], REST, { days: [rest(REST)] }),
      ['Flights on a rest day']);
  });

  test('designated on the day itself is not prospective', () => {
    assert.deepEqual(warningsOn([], REST, { days: [rest(REST, { designated: `${REST} 07:00` })] }),
      ['Rest day designated Mar 12, not in advance']);
  });

  test('designated after the day is not prospective', () => {
    assert.deepEqual(warningsOn([], REST, { days: [rest(REST, { designated: '2026-03-14 09:00' })] }),
      ['Rest day designated Mar 14, not in advance']);
  });

  test('designated the evening before is in advance', () => {
    assert.deepEqual(warningsOn([], REST, { days: [rest(REST, { designated: `${PREV} 23:59` })] }), []);
  });

  test('the previous day’s duty past midnight', () => {
    const days = [duty(PREV, '16:00', '00:30'), rest(REST)];
    assert.deepEqual(warningsOn([], REST, { days }),
      ['Previous duty or flight ended 00:30, so this rest is under 24 h']);
  });

  test('the previous day’s duty ending exactly at midnight is fine', () => {
    const days = [duty(PREV, '15:00', '00:00'), rest(REST)];
    assert.deepEqual(warningsOn([], REST, { days }), []);
  });

  test('the previous day’s flight landing past midnight, outside its duty', () => {
    const days = [duty(PREV, '08:00', '17:00'), rest(REST)];
    const fl = [flight(`${PREV} 23:30`, '00:40')];
    assert.deepEqual(warningsOn(fl, REST, { days }),
      ['Previous duty or flight ended 00:40, so this rest is under 24 h']);
  });

  test('the previous day’s flight landing past midnight with no duty recorded', () => {
    const fl = [flight(`${PREV} 23:30`, '00:40')];
    const data = dutyMonth(fl, REST, { days: [rest(REST)] });
    assert.deepEqual([...dayOf(data, REST).warnings],
      ['Previous duty or flight ended 00:40, so this rest is under 24 h']);
    // The flight departs on PREV, so it isn't a flight "on" the rest day.
    assert.equal(dayOf(data, REST).flights.length, 0);
  });

  test('the previous day’s default duty past midnight counts on a flying day', () => {
    const defaultDuty = { duty_start: '17:00', duty_end: '01:00' };
    const fl = [flight(`${PREV} 18:00`, '19:00')];
    assert.deepEqual(warningsOn(fl, REST, { days: [rest(REST)], defaultDuty }),
      ['Previous duty or flight ended 01:00, so this rest is under 24 h']);
  });

  test('a rest day suppresses "No duty times recorded"', () => {
    const w = warningsOn([flight(`${REST} 10:00`, '11:00')], REST, { days: [rest(REST)] });
    assert.ok(!w.some(x => /No duty times/.test(x)), w.join('; '));
  });
});

describe('rest days in the totals', () => {
  // Q1 2026, as of Mar 20 noon: 10 rest days in March.
  const asOf = at('2026-03-20 12:00');
  const restOf = (days, flights = []) => engine.dutyTotals(flights, 1, asOf, { days }).rest;

  test('counts valid rest days taken in the quarter', () => {
    const r = restOf([rest('2026-01-04'), rest('2026-02-01'), rest('2026-03-01'), rest('2026-03-20')]);
    assert.equal(r.taken, 4);
    assert.equal(r.scheduled, 0);
    assert.equal(r.required, 13);
    assert.equal(r.label, '24 h rest periods, Q1 2026');
  });

  test('rest days outside the quarter are not counted', () => {
    const r = restOf([rest('2025-12-31'), rest('2026-04-01')]);
    assert.equal(r.taken + r.scheduled, 0);
  });

  test('rest days with problems are not counted', () => {
    const days = [
      rest('2026-03-02'),                                          // ok
      rest('2026-03-03'),                                          // flight on it
      rest('2026-03-05', { designated: '2026-03-05 08:00' }),      // not in advance
      duty('2026-03-06', '16:00', '01:00'), rest('2026-03-07'),    // previous duty past midnight
      rest('2026-03-09'),                                          // previous flight lands past midnight
    ];
    const flights = [flight('2026-03-03 10:00', '11:00'), flight('2026-03-08 23:00', '00:30')];
    assert.equal(restOf(days, flights).taken, 1);
  });

  test('another pilot’s flight does not spoil the rest day', () => {
    assert.equal(restOf([rest('2026-03-03')], [flight('2026-03-03 10:00', '11:00', { pilot: 2 })]).taken, 1);
  });

  test('planned (future) rest days in the quarter count as scheduled', () => {
    const r = restOf([rest('2026-03-10'), rest('2026-03-21'), rest('2026-03-31'), rest('2026-04-02')]);
    assert.equal(r.taken, 1);
    assert.equal(r.scheduled, 2);
  });

  test('short: 13 can no longer be reached even with every remaining day as rest', () => {
    // Mar 21–31 is 11 days: 1 taken + 11 left = 12 < 13.
    assert.equal(restOf([rest('2026-03-10')]).short, true);
    assert.equal(restOf([rest('2026-03-10'), rest('2026-03-11')]).short, false);
  });

  test('the row model’s totals use the same rule (current month, as of now)', () => {
    const e = loadEngine({ now: '2026-03-20 12:00' });
    const fx = fixtures(e);
    const data = fx.dutyMonth([fx.flight('2026-03-03 10:00', '11:00')], '2026-03',
      { days: [fx.rest('2026-03-02'), fx.rest('2026-03-03'), fx.rest('2026-03-25')] });
    assert.equal(data.isCurrentMonth, true);
    assert.equal(data.totals.rest.taken, 1);
    assert.equal(data.totals.rest.scheduled, 1);
    assert.equal(data.days.length, 20, 'days run through today');
    assert.deepEqual(data.upcoming.map(u => u.dateKey), ['2026-03-25']);
  });
});
