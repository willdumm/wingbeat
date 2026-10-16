// The pilot's default duty and the operator's §135.267 method as dated lists (migration
// 0005): each day uses the entry in force on it, the earliest entry also applies before its
// date, and a later entry doesn't change the days before it, so a past month comes out the
// same. Spec: docs/duty-log-editing-plan.md, "Dated default duty and method".

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, fixtures, plain } from './harness.mjs';

const engine = loadEngine({ now: '2026-10-15 12:00' });   // May and June 2026 are past months
const { flight, duty, rest, warningsOn, matching, dutyMonth, dayOf } = fixtures(engine);

const def = (effective_date, duty_start, duty_end) => ({ effective_date, duty_start, duty_end });
const meth = (effective_date, method) => ({ effective_date, method });

describe('the entry in force on a date (dutyEntryOn)', () => {
  const list = [def('2026-06-15', '07:00', '16:00'), def('2026-05-01', '08:00', '17:00')];   // any order

  test('the latest entry on or before the date', () => {
    assert.equal(engine.dutyEntryOn(list, '2026-06-14').effective_date, '2026-05-01');
    assert.equal(engine.dutyEntryOn(list, '2026-06-15').effective_date, '2026-06-15');
    assert.equal(engine.dutyEntryOn(list, '2026-09-01').effective_date, '2026-06-15');
  });

  test('the earliest entry also applies before its date', () => {
    assert.equal(engine.dutyEntryOn(list, '2026-01-01').effective_date, '2026-05-01');
    assert.deepEqual(plain(engine.dutyDefaultOn([def('2026-06-01', '08:00', '17:00')], '2025-12-31')),
      def('2026-06-01', '08:00', '17:00'));
  });

  test('no entries: no default, and method (b)', () => {
    assert.equal(engine.dutyEntryOn([], '2026-06-01'), null);
    assert.equal(engine.dutyDefaultOn([], '2026-06-01'), null);
    assert.equal(engine.dutyMethodOn([], '2026-06-01'), 'b');
  });

  test('an entry with no times is no default from its date', () => {
    const cleared = [def('2026-05-01', '08:00', '17:00'), def('2026-06-01', null, null)];
    assert.equal(engine.dutyDefaultOn(cleared, '2026-05-31').duty_start, '08:00');
    assert.equal(engine.dutyDefaultOn(cleared, '2026-06-01'), null);
  });

  test('the method in force', () => {
    const methods = [meth('2026-06-15', 'c'), meth('2026-05-01', 'b')];
    assert.equal(engine.dutyMethodOn(methods, '2026-04-01'), 'b');
    assert.equal(engine.dutyMethodOn(methods, '2026-06-14'), 'b');
    assert.equal(engine.dutyMethodOn(methods, '2026-06-15'), 'c');
    assert.equal(engine.dutyMethodOn([meth('2026-06-15', 'c')], '2026-01-01'), 'c');
  });
});

describe('each day uses the default duty in force on it', () => {
  const defaults = [def('2026-05-01', '08:00', '17:00'), def('2026-06-15', '07:00', '16:00')];
  const fl = [flight('2026-06-14 09:00', '10:00'), flight('2026-06-15 09:00', '10:00')];

  test('a month spanning a change: the days before it keep the old default', () => {
    const data = dutyMonth(fl, '2026-06', { defaultDuty: defaults });
    const before = dayOf(data, '2026-06-14'), after = dayOf(data, '2026-06-15');
    assert.deepEqual([before.duty.duty_start, before.duty.duty_end, before.defaultDuty], ['08:00', '17:00', true]);
    assert.deepEqual([after.duty.duty_start, after.duty.duty_end, after.defaultDuty], ['07:00', '16:00', true]);
  });

  test('the earliest default covers flying before its date', () => {
    const data = dutyMonth([flight('2026-04-20 09:00', '10:00')], '2026-04', { defaultDuty: defaults });
    assert.equal(dayOf(data, '2026-04-20').duty.duty_start, '08:00');
  });

  test('a later change leaves a past month exactly as it was (reproducible)', () => {
    const may = [flight('2026-05-10 09:00', '10:00'), flight('2026-05-11 16:00', '18:00')];
    const opts = { days: [duty('2026-05-12', '08:00', '17:00')], method: [meth('2026-01-01', 'c')] };
    const asOf = plain(dutyMonth(may, '2026-05', { ...opts, defaultDuty: [defaults[0]] }));
    const later = plain(dutyMonth(may, '2026-05', { ...opts, defaultDuty: defaults }));
    assert.deepEqual(later, asOf);
    // The flight past the 08:00–17:00 default's end warns, then and now.
    assert.deepEqual(matching(dayOf(later, '2026-05-11').warnings, /outside duty/),
      ['Flight 16:00–18:00 outside duty 08:00–17:00 (default)']);
  });

  test('no default from a date: flying days from then have no duty times', () => {
    const cleared = [defaults[0], def('2026-06-15', null, null)];
    assert.deepEqual(warningsOn(fl, '2026-06-14', { defaultDuty: cleared }), []);
    assert.deepEqual(warningsOn(fl, '2026-06-15', { defaultDuty: cleared }),
      ['No duty times recorded: record the duty period, including any on-call or standby time']);
  });

  test('the rest checks use the previous day’s own default', () => {
    // The previous day's default (17:00–01:00, until the change) runs into the rest day.
    const late = [def('2026-05-01', '17:00', '01:00'), def('2026-06-16', '08:00', '17:00')];
    const days = [rest('2026-06-16')];
    const fl15 = [flight('2026-06-15 18:00', '19:00')];
    assert.deepEqual(matching(warningsOn(fl15, '2026-06-16', { days, defaultDuty: late }), /Previous duty/),
      ['Previous duty or flight ended 01:00, so this rest is under 24 h']);
    // Changed from the 15th instead: that day's default ends by midnight.
    const earlier = [late[0], def('2026-06-15', '08:00', '19:00')];
    assert.deepEqual(matching(warningsOn(fl15, '2026-06-16', { days, defaultDuty: earlier }), /Previous duty/), []);
    // The totals count rest the same way.
    const asOf = engine.tzLocalToEpoch('2026-07-01', '00:00');
    assert.equal(engine.dutyTotals(fl15, 1, asOf, { days, defaultDuty: late }).rest.taken, 0);
    assert.equal(engine.dutyTotals(fl15, 1, asOf, { days, defaultDuty: earlier }).rest.taken, 1);
  });
});

describe('method (c) checks against the default in force that day', () => {
  const defaults = [def('2026-05-01', '08:00', '17:00'), def('2026-06-15', '07:00', '16:00')];
  const c = days => ({ days, defaultDuty: defaults, method: 'c' });
  const DIFFERS = /differs from the regularly assigned/;

  test('duty matching the new default differs only before the change', () => {
    const days = [duty('2026-06-12', '07:00', '16:00'), duty('2026-06-16', '07:00', '16:00')];
    const data = dutyMonth([], '2026-06', c(days));
    assert.deepEqual(matching(dayOf(data, '2026-06-12').warnings, DIFFERS),
      ['Duty 07:00–16:00 differs from the regularly assigned 08:00–17:00 (§135.267(c))']);
    assert.deepEqual(matching(dayOf(data, '2026-06-16').warnings, DIFFERS), []);
  });

  test('no regularly assigned duty period from a date with no default', () => {
    const cleared = [defaults[0], def('2026-06-15', null, null)];
    const days = [duty('2026-06-12', '08:00', '17:00'), duty('2026-06-16', '08:00', '17:00')];
    const data = dutyMonth([], '2026-06', { days, defaultDuty: cleared, method: 'c' });
    const NONE = /No regularly assigned duty period/;
    assert.deepEqual(matching(dayOf(data, '2026-06-12').warnings, NONE), []);
    assert.equal(matching(dayOf(data, '2026-06-16').warnings, NONE).length, 1);
  });
});

describe('each day uses the method in force on it', () => {
  const methods = [meth('2026-05-01', 'b'), meth('2026-06-15', 'c')];
  const regular = [def('2026-01-01', '05:00', '20:00')];

  test('a 15 h duty is a (b) look-back warning before the change and a (c) limit after', () => {
    const days = [duty('2026-06-10', '05:00', '20:00'), duty('2026-06-20', '05:00', '20:00')];
    const data = dutyMonth([], '2026-06', { days, defaultDuty: regular, method: methods });
    assert.equal(dayOf(data, '2026-06-10').method, 'b');
    assert.deepEqual([...dayOf(data, '2026-06-10').warnings],
      ['Duty period 15:00 leaves at most 9:00 of rest in the 24 h before duty ended 20:00 (§135.267(d) minimum 10:00)']);
    assert.equal(dayOf(data, '2026-06-20').method, 'c');
    assert.deepEqual([...dayOf(data, '2026-06-20').warnings], ['Duty period 15:00 (§135.267(c) limit 14:00)']);
  });

  test('the daily flight time limit names the day’s method', () => {
    const days = [duty('2026-06-10', '06:00', '19:00'), duty('2026-06-20', '06:00', '19:00')];
    const fl = [flight('2026-06-10 07:00', '16:00'), flight('2026-06-20 07:00', '16:00')];
    const data = dutyMonth(fl, '2026-06', { days, defaultDuty: [def('2026-01-01', '06:00', '19:00')], method: methods });
    assert.deepEqual(matching(dayOf(data, '2026-06-10').warnings, /limit 8:00/),
      ['9:00 flight time in the 24 h to 16:00 (§135.267(b) limit 8:00)']);
    assert.deepEqual(matching(dayOf(data, '2026-06-20').warnings, /limit 8:00/),
      ['9:00 flight time in the duty period (§135.267(c) limit 8:00)']);
  });

  test('the limits line names each method a month used, and the month’s method is its last day’s', () => {
    const june = dutyMonth([], '2026-06', { method: methods });
    assert.equal(june.limitsLabel, 'Limits: §135.267(b) to Jun 14, §135.267(c) from Jun 15 · one-pilot crew');
    assert.equal(june.method, 'c');
    const may = dutyMonth([], '2026-05', { method: methods });
    assert.equal(may.limitsLabel, 'Limits: §135.267(b), flight time in any 24 hours · one-pilot crew');
    assert.equal(may.method, 'b');
    // The earliest entry covers the months before it.
    assert.equal(dutyMonth([], '2026-02', { method: [meth('2026-06-15', 'c')] }).method, 'c');
  });

  test('a later method change leaves a past month exactly as it was', () => {
    const days = [duty('2026-05-10', '05:00', '20:00')];
    const opts = { days, defaultDuty: regular };
    assert.deepEqual(plain(dutyMonth([], '2026-05', { ...opts, method: methods })),
      plain(dutyMonth([], '2026-05', { ...opts, method: [methods[0]] })));
  });
});
