// Fixture builders for the duty log's spec tests, on @wingbeat/core imported directly
// (test/core.mjs): local times are 'YYYY-MM-DD HH:MM' in the operator's timezone, and the
// duty log's "now" is a parameter, as core takes it.
//
//   const { flight, duty, rest, dutyMonth, dayOf } = fixtures({ now: '2026-10-15 12:00' });
//   flight('2026-03-10 09:00', '11:30', { pilot: 1, part91, unpaid, manual })
//
// An arrival given as 'HH:MM' is on the departure's date, or the next day when it isn't
// after the departure. The result is an effective flight, as applyFlightEdits() returns
// it: a part91/unpaid/manual flight carries an edit.

import { importCore, TZ } from './core.mjs';

const time = await importCore('time');
const { computeDutyData } = await importCore('duty');

function splitLocal(s) {
  const [date, hhmm = '00:00'] = s.trim().split(/\s+/);
  return [date, hhmm];
}

/** tz is the operator's timezone; now (a local time) is the clock dutyMonth() reads. */
export function fixtures({ tz = TZ, now = '2026-10-15 12:00' } = {}) {
  let nextId = 1;
  const at = (s) => time.tzLocalToEpoch(tz, ...splitLocal(s));
  const nowSecs = at(now);

  function arrival(dep, arr) {
    if (/^\d{4}-/.test(arr)) return at(arr);
    const [date, depTime] = splitLocal(dep);
    return arr > depTime ? at(date + ' ' + arr) : at(time.tzAddDays(date, 1) + ' ' + arr);
  }

  function flight(dep, arr, { pilot = 1, part91 = false, unpaid = false, manual = false, tracker = 1, id } = {}) {
    const f = {
      id: id ?? nextId++,
      tracker_id: manual ? null : tracker,
      start_time: at(dep),
      end_time: arrival(dep, arr),
      pilot_id: pilot,
      aircraft_tail: 'N123',
      origin_label: 'A',
      destination_label: 'B',
    };
    if (part91 || unpaid || manual) {
      f.edit = { entry: null, manual, part91: part91 || unpaid, unpaid, remark: null, excluded: false, original: {} };
    }
    return f;
  }

  /** A duty_days row with duty times. */
  function duty(date, start, end, { note = null } = {}) {
    return { date, duty_start: start, duty_end: end, rest: 0, rest_designated_at: null, note };
  }

  /** A duty_days rest row, designated at a local time (default: a week before). */
  function rest(date, { designated = time.tzAddDays(date, -7) + ' 12:00', note = null } = {}) {
    return { date, duty_start: null, duty_end: null, rest: 1, rest_designated_at: designated == null ? null : at(designated), note };
  }

  /**
   * computeDutyData for pilot 1 and the month of dateKey (any 'YYYY-MM…'), as of now, with
   * the opts computeDutyData takes (days, defaultDuty, method, unmatched; defaultDuty and
   * method either one value or a dated list).
   */
  function dutyMonth(flights, ym, opts = {}) {
    const [y, m] = ym.split('-').map(Number);
    return computeDutyData(tz, nowSecs, flights, 1, 'Pilot', y, m, opts);
  }

  /** The row for dateKey in a computeDutyData result (or its prevDay). */
  function dayOf(data, dateKey) {
    const d = data.prevDay.dateKey === dateKey ? data.prevDay : data.days.find(x => x.dateKey === dateKey);
    if (!d) throw new Error('no day ' + dateKey + ' in ' + data.year + '-' + data.month);
    return d;
  }

  /** dateKey's warnings for these flights and opts (in the month of dateKey). */
  function warningsOn(flights, dateKey, opts) {
    return [...dayOf(dutyMonth(flights, dateKey, opts), dateKey).warnings];
  }

  /** The warnings in list that match re. */
  const matching = (list, re) => [...list].filter(w => re.test(w));

  return { at, nowSecs, flight, duty, rest, dutyMonth, dayOf, warningsOn, matching };
}
