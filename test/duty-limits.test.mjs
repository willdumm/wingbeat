// §135.267 daily checks in computeDutyData: (b) 24-hour flight time, (d) look-back rest,
// method (c), (e) extended rest, and the duty-times warnings. Spec:
// docs/duty-log-editing-plan.md, "Regulatory background" and "Compliance review".

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, fixtures } from './harness.mjs';

const engine = loadEngine({ now: '2026-10-15 12:00' });   // March 2026 is a past month
const { flight, duty, warningsOn, matching, dutyMonth, dayOf } = fixtures(engine);

const D1 = '2026-03-10', D2 = '2026-03-11';
const FLIGHT_24 = /flight time in the 24 h/;

describe('(b) flight time in any 24 hours', () => {
  const days = [duty(D1, '06:00', '20:00'), duty(D2, '06:00', '20:00')];

  test('over 8 h of Part 135 warns, rounded up, naming the window end', () => {
    const fl = [flight(`${D1} 07:00`, '11:00'), flight(`${D1} 12:00`, '16:30')];
    assert.deepEqual(warningsOn(fl, D1, { days }), ['8:30 flight time in the 24 h to 16:30 (§135.267(b) limit 8:00)']);
  });

  test('exactly 8 h does not warn', () => {
    const fl = [flight(`${D1} 07:00`, '11:00'), flight(`${D1} 12:00`, '16:00')];
    assert.deepEqual(warningsOn(fl, D1, { days }), []);
  });

  test('40 s over the limit reads 8:01, never 8:00', () => {
    const f = flight(`${D1} 08:00`, '16:00');
    f.end_time += 40;
    assert.deepEqual(matching(warningsOn([f], D1, { days }), FLIGHT_24),
      ['8:01 flight time in the 24 h to 16:00 (§135.267(b) limit 8:00)']);
  });

  test('a rolling window across midnight warns on the later day only', () => {
    const fl = [flight(`${D1} 15:00`, '19:00'), flight(`${D2} 07:00`, '11:30')];
    const data = dutyMonth(fl, D1, { days });
    assert.deepEqual(matching(dayOf(data, D1).warnings, FLIGHT_24), []);
    assert.deepEqual(matching(dayOf(data, D2).warnings, FLIGHT_24),
      ['8:30 flight time in the 24 h to 11:30 (§135.267(b) limit 8:00)']);
  });

  test('flying more than 24 h before a flight’s end is not counted', () => {
    const fl = [flight(`${D1} 06:00`, '11:00'), flight(`${D2} 11:00`, '15:00')];
    assert.deepEqual(matching(warningsOn(fl, D2, { days }), FLIGHT_24), []);
  });

  test('evaluated only at the end of Part 135 flights: a day of paid Part 91 alone never warns', () => {
    const fl = [flight(`${D1} 07:00`, '12:00', { part91: true }), flight(`${D1} 13:00`, '18:00', { part91: true })];
    assert.deepEqual(matching(warningsOn(fl, D1, { days }), FLIGHT_24), []);
  });

  test('paid Part 91 before a Part 135 flight counts (Converse)', () => {
    const fl = [flight(`${D1} 07:00`, '11:00', { part91: true }), flight(`${D1} 12:00`, '16:30')];
    assert.deepEqual(matching(warningsOn(fl, D1, { days }), FLIGHT_24),
      ['8:30 flight time in the 24 h to 16:30 (§135.267(b) limit 8:00)']);
  });

  test('Part 91 after the last Part 135 flight does not count (Converse)', () => {
    const fl = [
      flight(`${D1} 07:00`, '11:00'), flight(`${D1} 11:30`, '15:00'),   // 7:30 of Part 135
      flight(`${D1} 16:00`, '19:00', { part91: true }),
    ];
    assert.deepEqual(matching(warningsOn(fl, D1, { days }), FLIGHT_24), []);
  });

  test('unpaid Part 91 never counts, before or between Part 135 flights', () => {
    const fl = [
      flight(`${D1} 06:00`, '09:00', { unpaid: true }),
      flight(`${D1} 09:30`, '13:30'),
      flight(`${D1} 13:45`, '15:45', { unpaid: true }),
      flight(`${D1} 16:00`, '19:30'),                                    // 7:30 of Part 135
    ];
    assert.deepEqual(matching(warningsOn(fl, D1, { days }), FLIGHT_24), []);
  });

  test('another pilot’s flights are not counted', () => {
    const fl = [flight(`${D1} 07:00`, '11:00', { pilot: 2 }), flight(`${D1} 12:00`, '16:30')];
    assert.deepEqual(matching(warningsOn(fl, D1, { days }), FLIGHT_24), []);
  });
});

describe('(d) 10 consecutive hours of rest in the 24 h before duty ends (method b)', () => {
  const REST_D = /§135\.267\(d\)/;

  test('duty 06:00–20:00 on consecutive days leaves exactly 10 h: no warning', () => {
    const days = [duty(D1, '06:00', '20:00'), duty(D2, '06:00', '20:00')];
    assert.deepEqual(warningsOn([flight(`${D2} 08:00`, '10:00')], D2, { days }), []);
  });

  test('a short gap between duty periods warns with the longest rest', () => {
    const days = [duty(D1, '08:00', '17:00'), duty(D2, '01:00', '10:00')];
    assert.deepEqual(matching(warningsOn([], D2, { days }), REST_D),
      ['Longest rest 8:00 in the 24 h before duty ended 10:00 (§135.267(d) minimum 10:00)']);
  });

  test('a duty period over 14 h names the duty length', () => {
    const days = [duty(D1, '05:00', '20:00')];
    assert.deepEqual(matching(warningsOn([], D1, { days }), REST_D),
      ['Duty period 15:00 leaves at most 9:00 of rest in the 24 h before duty ended 20:00 (§135.267(d) minimum 10:00)']);
  });

  test('no separate 14-hour duty limit under (b)', () => {
    const days = [duty(D1, '05:00', '20:00')];
    assert.deepEqual(matching(warningsOn([], D1, { days }), /limit 14:00/), []);
  });

  test('a flight outside duty breaks the rest', () => {
    const days = [duty(D1, '08:00', '12:00'), duty(D2, '08:00', '17:00')];
    // Without it: 17:00–08:00 is 15 h of rest.
    assert.deepEqual(matching(warningsOn([flight(`${D1} 09:00`, '10:00')], D2, { days }), REST_D), []);
    const fl = [flight(`${D1} 09:00`, '10:00'), flight(`${D1} 22:00`, '23:00')];
    const data = dutyMonth(fl, D1, { days });
    assert.deepEqual(matching(dayOf(data, D2).warnings, REST_D),
      ['Longest rest 9:00 in the 24 h before duty ended 17:00 (§135.267(d) minimum 10:00)']);
    assert.deepEqual(matching(dayOf(data, D1).warnings, /outside duty/), ['Flight 22:00–23:00 outside duty 08:00–12:00']);
  });
});

describe('method (c): regularly assigned duty period', () => {
  const regular = { duty_start: '08:00', duty_end: '17:00' };
  const c = (days, defaultDuty = regular) => ({ days, defaultDuty, method: 'c' });

  test('the regular duty on consecutive days: no warnings', () => {
    const days = [duty(D1, '08:00', '17:00'), duty(D2, '08:00', '17:00')];
    const fl = [flight(`${D1} 09:00`, '12:00'), flight(`${D2} 09:00`, '12:00')];
    assert.deepEqual(warningsOn(fl, D2, c(days)), []);
  });

  test('duty over 14 h is a hard limit', () => {
    const days = [duty(D1, '05:00', '20:00')];
    assert.deepEqual(warningsOn([], D1, c(days, { duty_start: '05:00', duty_end: '20:00' })),
      ['Duty period 15:00 (§135.267(c) limit 14:00)']);
  });

  test('rest under 10 h between consecutive duty periods warns on the later day', () => {
    const days = [duty(D1, '08:00', '23:00'), duty(D2, '08:00', '17:00')];
    const data = dutyMonth([], D1, c(days));
    assert.deepEqual(matching(dayOf(data, D2).warnings, /Rest before duty/),
      ['Rest before duty 9:00 (§135.267(c) minimum 10:00)']);
    assert.deepEqual(matching(dayOf(data, D1).warnings, /Rest before duty/), []);
  });

  test('a flight past the duty end shortens the rest after it', () => {
    const days = [duty(D1, '08:00', '17:00'), duty(D2, '08:00', '17:00')];
    const fl = [flight(`${D1} 21:00`, '23:30')];
    assert.deepEqual(matching(warningsOn(fl, D2, c(days)), /Rest before duty/),
      ['Rest before duty 8:30 (§135.267(c) minimum 10:00)']);
  });

  // Spec: "Less than 10 h of rest between consecutive duty periods" warns. buildDay only
  // considers previous spans that end by the day's start (x.end <= span.start), so when the
  // previous day's busy time runs INTO this day's duty (an overnight flight landing after
  // it starts, or a previous duty past midnight that overlaps it) there's no rest at all
  // and no "Rest before duty" warning. Other warnings usually fire as well ((e), "outside
  // duty", "earlier than the previous day's"), but not this one.
  test('busy time overlapping the next duty period is rest under 10 h', {
    todo: 'engine skips overlapping previous spans in the (c) rest check (x.end <= span.start)',
  }, () => {
    const days = [duty(D1, '08:00', '17:00'), duty(D2, '08:00', '17:00')];
    const fl = [flight(`${D1} 23:00`, `${D2} 08:15`)];
    assert.equal(matching(warningsOn(fl, D2, c(days)), /^Rest before duty/).length, 1);
    const overlapping = [duty(D1, '20:00', '09:00'), duty(D2, '08:00', '17:00')];
    assert.equal(matching(warningsOn([], D2, c(overlapping)), /^Rest before duty/).length, 1);
  });

  test('duty differing from the default, starting earlier than the previous day’s', () => {
    const days = [duty(D1, '08:00', '17:00'), duty(D2, '07:00', '16:00')];
    assert.deepEqual(warningsOn([], D2, c(days)), [
      'Duty 07:00–16:00 differs from the regularly assigned 08:00–17:00 (§135.267(c))',
      'Duty starts 07:00, earlier than the previous day’s 08:00, so duty plus rest is under 24 h (§135.267(c))',
    ]);
  });

  test('a later start than the previous day’s is fine apart from differing', () => {
    const days = [duty(D1, '08:00', '17:00'), duty(D2, '09:00', '18:00')];
    assert.deepEqual(warningsOn([], D2, c(days)),
      ['Duty 09:00–18:00 differs from the regularly assigned 08:00–17:00 (§135.267(c))']);
  });

  test('no default duty: "No regularly assigned duty period" on a flying day', () => {
    const days = [duty(D1, '08:00', '17:00')];
    assert.deepEqual(matching(warningsOn([flight(`${D1} 09:00`, '10:00')], D1, c(days, null)), /regularly assigned/),
      ['No regularly assigned duty period: set the pilot’s default duty (§135.267(c))']);
  });

  test('commercial flight time in the duty period over 8 h', () => {
    const days = [duty(D1, '06:00', '19:00')];
    const fl = [
      flight(`${D1} 06:30`, '10:30', { part91: true }),   // paid, before: counts
      flight(`${D1} 11:00`, '15:30'),
      flight(`${D1} 16:00`, '18:00', { part91: true }),   // after the last Part 135: doesn't
    ];
    assert.deepEqual(matching(warningsOn(fl, D1, c(days, { duty_start: '06:00', duty_end: '19:00' })), /flight time/),
      ['8:30 flight time in the duty period (§135.267(c) limit 8:00)']);
  });
});

describe('(e) extended rest after going over the daily limit', () => {
  const EXT = /§135\.267\(e\)/;
  // D1: duty 06:00–18:00 and Part 135 flying of 8 h + over; D2: duty from restStart.
  function extWarnings(over, nextDutyStart) {
    const fl = [flight(`${D1} 07:00`, '11:00'), flight(`${D1} 12:00`, '16:00')];
    fl[1].end_time += over * 60;
    const days = [duty(D1, '06:00', '18:00'), duty(D2, nextDutyStart, '23:00')];
    return matching(warningsOn(fl, D2, { days }), EXT);
  }

  test('over by up to 30 min: 11 h', () => {
    assert.deepEqual(extWarnings(20, '04:30'),
      ['Rest 10:30 after going 0:20 over the flight time limit on Mar 10 (§135.267(e) minimum 11:00)']);
    assert.deepEqual(extWarnings(20, '05:00'), []);
    assert.deepEqual(extWarnings(30, '05:00'), [], 'exactly 30 min over still needs only 11 h');
  });

  test('over by up to 60 min: 12 h', () => {
    assert.deepEqual(extWarnings(45, '05:30'),
      ['Rest 11:30 after going 0:45 over the flight time limit on Mar 10 (§135.267(e) minimum 12:00)']);
    assert.deepEqual(extWarnings(45, '06:00'), []);
    assert.deepEqual(extWarnings(60, '06:00'), [], 'exactly 60 min over still needs only 12 h');
  });

  test('over by more than 60 min: 16 h', () => {
    assert.deepEqual(extWarnings(90, '09:00'),
      ['Rest 15:00 after going 1:30 over the flight time limit on Mar 10 (§135.267(e) minimum 16:00)']);
    assert.deepEqual(extWarnings(90, '10:00'), []);
  });

  test('rest runs from the later of duty end and last flight', () => {
    const fl = [flight(`${D1} 07:00`, '11:00'), flight(`${D1} 14:00`, '18:20')];   // 8:20, lands after duty
    const days = [duty(D1, '06:00', '17:00'), duty(D2, '05:00', '15:00')];
    assert.deepEqual(matching(warningsOn(fl, D2, { days }), EXT),
      ['Rest 10:40 after going 0:20 over the flight time limit on Mar 10 (§135.267(e) minimum 11:00)']);
  });

  test('no next-day duty or flights: nothing to check', () => {
    const fl = [flight(`${D1} 07:00`, '11:00'), flight(`${D1} 12:00`, '17:00')];
    assert.deepEqual(matching(warningsOn(fl, D2, { days: [duty(D1, '06:00', '18:00')] }), EXT), []);
  });
});

describe('duty times', () => {
  test('a flying day with no duty times recorded warns', () => {
    assert.deepEqual(warningsOn([flight(`${D1} 09:00`, '10:00')], D1),
      ['No duty times recorded: record the duty period, including any on-call or standby time']);
  });

  test('a note-only record is like no record', () => {
    const days = [{ date: D1, duty_start: null, duty_end: null, rest: 0, rest_designated_at: null, note: 'Weather' }];
    assert.deepEqual(warningsOn([flight(`${D1} 09:00`, '10:00')], D1, { days }),
      ['No duty times recorded: record the duty period, including any on-call or standby time']);
  });

  test('the default duty applies on a flying day with no record', () => {
    const defaultDuty = { duty_start: '08:00', duty_end: '17:00' };
    const data = dutyMonth([flight(`${D1} 09:00`, '10:00')], D1, { defaultDuty });
    const day = dayOf(data, D1);
    assert.equal(day.defaultDuty, true);
    assert.equal(day.duty.isDefault, true);
    assert.equal(day.duty.secs, 9 * 3600);
    assert.equal(engine.dutyDayText(day, 2026), '08:00–17:00 (default)');
    assert.deepEqual([...day.warnings], []);
    assert.equal(dayOf(data, D2).duty, null, 'not on a day without flights');
  });

  test('a recorded duty overrides the default', () => {
    const defaultDuty = { duty_start: '08:00', duty_end: '17:00' };
    const data = dutyMonth([flight(`${D1} 09:00`, '10:00')], D1, { defaultDuty, days: [duty(D1, '07:00', '15:00')] });
    const day = dayOf(data, D1);
    assert.equal(day.defaultDuty, false);
    assert.equal(engine.dutyDayText(day, 2026), '07:00–15:00');
  });

  test('flights outside the duty period warn, marked (default) for the default', () => {
    const defaultDuty = { duty_start: '08:00', duty_end: '17:00' };
    const fl = [flight(`${D1} 07:30`, '09:00'), flight(`${D1} 16:30`, '17:30'), flight(`${D1} 12:00`, '13:00')];
    assert.deepEqual(warningsOn(fl, D1, { defaultDuty }), [
      'Flight 07:30–09:00 outside duty 08:00–17:00 (default)',
      'Flight 16:30–17:30 outside duty 08:00–17:00 (default)',
    ]);
    assert.deepEqual(warningsOn(fl, D1, { days: [duty(D1, '07:00', '18:00')] }), []);
  });

  test('a duty end at or before its start runs past midnight', () => {
    const day = dayOf(dutyMonth([], D1, { days: [duty(D1, '18:00', '02:00')] }), D1);
    assert.equal(day.duty.secs, 8 * 3600);
    assert.equal(engine.unixToTzDateStr(day.duty.end), D2);
  });
});
