// @wingbeat/core/settings, imported directly: the tracker history import's month windows
// and default start in operator days, and the warning Global Settings shows before a
// timezone change moves the duty log's records. The modal and its requests stay on the page
// (checked through the shipped bundle at the end).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore, plain, TZ } from './core.mjs';
import { loadEngine } from './harness.mjs';

const settings = await importCore('settings');
const { tzLocalToEpoch } = await importCore('time');
const at = (date, hhmm = '12:00') => tzLocalToEpoch(TZ, date, hhmm);

describe('importWindows', () => {
  test('from a mid-month date: to the first of the next month, then a month at a time, the last open', () => {
    assert.deepEqual(settings.importWindows(TZ, at('2026-11-03'), '2026-08-15'), [
      { d1: '2026-08-15', d2: '2026-09-01', label: 'Aug 2026' },
      { d1: '2026-09-01', d2: '2026-10-01', label: 'Sep 2026' },
      { d1: '2026-10-01', d2: '2026-11-01', label: 'Oct 2026' },
      { d1: '2026-11-01', d2: null, label: 'Nov 2026' },
    ]);
  });

  test('across a year; on the first of a month the window before it closes on today', () => {
    assert.deepEqual(settings.importWindows(TZ, at('2027-01-01'), '2026-12-20'), [
      { d1: '2026-12-20', d2: '2027-01-01', label: 'Dec 2026' },
      { d1: '2027-01-01', d2: null, label: 'Jan 2027' },
    ]);
  });

  test('today is the operator’s: the evening of Oct 31 in Anchorage is Nov 1 in UTC', () => {
    const evening = at('2026-10-31', '20:00');
    assert.deepEqual(settings.importWindows(TZ, evening, '2026-10-15').map(w => w.d1), ['2026-10-15']);
    assert.deepEqual(settings.importWindows('UTC', evening, '2026-10-15').map(w => w.d1), ['2026-10-15', '2026-11-01']);
  });

  test('from today: one open window; from after today: none', () => {
    assert.deepEqual(settings.importWindows(TZ, at('2026-11-03'), '2026-11-03'), [{ d1: '2026-11-03', d2: null, label: 'Nov 2026' }]);
    assert.deepEqual(settings.importWindows(TZ, at('2026-11-03'), '2026-11-04'), []);
  });
});

test('importDefaultFrom: a year before the operator’s today, Feb 29 to Mar 1', () => {
  assert.equal(settings.importDefaultFrom(TZ, at('2026-11-03')), '2025-11-03');
  assert.equal(settings.importDefaultFrom(TZ, at('2028-02-29')), '2027-03-01');
  // 20:00 on Dec 31 in Anchorage is already Jan 1 in UTC.
  assert.equal(settings.importDefaultFrom(TZ, at('2026-12-31', '20:00')), '2025-12-31');
});

describe('timezoneChangeWarning', () => {
  test('names what the duty log holds, the old and new zone, and what changes', () => {
    const ask = settings.timezoneChangeWarning('America/Anchorage', 'Europe/Berlin', { duty_days: 1204, default_duties: 1 });
    assert.equal(ask, 'The duty log has 1,204 duty days and 1 default duty entry, stored as dates and times in America/Anchorage. ' +
      'After the change they’re read in Europe/Berlin: a duty start of 08:00 stays 08:00, now in Europe/Berlin, and flights near ' +
      'midnight can move to a different day, which changes that day’s flight time and rest. Change the timezone to Europe/Berlin anyway?');
    assert.match(settings.timezoneChangeWarning('UTC', 'Asia/Tokyo', { duty_days: 0, default_duties: 3 }), /^The duty log has 3 default duty entries, /);
  });

  test('nothing to warn about: the same zone, or no duty records', () => {
    assert.equal(settings.timezoneChangeWarning(TZ, TZ, { duty_days: 5, default_duties: 1 }), null);
    assert.equal(settings.timezoneChangeWarning(TZ, 'UTC', { duty_days: 0, default_duties: 0 }), null);
  });
});

test('reads the clock only from now, and the page’s globals bind the operator timezone and the clock', () => {
  const now = at('2026-11-03');
  const realNow = Date.now;
  Date.now = () => { throw new Error('Date.now() read'); };
  let windows, from;
  try {
    windows = settings.importWindows(TZ, now, '2026-09-10');
    from = settings.importDefaultFrom(TZ, now);
  } finally {
    Date.now = realNow;
  }
  const engine = loadEngine({ now: '2026-11-03 12:00' });
  assert.deepEqual(plain(engine.trackerImportWindows('2026-09-10')), windows);
  assert.equal(engine.trackerImportDefaultFrom(), from);
  assert.equal(engine.timezoneChangeWarning(TZ, 'UTC', { duty_days: 2, default_duties: 0 }),
    settings.timezoneChangeWarning(TZ, 'UTC', { duty_days: 2, default_duties: 0 }));
  assert.equal(engine.fmtTzDateTime(now), 'Nov 3, 2026, 12:00 AKST');
  assert.equal(engine.fmtTzDate(now), 'Nov 3, 2026');
});
