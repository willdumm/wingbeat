// Daylight-saving transitions in America/Anchorage (2026-03-08 02:00 AKST → 03:00 AKDT,
// 2026-11-01 02:00 AKDT → 01:00 AKST): the calendar helpers (time.ts) and the duty log's
// days and intervals.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, fixtures } from './harness.mjs';

const engine = loadEngine({ now: '2026-12-15 12:00' });
const { flight, duty, rest, dutyMonth, dayOf } = fixtures(engine);
const H = 3600;
const utc = (iso) => Date.parse(iso) / 1000;

describe('tzCalendarScript', () => {
  test('tzLocalToEpoch on ordinary days, standard and daylight time', () => {
    assert.equal(engine.tzLocalToEpoch('2026-01-15', '08:00'), utc('2026-01-15T17:00:00Z'));   // AKST, UTC-9
    assert.equal(engine.tzLocalToEpoch('2026-07-15', '08:00'), utc('2026-07-15T16:00:00Z'));   // AKDT, UTC-8
    assert.equal(engine.tzLocalToEpoch('2026-07-15'), utc('2026-07-15T08:00:00Z'), 'defaults to midnight');
  });

  test('tzLocalToEpoch either side of the spring-forward gap', () => {
    assert.equal(engine.tzLocalToEpoch('2026-03-08', '01:00'), utc('2026-03-08T10:00:00Z'));
    assert.equal(engine.tzLocalToEpoch('2026-03-08', '03:00'), utc('2026-03-08T11:00:00Z'));
    assert.equal(engine.tzLocalToEpoch('2026-03-08', '12:00') - engine.tzLocalToEpoch('2026-03-08', '00:00'), 11 * H);
  });

  test('tzLocalToEpoch either side of the fall-back overlap', () => {
    assert.equal(engine.tzLocalToEpoch('2026-11-01', '00:00'), utc('2026-11-01T08:00:00Z'));
    assert.equal(engine.tzLocalToEpoch('2026-11-01', '03:00'), utc('2026-11-01T12:00:00Z'));
    assert.equal(engine.tzLocalToEpoch('2026-11-01', '12:00') - engine.tzLocalToEpoch('2026-11-01', '00:00'), 13 * H);
  });

  test('unixToTzDateStr / unixToTzTime / unixToTzMonthKey', () => {
    const t = utc('2026-04-01T07:59:00Z');           // Mar 31 23:59 AKDT
    assert.equal(engine.unixToTzDateStr(t), '2026-03-31');
    assert.equal(engine.unixToTzTime(t), '23:59');
    assert.equal(engine.unixToTzMonthKey(t), '2026-03');
    assert.equal(engine.unixToTzDateStr(t + 60), '2026-04-01');
    // The repeated hour on Nov 1 is still Nov 1, both times round.
    assert.equal(engine.unixToTzTime(utc('2026-11-01T09:30:00Z')), '01:30');
    assert.equal(engine.unixToTzTime(utc('2026-11-01T10:30:00Z')), '01:30');
    assert.equal(engine.unixToTzDateStr(utc('2026-11-01T10:30:00Z')), '2026-11-01');
  });

  test('tzAddDays crosses month and year ends', () => {
    assert.equal(engine.tzAddDays('2026-02-28', 1), '2026-03-01');
    assert.equal(engine.tzAddDays('2026-01-01', -1), '2025-12-31');
    assert.equal(engine.tzAddDays('2026-03-08', 1), '2026-03-09');
  });
});

describe('duty log across DST', () => {
  for (const [label, month, dstDay] of [['spring forward', '2026-03', '2026-03-08'], ['fall back', '2026-11', '2026-11-01']]) {
    const before = engine.tzAddDays(dstDay, -1), after = engine.tzAddDays(dstDay, 1);
    const keys = [before, dstDay, after];

    test(`${label}: every day of the month once, in order`, () => {
      const data = dutyMonth([], month);
      const dk = data.days.map(d => d.dateKey);
      assert.equal(new Set(dk).size, dk.length);
      assert.equal(dk[0], month + '-01');
      assert.ok(dk.includes(dstDay));
      for (let i = 1; i < dk.length; i++) assert.equal(dk[i], engine.tzAddDays(dk[i - 1], 1));
    });

    test(`${label}: regular duty and flying on the days around it give no warnings`, () => {
      const days = keys.map(k => duty(k, '08:00', '17:00'));
      const fl = keys.flatMap(k => [flight(`${k} 09:00`, '12:00'), flight(`${k} 13:00`, '16:00')]);
      for (const method of ['b', 'c']) {
        const data = dutyMonth(fl, month, { days, method, defaultDuty: { duty_start: '08:00', duty_end: '17:00' } });
        for (const k of keys) assert.deepEqual([...dayOf(data, k).warnings], [], `${method} ${k}`);
      }
    });

    test(`${label}: the default duty on the day is not flagged as differing or earlier (c)`, () => {
      const fl = keys.map(k => flight(`${k} 09:00`, '12:00'));
      const data = dutyMonth(fl, month, { method: 'c', defaultDuty: { duty_start: '06:00', duty_end: '18:00' } });
      for (const k of keys) assert.deepEqual([...dayOf(data, k).warnings], [], k);
    });

    test(`${label}: a rest day after a duty ending before midnight is fine`, () => {
      const days = [duty(before, '08:00', '23:00'), rest(dstDay), duty(after, '08:00', '17:00')];
      const data = dutyMonth([], month, { days });
      assert.deepEqual([...dayOf(data, dstDay).warnings], []);
    });

    test(`${label}: a flight in the night stays on its local day`, () => {
      const f = flight(`${dstDay} 01:30`, '04:00');
      const data = dutyMonth([f], month, { days: [duty(dstDay, '01:00', '05:00')] });
      assert.equal(dayOf(data, dstDay).flights.length, 1);
      assert.deepEqual([...dayOf(data, dstDay).warnings], []);
    });
  }

  test('a duty period through the spring-forward night is an hour shorter', () => {
    const d = dayOf(dutyMonth([], '2026-03', { days: [duty('2026-03-07', '22:00', '06:00')] }), '2026-03-07');
    assert.equal(d.duty.secs, 7 * H);
    assert.equal(dayOf(dutyMonth([], '2026-03', { days: [duty('2026-03-08', '08:00', '17:00')] }), '2026-03-08').duty.secs, 9 * H);
  });

  test('a duty period through the fall-back night is an hour longer', () => {
    const d = dayOf(dutyMonth([], '2026-10', { days: [duty('2026-10-31', '22:00', '06:00')] }), '2026-10-31');
    assert.equal(d.duty.secs, 9 * H);
  });

  test('daily flight time is in real hours across the change', () => {
    // 02:00 doesn't exist on Mar 8; 00:30–10:00 local is 8:30 of real time.
    const days = [duty('2026-03-08', '00:00', '11:00')];
    const data = dutyMonth([flight('2026-03-08 00:30', '10:00')], '2026-03', { days });
    assert.equal(dayOf(data, '2026-03-08').daySecs, 8.5 * H);
    assert.ok(dayOf(data, '2026-03-08').warnings.some(w => w.startsWith('8:30 flight time in the 24 h')));
  });
});
