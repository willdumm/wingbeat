// The flight form's Dep/Arr reading: flightFormTimes() (flight-edits.ts). An arrival
// before the departure is the next day, which the form says under the times; over 12 h
// asks before saving and over 24 h (the server's limit, record-limits.ts) is refused.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, fixtures, plain } from './harness.mjs';

const engine = loadEngine({ now: '2026-10-15 12:00' });
const { at } = fixtures(engine);
const { flightFormTimes } = engine;

describe('flightFormTimes', () => {
  test('a same-day flight: no hint, no confirm', () => {
    assert.deepEqual(plain(flightFormTimes('2026-03-10', '09:00', '09:40')), {
      start_time: at('2026-03-10 09:00'), end_time: at('2026-03-10 09:40'), secs: 40 * 60,
      nextDay: false, long: false, tooLong: false, hint: '',
    });
  });

  test('an arrival before the departure is the next day, and says so', () => {
    const t = flightFormTimes('2026-03-10', '23:30', '00:45');
    assert.equal(t.end_time, at('2026-03-11 00:45'));
    assert.equal(t.nextDay, true);
    assert.equal(t.long, false);
    assert.equal(t.hint, 'Arrives the next day, 1:15 after departure.');
  });

  test('Dep moved past Arr (09:00–09:40 → 09:50) is a 23:50 flight: confirm, not refused', () => {
    const t = flightFormTimes('2026-03-10', '09:50', '09:40');
    assert.equal(t.secs, 23 * 3600 + 50 * 60);
    assert.equal(t.long, true);
    assert.equal(t.tooLong, false);
    assert.equal(t.hint, 'Arrives the next day, 23:50 after departure.');
  });

  test('exactly 12 h saves without asking; a minute more asks', () => {
    assert.equal(flightFormTimes('2026-03-10', '20:00', '08:00').long, false);
    assert.equal(flightFormTimes('2026-03-10', '20:00', '08:01').long, true);
  });

  test('the same time for Dep and Arr is a zero-length flight, not 24 h', () => {
    const t = flightFormTimes('2026-03-10', '09:00', '09:00');
    assert.equal(t.secs, 0);
    assert.equal(t.nextDay, false);
  });

  test('across the fall-back night a next-day arrival can pass 24 h: refused', () => {
    // Anchorage falls back 2026-11-01 02:00: that day has 25 hours.
    const t = flightFormTimes('2026-10-31', '09:00', '08:50');
    assert.equal(t.secs, 24 * 3600 + 50 * 60);
    assert.equal(t.tooLong, true);
  });

  test('across the spring-forward night the clock times are kept', () => {
    // Anchorage springs forward 2026-03-08 02:00: that day has 23 hours.
    const t = flightFormTimes('2026-03-07', '22:00', '06:00');
    assert.equal(t.end_time, at('2026-03-08 06:00'));
    assert.equal(t.secs, 7 * 3600);
  });
});
