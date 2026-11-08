// @wingbeat/core/edit-history: the flight form's and the duty forms' "Last changed by …"
// line (lastEditText()) from a record's GET /api/edit-history rows. The conflict text,
// editConflictText(), is specified in edit-conflict.test.mjs through the page's global.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore, TZ } from './core.mjs';
import { loadEngine } from './harness.mjs';

const eh = await importCore('edit-history');
const time = await importCore('time');
const at = (s) => time.tzLocalToEpoch(TZ, ...s.split(' '));

const row = (entity, over = {}) => ({
  id: 5, at: at('2026-10-13 09:12'), user_id: 3, user_name: 'Sam', entity, entity_key: '1/100',
  action: 'update', before: null, after: null, ...over,
});
const assignment = (before, after, over) => row('flight_assignment', { before: JSON.stringify(before), after: JSON.stringify(after), ...over });

describe('lastEditText', () => {
  test('who changed it and when, in the operator’s timezone', () => {
    assert.equal(eh.lastEditText(TZ, row('flight_corrections')), 'Last changed by Sam, Tue Oct 13 09:12.');
    assert.match(eh.lastEditText(TZ, row('duty_days', { user_name: null })), /^Last changed by an unknown user,/);
  });

  test('an aircraft/pilot change on its own says which', () => {
    assert.match(eh.lastEditText(TZ, assignment({ pilot_id: 1, aircraft_tail: 'N1' }, { pilot_id: 2, aircraft_tail: 'N1' })), /^Pilot last changed by Sam/);
    assert.match(eh.lastEditText(TZ, assignment({ pilot_id: 1, aircraft_tail: 'N1' }, { pilot_id: 1, aircraft_tail: 'N2' })), /^Aircraft last changed/);
    assert.match(eh.lastEditText(TZ, assignment({ pilot_id: 1, aircraft_tail: 'N1' }, { pilot_id: 2, aircraft_tail: 'N2' })), /^Aircraft and pilot last changed/);
    assert.match(eh.lastEditText(TZ, row('flight_assignment', { before: '{bad' })), /^Aircraft or pilot last changed/);
  });

  test('one saved with the flight’s corrections (same user and time) is a plain change', () => {
    const h = assignment({ pilot_id: 1 }, { pilot_id: 2 });
    assert.match(eh.lastEditText(TZ, h, row('flight_corrections', { id: 4 })), /^Last changed by Sam/);
    // Another user's correction just before: the assignment says which.
    assert.match(eh.lastEditText(TZ, h, row('flight_corrections', { id: 4, user_id: 9 })), /^Pilot last changed/);
  });

  test('the page’s global binds the operator timezone', () => {
    const engine = loadEngine({ settings: { timezone: 'Europe/Berlin' } });
    assert.equal(engine.lastEditText(row('duty_days')), eh.lastEditText('Europe/Berlin', row('duty_days')));
  });
});
