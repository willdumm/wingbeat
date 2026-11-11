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

  test('fmtTzDate and fmtTzDateTime: an instant’s operator day, with its year, and its time', () => {
    // 07:30 UTC on Jan 1 is still Dec 31 in Anchorage.
    assert.equal(time.fmtTzDate(TZ, utc('2027-01-01T07:30:00Z')), 'Dec 31, 2026');
    assert.equal(time.fmtTzDate('Europe/Berlin', utc('2027-01-01T07:30:00Z')), 'Jan 1, 2027');
    assert.equal(time.fmtTzDateTime(TZ, utc('2027-01-01T07:30:00Z')), 'Dec 31, 2026, 22:30 AKST');
    assert.equal(time.fmtTzDateTime(TZ, utc('2026-07-16T06:05:09Z')), 'Jul 15, 2026, 22:05 AKDT');
  });

  test('fmtDuration rounds down, or up for an amount over a limit', () => {
    assert.equal(time.fmtDuration(8 * H + 40), '8:00');
    assert.equal(time.fmtDuration(8 * H + 40, true), '8:01');
    assert.equal(time.fmtDuration(9 * H + 59 * 60 + 30), '9:59');
  });
});

describe('core time, in zones around the world', () => {
  const dayKeys = (year) => {
    const keys = [];
    for (let d = Date.UTC(year, 0, 1); d < Date.UTC(year + 1, 0, 1); d += 86400_000) keys.push(new Date(d).toISOString().slice(0, 10));
    return keys;
  };
  const parts = (key) => key.split('-').map(Number);
  // Half-hour offsets (Adelaide, St John's, Kolkata), a half-hour DST shift (Lord Howe), and
  // zones east of UTC whose DST spans the new year (Sydney, Auckland).
  for (const zone of ['America/Anchorage', 'Europe/Berlin', 'Australia/Sydney', 'Australia/Adelaide',
    'America/St_Johns', 'Asia/Kolkata', 'Australia/Lord_Howe', 'Pacific/Auckland', 'Pacific/Kiritimati']) {
    test(zone + ': each day of the year runs from local midnight to the next, with no gap or overlap', () => {
      for (const key of dayKeys(2026)) {
        const start = time.tzDayStartUnix(zone, ...parts(key));
        const end = time.tzDayEndUnix(zone, ...parts(key));
        assert.equal(time.unixToTzDateStr(zone, start), key);
        assert.equal(time.unixToTzTime(zone, start), '00:00', key);
        assert.equal(time.unixToTzDateStr(zone, start - 1), time.tzAddDays(key, -1), key);
        assert.equal(time.unixToTzDateStr(zone, end), key);
        assert.equal(time.unixToTzDateStr(zone, end + 1), time.tzAddDays(key, 1), key);
        assert.equal(end + 1, time.tzDayStartUnix(zone, ...parts(time.tzAddDays(key, 1))), key);
        assert.equal(start, time.tzLocalToEpoch(zone, key), key);
      }
    });

    test(zone + ': tzLocalToEpoch round trips outside the DST shift', () => {
      for (const key of dayKeys(2026)) {
        const at = time.tzLocalToEpoch(zone, key, '12:30');
        assert.equal(time.unixToTzDateStr(zone, at), key);
        assert.equal(time.unixToTzTime(zone, at), '12:30', key);
      }
    });
  }

  test('the days DST changes on, pinned', () => {
    const length = (zone, y, m, d) => (time.tzDayEndUnix(zone, y, m, d) + 1 - time.tzDayStartUnix(zone, y, m, d)) / H;
    assert.equal(time.tzDayStartUnix('Europe/Berlin', 2026, 3, 29), utc('2026-03-28T23:00:00Z'));
    assert.equal(length('Europe/Berlin', 2026, 3, 29), 23);
    assert.equal(time.tzDayStartUnix('Europe/Berlin', 2026, 10, 25), utc('2026-10-24T22:00:00Z'));
    assert.equal(length('Europe/Berlin', 2026, 10, 25), 25);
    assert.equal(time.tzDayStartUnix('Australia/Sydney', 2026, 10, 4), utc('2026-10-03T14:00:00Z'));
    assert.equal(length('Australia/Sydney', 2026, 10, 4), 23);
    assert.equal(time.tzDayStartUnix('Australia/Sydney', 2026, 4, 5), utc('2026-04-04T13:00:00Z'));
    assert.equal(length('Australia/Sydney', 2026, 4, 5), 25);
    assert.equal(length('Australia/Lord_Howe', 2026, 10, 4), 23.5);
    assert.equal(length('Australia/Lord_Howe', 2026, 4, 5), 24.5);
  });

  test('where DST starts at midnight (Havana), the day starts when the clocks jump to 01:00', () => {
    const start = time.tzDayStartUnix('America/Havana', 2026, 3, 8);
    assert.equal(start, utc('2026-03-08T05:00:00Z'));
    assert.equal(time.unixToTzDateStr('America/Havana', start), '2026-03-08');
    assert.equal(time.unixToTzTime('America/Havana', start), '01:00');
    assert.equal(time.unixToTzDateStr('America/Havana', start - 1), '2026-03-07');
    assert.equal(time.tzDayEndUnix('America/Havana', 2026, 3, 7), start - 1);
  });

  test('a day number past the end of the month rolls over', () => {
    assert.equal(time.tzDayStartUnix('Europe/Berlin', 2026, 1, 32), time.tzDayStartUnix('Europe/Berlin', 2026, 2, 1));
  });
});

describe('core relativeTime', () => {
  test('rounds down to minutes, hours, then days', () => {
    const now = 1_793_739_600;
    assert.equal(time.relativeTime(now, null), 'never');
    assert.equal(time.relativeTime(now, now - 59), 'just now');
    assert.equal(time.relativeTime(now, now - 60), '1 min ago');
    assert.equal(time.relativeTime(now + 0.9, now - 3599), '59 min ago');
    assert.equal(time.relativeTime(now, now - 7200), '2 hr ago');
    assert.equal(time.relativeTime(now, now - 3 * 86400), '3 days ago');
  });
});
