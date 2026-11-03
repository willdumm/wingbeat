// The flight filter: @wingbeat/core/filters (the state's normalization and the test of a
// flight against it, in operator days) and the page's filterStore (filters.ts), which keeps
// the state in localStorage and filters through the core bundle's globals. The dashboard's
// flight list, the analytics page and the flight editor all filter with it.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { importCore } from './core.mjs';
import { loadEngine, plain, TZ } from './harness.mjs';

const filters = await importCore('filters');
const time = await importCore('time');
const at = (s) => time.tzLocalToEpoch(TZ, ...s.split(' '));
const state = (over = {}) => ({ ...filters.emptyFilterState(), ...over });
const flight = (start, over = {}) => ({ start_time: at(start), tracker_id: 1, pilot_id: 2, aircraft_tail: 'N1', ...over });
const matches = (f, s) => filters.matchesFlight(TZ, f, s);

describe('matchesFlight', () => {
  test('no filter: every flight', () => {
    assert.equal(matches(flight('2026-07-01 09:00', { tracker_id: null, pilot_id: null, aircraft_tail: null }), state()), true);
  });

  test('dates are the operator’s days, both ends inclusive', () => {
    const s = state({ dateFrom: '2026-07-01', dateTo: '2026-07-02' });
    assert.equal(matches(flight('2026-07-01 00:00'), s), true);
    assert.equal(matches(flight('2026-07-02 23:59'), s), true);
    assert.equal(matches(flight('2026-06-30 23:59'), s), false);
    assert.equal(matches(flight('2026-07-03 00:00'), s), false);
    // 23:30 in Anchorage is the next day in UTC (and in Berlin): still July 2 here.
    assert.equal(filters.matchesFlight(TZ, flight('2026-07-02 23:30'), state({ dateTo: '2026-07-02' })), true);
    assert.equal(filters.matchesFlight('Europe/Berlin', flight('2026-07-02 23:30'), state({ dateTo: '2026-07-02' })), false);
  });

  test('trackers: manual flights show unless a tracker filter is set, and __manual__ selects them', () => {
    const manual = flight('2026-07-01 09:00', { tracker_id: null });
    assert.equal(matches(manual, state({ trackerIds: [1] })), false);
    assert.equal(matches(manual, state({ trackerIds: ['__manual__'] })), true);
    assert.equal(matches(flight('2026-07-01 09:00'), state({ trackerIds: [1, '__manual__'] })), true);
    assert.equal(matches(flight('2026-07-01 09:00', { tracker_id: 2 }), state({ trackerIds: [1] })), false);
  });

  test('pilots and aircraft: __null__ selects flights with none', () => {
    assert.equal(matches(flight('2026-07-01 09:00'), state({ pilotIds: [2] })), true);
    assert.equal(matches(flight('2026-07-01 09:00'), state({ pilotIds: [3] })), false);
    assert.equal(matches(flight('2026-07-01 09:00', { pilot_id: null }), state({ pilotIds: ['__null__'] })), true);
    assert.equal(matches(flight('2026-07-01 09:00'), state({ aircraftTails: ['N1'] })), true);
    assert.equal(matches(flight('2026-07-01 09:00'), state({ aircraftTails: ['__null__'] })), false);
    assert.equal(matches(flight('2026-07-01 09:00', { aircraft_tail: null }), state({ aircraftTails: ['__null__'] })), true);
    // Every filter has to pass.
    assert.equal(matches(flight('2026-07-01 09:00'), state({ pilotIds: [2], aircraftTails: ['N2'] })), false);
  });
});

describe('normalizeFilterState', () => {
  test('missing fields are filled in, and what isn’t an object is the empty state', () => {
    assert.deepEqual(filters.normalizeFilterState({ dateFrom: '2026-07-01', pilotIds: [2] }),
      state({ dateFrom: '2026-07-01', pilotIds: [2] }));
    for (const bad of [null, 5, 'x', undefined]) assert.deepEqual(filters.normalizeFilterState(bad), state());
  });
});

describe('filterStore (the page’s)', () => {
  test('load() reads ft_filters_v1, normalized, and an unreadable one as empty', () => {
    const engine = loadEngine();
    assert.deepEqual(plain(engine.filterStore.load()), state());
    engine.storage.set('ft_filters_v1', JSON.stringify({ trackerIds: [1], extra: true }));
    assert.deepEqual(plain(engine.filterStore.load()), { ...state({ trackerIds: [1] }) });
    engine.storage.set('ft_filters_v1', '{not json');
    assert.deepEqual(plain(engine.filterStore.load()), state());
  });

  test('save() then load() round-trips, and matchesFlight() is core’s in the operator timezone', () => {
    const engine = loadEngine();
    const s = state({ dateFrom: '2026-07-02', aircraftTails: ['N1'] });
    engine.filterStore.save(s);
    assert.deepEqual(plain(engine.filterStore.load()), s);
    for (const f of [flight('2026-07-02 00:10'), flight('2026-07-01 23:50'), flight('2026-07-02 10:00', { aircraft_tail: 'N2' })]) {
      assert.equal(engine.filterStore.matchesFlight(f, s), matches(f, s));
    }
  });
});
