// @wingbeat/core/duty, imported directly: the clock and the operator's timezone are
// parameters (computeDutyData(tz, now, …), dutyTotals(tz, …)), and the result is the one
// the pages get through the core bundle's globals. The §135.267 rules themselves are
// specified by the duty spec tests (duty-limits, rest-days, totals, dated-defaults, dst,
// day-form, duty-export), which call core the same way.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore, plain, TZ } from './core.mjs';
import { loadEngine } from './harness.mjs';
import { fixtures } from './duty-fixtures.mjs';

const duty = await importCore('duty');
const time = await importCore('time');

const NOW = '2026-10-15 12:00';
const engine = loadEngine({ now: NOW });
const { flight, duty: dutyRow, rest, nowSecs } = fixtures({ now: NOW });

// An October with a bit of everything: an over-limit day, a rest day designated late, a
// day on the default duty, an unpaid Part 91 flight, and planned rest after today.
const flights = [
  flight('2026-10-02 07:00', '11:00'), flight('2026-10-02 12:00', '16:30'),
  flight('2026-10-03 09:00', '10:00'),
  flight('2026-10-06 22:30', '00:30', { part91: true, unpaid: true }),
  flight('2026-10-07 09:00', '10:00', { pilot: 2 }),
];
const opts = {
  days: [
    dutyRow('2026-10-02', '06:00', '20:00'),
    rest('2026-10-04', { designated: '2026-10-04 08:00' }),
    rest('2026-10-20'),
  ],
  defaultDuty: [{ effective_date: '2026-01-01', duty_start: '08:00', duty_end: '17:00' }],
  method: [{ effective_date: '2026-01-01', method: 'b' }],
};

describe('computeDutyData', () => {
  test('the same month as the page’s global, which binds the operator timezone and the clock', () => {
    const direct = duty.computeDutyData(TZ, nowSecs, flights, 1, 'Pilot', 2026, 10, opts);
    assert.deepEqual(plain(direct), plain(engine.computeDutyData(flights, 1, 'Pilot', 2026, 10, opts)));
    assert.ok(direct.days.some(d => d.warnings.length), 'the fixture has warnings to compare');
    assert.equal(direct.upcoming.length, 1);
  });

  test('reads the clock only from now', () => {
    const realNow = Date.now;
    Date.now = () => { throw new Error('Date.now() read'); };
    try {
      const data = duty.computeDutyData(TZ, nowSecs, flights, 1, 'Pilot', 2026, 10, opts);
      assert.equal(data.isCurrentMonth, true);
      assert.equal(data.days.length, 15);
      assert.equal(data.totals.asOfLabel, 'now');
      // A month later, October is a past month: every day, totals as of its end.
      const later = duty.computeDutyData(TZ, nowSecs + 31 * 86400, flights, 1, 'Pilot', 2026, 10, opts);
      assert.equal(later.isCurrentMonth, false);
      assert.equal(later.days.length, 31);
      assert.equal(later.totals.asOfLabel, 'Oct 31, 2026');
      assert.deepEqual(duty.currentDutyMonth(TZ, nowSecs + 31 * 86400), [2026, 11]);
    } finally {
      Date.now = realNow;
    }
  });

  test('days are the given timezone’s: an evening flight in Alaska is the next day in UTC', () => {
    const f = [flight('2026-10-02 20:00', '21:00')];
    const day = (tz) => duty.computeDutyData(tz, nowSecs, f, 1, 'Pilot', 2026, 10).days
      .find(d => d.flights.length).dateKey;
    assert.equal(day(TZ), '2026-10-02');
    assert.equal(day('UTC'), '2026-10-03');
  });
});

describe('dutyTotals', () => {
  test('the same totals as the page’s global, and the hours-only form the alerts use', () => {
    const asOf = nowSecs;
    assert.deepEqual(plain(duty.dutyTotals(TZ, flights, 1, asOf, opts)), plain(engine.dutyTotals(flights, 1, asOf, opts)));
    const hours = duty.dutyTotals(TZ, flights, 1, asOf, { hoursOnly: true });
    assert.equal(hours.rest, null);
    assert.equal(hours.hours[0].label, 'Q4 2026');
  });
});

describe('the texts', () => {
  test('dutyDayText and dutySaveConfirmText show dates in the given timezone', () => {
    // Designated at 23:30 on Oct 3 in Alaska: Oct 4 in UTC.
    const designated = time.tzLocalToEpoch(TZ, '2026-10-03', '23:30');
    const day = { rest: true, restDesignatedAt: designated, duty: null, defaultDuty: false };
    assert.equal(duty.dutyDayText(TZ, day, 2026), 'Rest · designated Oct 3');
    assert.equal(duty.dutyDayText('UTC', day, 2026), 'Rest · designated Oct 4');
    const records = [{ date: '2026-10-10', duty_start: null, duty_end: null, rest: 1, rest_designated_at: designated, note: null }];
    assert.match(duty.dutySaveConfirmText(TZ, records, ['2026-10-10'], { rest: false }), /^This rest day was designated Oct 3\./);
  });

  test('dutyRangeLabel and dutyExportPresets', () => {
    const m = (year, month) => ({ year, month });
    assert.equal(duty.dutyRangeLabel([m(2026, 10)]), 'October 2026');
    assert.equal(duty.dutyRangeLabel([m(2026, 7), m(2026, 9)]), 'July – September 2026');
    assert.equal(duty.dutyRangeLabel([m(2025, 11), m(2026, 10)]), 'November 2025 – October 2026');
    const oct = 2026 * 12 + 9;
    assert.deepEqual(duty.dutyExportPresets(oct, oct, oct - 24).map(p => [p.key, p.from - oct, p.to - oct]),
      [['month', 0, 0], ['quarter', 0, 0], ['prevQuarter', -3, -1], ['year', -11, 0]]);
  });
});
