// What the flight form and the day form say when a save is refused because the record
// changed since they loaded it (editConflictText() in edit-history.ts; the server's side
// is in worker-sql.test.mjs, "edit conflicts").

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, fixtures } from './harness.mjs';

const engine = loadEngine({ now: '2026-10-15 12:00' });
const { at } = fixtures(engine);
const { editConflictText } = engine;

describe('editConflictText', () => {
  test("names who changed it and when, in the operator's timezone", () => {
    assert.equal(editConflictText({ id: 9, at: at('2026-10-13 09:12'), user_id: 3, user_name: 'Sam' }),
      'Changed by Sam since this was loaded (Tue Oct 13 09:12).');
  });

  test('a change made outside the app has no user', () => {
    assert.match(editConflictText({ id: 9, at: at('2026-10-13 09:12'), user_id: null, user_name: null }),
      /^Changed by an unknown user since/);
  });
});
