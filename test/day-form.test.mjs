// The day form's Save: dutySaveConfirmText(), the question asked before a save replaces
// recorded days (a Through range) or drops a rest designation (one day).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, fixtures } from './harness.mjs';

const engine = loadEngine({ now: '2026-10-15 12:00' });
const { duty, rest } = fixtures(engine);
const ask = (records, keys, values) => engine.dutySaveConfirmText(records, keys, values);

const DUTY = { duty_start: '08:00', duty_end: '17:00', rest: false, note: '' };
const REST = { duty_start: null, duty_end: null, rest: true, note: '' };
const NOTE_ONLY = { duty_start: null, duty_end: null, rest: false, note: 'Positioning' };
const WEEK = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];

describe('range save', () => {
  test('days with no record are not replaced', () => {
    assert.equal(ask([], WEEK, DUTY), null);
  });

  test('records the same as the values saved are not replaced', () => {
    // The server trims the note and stores an empty one as none.
    const records = [duty(WEEK[0], '08:00', '17:00'), duty(WEEK[1], '08:00', '17:00', { note: '' })];
    assert.equal(ask(records, WEEK, { ...DUTY, note: '  ' }), null);
    const noted = [duty(WEEK[0], '08:00', '17:00', { note: 'Standby' })];
    assert.equal(ask(noted, WEEK, { ...DUTY, note: ' Standby ' }), null);
  });

  test('counts the records that differ', () => {
    const records = [
      duty(WEEK[0], '07:00', '15:00'),
      duty(WEEK[1], '08:00', '17:00'),            // same as saved
      duty(WEEK[2], '08:00', '17:00', { note: 'Standby' }),
      duty(WEEK[3], null, null, { note: 'Positioning' }),
      duty('2026-11-20', '06:00', '12:00'),       // outside the range
    ];
    assert.equal(ask(records, WEEK, DUTY), '3 of these 6 days already have records that will be replaced. Save?');
    assert.equal(ask(records.slice(0, 1), WEEK, DUTY), '1 of these 6 days already has a record that will be replaced. Save?');
  });

  test('says when every day is replaced', () => {
    const records = WEEK.map(k => duty(k, '06:00', '14:00'));
    assert.equal(ask(records, WEEK, DUTY), 'All 6 of these days already have records that will be replaced. Save?');
  });

  test('says when rest days lose their designation', () => {
    const one = [rest(WEEK[0]), duty(WEEK[1], '06:00', '14:00')];
    assert.equal(ask(one, WEEK, DUTY),
      '2 of these 6 days already have records that will be replaced, including a rest day that loses its designation. Save?');
    const two = [rest(WEEK[0]), rest(WEEK[1])];
    assert.equal(ask(two, WEEK, NOTE_ONLY),
      '2 of these 6 days already have records that will be replaced, including 2 rest days that lose their designation. Save?');
  });

  test('a rest day kept as rest keeps its designation', () => {
    const records = [rest(WEEK[0]), rest(WEEK[1], { note: 'Off' })];
    assert.equal(ask(records, WEEK, REST), '1 of these 6 days already has a record that will be replaced. Save?');
  });
});

describe('one-day save', () => {
  const DAY = ['2026-11-12'];

  test('replacing a duty day, note or no record asks nothing', () => {
    assert.equal(ask([duty(DAY[0], '06:00', '14:00', { note: 'x' })], DAY, DUTY), null);
    assert.equal(ask([], DAY, REST), null);
    assert.equal(ask([duty(DAY[0], '06:00', '14:00')], DAY, REST), null);
  });

  test('unmarking a designated rest day asks, with its designation date', () => {
    const text = 'This rest day was designated Nov 5. Unmarking it drops that designation: ' +
      'marking it rest again records the day you do. Save?';
    assert.equal(ask([rest(DAY[0])], DAY, DUTY), text);
    assert.equal(ask([rest(DAY[0])], DAY, NOTE_ONLY), text);
  });

  test('a designation from another year shows the year', () => {
    assert.match(ask([rest('2027-01-02', { designated: '2026-12-20 09:00' })], ['2027-01-02'], DUTY),
      /designated Dec 20, 2026\./);
  });

  test('a rest day kept as rest, or without a designation on record, asks nothing', () => {
    assert.equal(ask([rest(DAY[0])], DAY, { ...REST, note: 'Off' }), null);
    assert.equal(ask([rest(DAY[0], { designated: null })], DAY, DUTY), null);
  });
});
