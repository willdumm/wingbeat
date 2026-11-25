// A flight's URL (packages/core/src/flight-link.ts): its key survives re-segmentation and a
// corrected departure, and the docs site's association file matches core's.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importCore } from './core.mjs';

const { flightPath, parseFlightPath, findFlightByKey, APPLE_APP_SITE_ASSOCIATION } = await importCore('flight-link');

test('a tracked flight is its tracker and tracked start, a manual one its row', () => {
  assert.equal(flightPath({ id: 9, tracker_id: 3, start_time: 1000 }), '/flights/3/1000');
  assert.equal(flightPath({ id: 9, tracker_id: 3, start_time: 900, edit: { original: { start_time: 1000 } } }), '/flights/3/1000');
  assert.equal(flightPath({ id: -12, tracker_id: null, start_time: 1000 }), '/flights/manual/12');
});

test('parseFlightPath reads those back, and nothing else', () => {
  assert.equal(parseFlightPath('/flights/3/1000'), '3/1000');
  assert.equal(parseFlightPath('/flights/manual/12/'), 'manual/12');
  for (const p of ['/', '/flights', '/flights/3', '/flights/3/x', '/flights/0/1', '/flights/3/1/2', '/x/flights/3/1', '/flights/3/1?x', '//flights/3/1']) {
    assert.equal(parseFlightPath(p), null, p);
  }
});

test('findFlightByKey finds the flight under whatever id it has now', () => {
  const flights = [{ id: 1, tracker_id: 2, start_time: 1000 }, { id: 5, tracker_id: 3, start_time: 1000 }];
  assert.equal(findFlightByKey(flights, '3/1000').id, 5);
  assert.equal(findFlightByKey(flights, '3/1001'), null);
});

test('the docs site serves the same association file', () => {
  const file = new URL('../site/static/.well-known/apple-app-site-association', import.meta.url);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), APPLE_APP_SITE_ASSOCIATION);
});
