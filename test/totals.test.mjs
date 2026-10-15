// §135.267(a) totals (calendar quarter, two quarters, calendar year), the "Last 24 h"
// check on the next assignment, as-of dates, and fmtBlock rounding.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, fixtures, plain } from './harness.mjs';

const engine = loadEngine({ now: '2026-10-15 12:00' });
const { flight, at, dutyMonth } = fixtures(engine);
const H = 3600;

const hoursOf = (t) => plain(t.hours).map(r => [r.label, r.secs / H]);

describe('calendar quarter / two quarters / calendar year', () => {
  const flights = [
    flight('2025-09-30 10:00', '11:00'),   // Q3 2025: 1 h
    flight('2025-12-31 10:00', '12:00'),   // Q4 2025: 2 h
    flight('2026-01-01 10:00', '13:00'),   // Q1 2026: 3 h
    flight('2026-03-31 20:00', '23:00'),   // Q1 2026, though Apr 1 in UTC: 3 h
    flight('2026-04-01 00:30', '04:30'),   // Q2 2026: 4 h
    flight('2026-05-20 10:00', '15:00'),   // Q2 2026, after the as-of below: 5 h
  ];

  test('as of mid-May 2026', () => {
    assert.deepEqual(hoursOf(engine.dutyTotals(flights, 1, at('2026-05-15 12:00'))), [
      ['Q2 2026', 4],
      ['Q1 2026 + Q2 2026', 10],
      ['Calendar year 2026', 10],
    ]);
  });

  test('as of February 2026: two quarters reach into the previous year, the year doesn’t', () => {
    assert.deepEqual(hoursOf(engine.dutyTotals(flights, 1, at('2026-02-01 00:00'))), [
      ['Q1 2026', 3],
      ['Q4 2025 + Q1 2026', 5],
      ['Calendar year 2026', 3],
    ]);
  });

  test('as of the first instant of a quarter, the totals are the previous quarter’s', () => {
    // asOf is exclusive: midnight Apr 1 is "as of Mar 31".
    assert.deepEqual(hoursOf(engine.dutyTotals(flights, 1, at('2026-04-01 00:00'))), [
      ['Q1 2026', 6],
      ['Q4 2025 + Q1 2026', 8],
      ['Calendar year 2026', 6],
    ]);
  });

  test('includes paid Part 91, excludes unpaid flights and other pilots', () => {
    const fl = [
      flight('2026-05-01 08:00', '10:00'),
      flight('2026-05-02 08:00', '11:00', { part91: true }),
      flight('2026-05-03 08:00', '15:00', { unpaid: true }),
      flight('2026-05-04 08:00', '15:00', { pilot: 2 }),
    ];
    assert.deepEqual(hoursOf(engine.dutyTotals(fl, 1, at('2026-05-15 12:00'))).map(r => r[1]), [5, 5, 5]);
  });

  test('removed flights and flights still in progress are excluded', () => {
    const removed = flight('2026-05-01 08:00', '10:00');
    removed.edit = { manual: false, part91: false, unpaid: false, excluded: true, original: {} };
    const open = { ...flight('2026-05-02 08:00', '10:00'), end_time: null };
    assert.equal(engine.dutyTotals([removed, open], 1, at('2026-05-15 12:00')).hours[0].secs, 0);
  });

  test('over is strictly greater than the limit', () => {
    const big = (secs) => {
      const f = flight('2026-01-02 00:00', '01:00');
      f.end_time = f.start_time + secs;
      return engine.dutyTotals([f], 1, at('2026-03-31 00:00')).hours[0];
    };
    assert.equal(big(500 * H).over, false);
    assert.equal(big(500 * H + 1).over, true);
    assert.equal(big(500 * H).limit, 500 * H);
  });
});

describe('last 24 h (the next assignment’s window)', () => {
  const asOf = at('2026-05-15 12:00');
  test('counts all commercial flying, clipped to the window, Part 91 included', () => {
    const fl = [
      flight('2026-05-14 10:00', '13:00'),                    // 1 h inside the window
      flight('2026-05-15 06:00', '09:00', { part91: true }),  // 3 h
      flight('2026-05-15 09:30', '10:30', { unpaid: true }),  // not commercial
      flight('2026-05-15 11:00', '13:00'),                    // 1 h before asOf
    ];
    const t = engine.dutyTotals(fl, 1, asOf);
    assert.equal(t.flight24.secs, 5 * H);
    assert.equal(t.flight24.over, false);
    assert.equal(t.flight24.limit, 8 * H);
  });
});

describe('as of now / as of month end', () => {
  const fl = [
    flight('2026-03-05 10:00', '12:00'),
    flight('2026-04-01 09:00', '10:00'),   // after March: not in March's totals
  ];

  test('a past month’s totals are as of its end', () => {
    const data = dutyMonth(fl, '2026-03');
    assert.equal(data.isCurrentMonth, false);
    assert.equal(data.totals.asOfLabel, 'Mar 31, 2026');
    assert.deepEqual(hoursOf(data.totals).map(r => r[1]), [2, 2, 2]);
    assert.equal(data.days.length, 31);
    assert.deepEqual(plain(data.upcoming), []);
  });

  test('the current month’s totals are as of now', () => {
    const e = loadEngine({ now: '2026-04-01 09:30' });
    const fx = fixtures(e);
    const data = fx.dutyMonth(fl.map(f => ({ ...f })), '2026-04');
    assert.equal(data.isCurrentMonth, true);
    assert.equal(data.totals.asOfLabel, 'now');
    // Half of the Apr 1 flight is before now; totals count a flight by its start, in full.
    assert.deepEqual(hoursOf(data.totals).map(r => r[1]), [1, 3, 3]);
    assert.equal(data.totals.flight24.secs, 0.5 * H);
    assert.equal(data.days.length, 1);
  });

  test('moving the clock moves "today"', () => {
    const e = loadEngine({ now: '2026-07-31 23:59' });
    assert.deepEqual([...e.currentDutyMonth()], [2026, 7]);
    e.setNow('2026-08-01 00:00');
    assert.deepEqual([...e.currentDutyMonth()], [2026, 8]);
  });
});

describe('fmtBlock', () => {
  test('rounds down by default', () => {
    assert.equal(engine.fmtBlock(0), '0:00');
    assert.equal(engine.fmtBlock(59), '0:00');
    assert.equal(engine.fmtBlock(8 * H + 40), '8:00');
    assert.equal(engine.fmtBlock(9 * H + 59 * 60 + 30), '9:59');
    assert.equal(engine.fmtBlock(125 * H + 5 * 60), '125:05');
  });

  test('up rounds up, so an amount over a limit never prints equal to it', () => {
    assert.equal(engine.fmtBlock(8 * H + 40, true), '8:01');
    assert.equal(engine.fmtBlock(8 * H + 1, true), '8:01');
    assert.equal(engine.fmtBlock(8 * H, true), '8:00');
    assert.equal(engine.fmtBlock(59 * 60 + 1, true), '1:00');
  });
});
