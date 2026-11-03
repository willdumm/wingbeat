// @wingbeat/core/time: operator-timezone calendar helpers and time display, around the
// America/Anchorage DST transitions (2026-03-08 02:00 AKST → 03:00 AKDT, 2026-11-01
// 02:00 AKDT → 01:00 AKST).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore } from './core.mjs';

const time = await importCore('time');
const TZ = 'America/Anchorage';
const H = 3600;
const utc = (iso) => Date.parse(iso) / 1000;

describe('core time', () => {
  test('tzLocalToEpoch on ordinary days, standard and daylight time', () => {
    assert.equal(time.tzLocalToEpoch(TZ, '2026-01-15', '08:00'), utc('2026-01-15T17:00:00Z'));   // AKST, UTC-9
    assert.equal(time.tzLocalToEpoch(TZ, '2026-07-15', '08:00'), utc('2026-07-15T16:00:00Z'));   // AKDT, UTC-8
    assert.equal(time.tzLocalToEpoch(TZ, '2026-07-15'), utc('2026-07-15T08:00:00Z'), 'defaults to midnight');
  });

  test('tzLocalToEpoch either side of the spring-forward gap', () => {
    assert.equal(time.tzLocalToEpoch(TZ, '2026-03-08', '01:00'), utc('2026-03-08T10:00:00Z'));
    assert.equal(time.tzLocalToEpoch(TZ, '2026-03-08', '03:00'), utc('2026-03-08T11:00:00Z'));
    assert.equal(time.tzLocalToEpoch(TZ, '2026-03-08', '12:00') - time.tzLocalToEpoch(TZ, '2026-03-08', '00:00'), 11 * H);
  });

  test('tzLocalToEpoch either side of the fall-back overlap', () => {
    assert.equal(time.tzLocalToEpoch(TZ, '2026-11-01', '00:00'), utc('2026-11-01T08:00:00Z'));
    assert.equal(time.tzLocalToEpoch(TZ, '2026-11-01', '03:00'), utc('2026-11-01T12:00:00Z'));
    assert.equal(time.tzLocalToEpoch(TZ, '2026-11-01', '12:00') - time.tzLocalToEpoch(TZ, '2026-11-01', '00:00'), 13 * H);
  });

  test('tzDayStartUnix / tzDayEndUnix bound the local day, DST days included', () => {
    assert.equal(time.tzDayStartUnix(TZ, 2026, 7, 15), utc('2026-07-15T08:00:00Z'));
    assert.equal(time.tzDayEndUnix(TZ, 2026, 7, 15), utc('2026-07-16T07:59:59Z'));
    assert.equal(time.tzDayEndUnix(TZ, 2026, 3, 8) - time.tzDayStartUnix(TZ, 2026, 3, 8) + 1, 23 * H);
    assert.equal(time.tzDayEndUnix(TZ, 2026, 11, 1) - time.tzDayStartUnix(TZ, 2026, 11, 1) + 1, 25 * H);
  });

  test('unixToTzDateStr / unixToTzTime / unixToTzMonthKey', () => {
    const t = utc('2026-04-01T07:59:00Z');           // Mar 31 23:59 AKDT
    assert.equal(time.unixToTzDateStr(TZ, t), '2026-03-31');
    assert.equal(time.unixToTzTime(TZ, t), '23:59');
    assert.equal(time.unixToTzMonthKey(TZ, t), '2026-03');
    assert.equal(time.unixToTzDateStr(TZ, t + 60), '2026-04-01');
    // The repeated hour on Nov 1 is still Nov 1, both times round.
    assert.equal(time.unixToTzTime(TZ, utc('2026-11-01T09:30:00Z')), '01:30');
    assert.equal(time.unixToTzTime(TZ, utc('2026-11-01T10:30:00Z')), '01:30');
    assert.equal(time.unixToTzDateStr(TZ, utc('2026-11-01T10:30:00Z')), '2026-11-01');
  });

  test('the same instant in another operator timezone', () => {
    const t = utc('2026-04-01T07:59:00Z');
    assert.equal(time.unixToTzDateStr('Europe/Berlin', t), '2026-04-01');
    assert.equal(time.unixToTzTime('Europe/Berlin', t), '09:59');
  });

  test('tzAbbrev and fmtTzTime name the zone per instant', () => {
    assert.equal(time.tzAbbrev(TZ, utc('2026-07-15T22:05:00Z')), 'AKDT');
    assert.equal(time.tzAbbrev(TZ, utc('2026-01-15T23:05:00Z')), 'AKST');
    assert.equal(time.fmtTzTime(TZ, utc('2026-07-15T22:05:00Z')), '14:05 AKDT');
    assert.equal(time.fmtTzTime(TZ, utc('2026-01-15T23:05:00Z')), '14:05 AKST');
    // Either side of the fall-back overlap: the same wall time, two zones.
    assert.equal(time.fmtTzTime(TZ, utc('2026-11-01T09:30:00Z')), '01:30 AKDT');
    assert.equal(time.fmtTzTime(TZ, utc('2026-11-01T10:30:00Z')), '01:30 AKST');
    // No common en-US abbreviation: an offset.
    assert.equal(time.tzAbbrev('Europe/Berlin', utc('2026-07-15T12:00:00Z')), 'GMT+2');
  });

  test('tzAddDays crosses month and year ends', () => {
    assert.equal(time.tzAddDays('2026-02-28', 1), '2026-03-01');
    assert.equal(time.tzAddDays('2026-01-01', -1), '2025-12-31');
    assert.equal(time.tzAddDays('2026-03-08', 1), '2026-03-09');
  });

  test('tzAddMonths / tzDateKey', () => {
    assert.deepEqual(time.tzAddMonths(2026, 12, 1), [2027, 1]);
    assert.deepEqual(time.tzAddMonths(2026, 1, -1), [2025, 12]);
    assert.equal(time.tzDateKey(2026, 3, 8), '2026-03-08');
  });

  test('date labels', () => {
    assert.equal(time.tzDateLabel('2026-10-03'), 'Sat Oct 3');
    assert.equal(time.tzLongDateLabel('2026-10-03'), 'Sat, Oct 3, 2026');
    assert.equal(time.tzShortDate('2026-10-03', 2026), 'Oct 3');
    assert.equal(time.tzShortDate('2025-10-03', 2026), 'Oct 3, 2025');
    assert.equal(time.tzShortMonthLabel(2026, 10), 'Oct 2026');
    assert.equal(time.tzLongMonthLabel(2026, 10), 'October 2026');
    assert.deepEqual([time.tzAxisMonthLabel(2026, 10), time.tzAxisMonthLabel(2005, 1)], ['Oct 26', 'Jan 05']);
    assert.deepEqual(['2026-11-01', '2026-11-02', '2026-11-07'].map(time.tzWeekday), [0, 1, 6]);
    assert.deepEqual([time.tzDaysInMonth(2027, 2), time.tzDaysInMonth(2028, 2), time.tzDaysInMonth(2026, 12)], [28, 29, 31]);
  });

  test('fmtTzPointTime: a track point to the second, on its operator day', () => {
    assert.equal(time.fmtTzPointTime(TZ, utc('2026-07-16T06:05:09Z')), 'Jul 15, 22:05:09 AKDT');
    assert.equal(time.fmtTzPointTime('Europe/Berlin', utc('2026-07-16T06:05:09Z')), 'Jul 16, 08:05:09 GMT+2');
  });

  test('fmtDuration rounds down, or up for an amount over a limit', () => {
    assert.equal(time.fmtDuration(8 * H + 40), '8:00');
    assert.equal(time.fmtDuration(8 * H + 40, true), '8:01');
    assert.equal(time.fmtDuration(9 * H + 59 * 60 + 30), '9:59');
  });
});
