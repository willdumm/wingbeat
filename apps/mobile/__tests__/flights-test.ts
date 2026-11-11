import { emptyFilterState } from '@wingbeat/core/filters';
import type { FlightCorrection, FlightEdit } from '@wingbeat/core/flight-edits';
import {
  assignmentChoices, assignmentRequest, filterChoices, flightDays, flightDetail, flightRow, flightTrack,
  isFiltered, presetDateRange, toggled, type Flight,
} from '@/lib/flights';

const TZ = 'America/Anchorage';
// 2026-07-01 08:00 AKDT (16:00 UTC).
const JUL1_0800 = Date.UTC(2026, 6, 1, 16) / 1000;
const roster = { hasAircraft: true, hasPilots: true };

const flight = (over: Partial<Flight>): Flight => ({
  id: 1, tracker_id: 7, start_time: JUL1_0800, end_time: JUL1_0800 + 4320,
  origin_label: 'Kodiak', destination_label: 'Larsen Bay', aircraft_tail: 'N123AB', pilot_id: 3, pilot_name: 'Jane Pilot',
  points: [], ...over,
});
const edit = (over: Partial<FlightEdit>): FlightEdit => ({
  entry: { id: 9 } as FlightCorrection, manual: false, part91: false, unpaid: false, remark: null, excluded: false, original: {}, ...over,
});

test('a row: zoned time, duration, route, assignment and remarks, as the dashboard shows them', () => {
  expect(flightRow(TZ, flight({}), roster)).toEqual({
    id: 1, time: '08:00 AKDT', timesEdited: false, duration: '(1.2 hr)', route: 'Kodiak → Larsen Bay',
    routeEdited: false, manual: false, assignment: 'N123AB · Jane Pilot', remarks: [],
  });
  const corrected = flight({
    end_time: null, destination_label: null, aircraft_tail: null, pilot_id: null, pilot_name: null,
    edit: edit({ part91: true, remark: 'Ferry', original: { start_time: JUL1_0800 - 300 } }),
  });
  expect(flightRow(TZ, corrected, roster)).toMatchObject({
    timesEdited: true, duration: null, route: 'Kodiak →', assignment: 'Unknown Aircraft · Unknown Pilot',
    remarks: ['Part 91', 'Ferry'],
  });
  expect(flightRow(TZ, flight({ aircraft_tail: null, pilot_id: null, pilot_name: null }), { hasAircraft: false, hasPilots: false }).assignment)
    .toBeNull();
  expect(flightRow(TZ, flight({ tracker_id: null, origin_label: null, destination_label: null, edit: edit({ manual: true }) }), roster))
    .toMatchObject({ manual: true, route: '? → ?' });
});

test('days are operator days, newest first', () => {
  // 23:30 AKDT on Jul 1 is Jul 2 in UTC, but Jul 1 in Anchorage.
  const flights = [
    flight({ id: 1 }),
    flight({ id: 2, start_time: JUL1_0800 + 15.5 * 3600 }),
    flight({ id: 3, start_time: JUL1_0800 + 24 * 3600 }),
  ];
  const days = flightDays(TZ, flights, roster);
  expect(days.map((d) => [d.dayKey, d.title, d.data.map((r) => r.id)])).toEqual([
    ['2026-07-02', 'Thu, Jul 2, 2026', [3]],
    ['2026-07-01', 'Wed, Jul 1, 2026', [2, 1]],
  ]);
});

test('date presets count back from the operator day, today included', () => {
  // 2026-07-02 05:00 UTC is still Jul 1 in Anchorage.
  const now = Date.UTC(2026, 6, 2, 5) / 1000;
  expect(presetDateRange(TZ, now, 'all')).toEqual({ dateFrom: null, dateTo: null });
  expect(presetDateRange(TZ, now, 'today')).toEqual({ dateFrom: '2026-07-01', dateTo: null });
  expect(presetDateRange(TZ, now, '7d')).toEqual({ dateFrom: '2026-06-25', dateTo: null });
  expect(isFiltered(emptyFilterState())).toBe(false);
  expect(isFiltered({ ...emptyFilterState(), pilotIds: ['__null__'] })).toBe(true);
  expect(toggled([1, 2], 2)).toEqual([1]);
  expect(toggled([1], 2)).toEqual([1, 2]);
});

test('filter choices: manual entries only when there are manual flights, and each list its none', () => {
  const lists = { trackers: [{ id: 7, name: 'Tracker 7' }], pilots: [{ id: 3, name: 'Jane Pilot' }], aircraft: [{ tail_number: 'N123AB' }] };
  const c = filterChoices([flight({})], lists);
  expect(c.trackers.map((x) => x.value)).toEqual([7]);
  expect(c.pilots.map((x) => x.value)).toEqual([3, '__null__']);
  expect(c.aircraft.map((x) => x.value)).toEqual(['N123AB', '__null__']);
  expect(filterChoices([flight({ tracker_id: null })], lists).trackers.map((x) => x.value)).toEqual([7, '__manual__']);
});

test('the detail shows a corrected field with the tracker’s value', () => {
  const f = flight({ origin_label: 'Kodiak Muni', edit: edit({ original: { origin_label: 'Kodiak', end_time: JUL1_0800 + 3600 } }) });
  const d = flightDetail(TZ, f, roster);
  expect(d.title).toBe('Wed, Jul 1, 2026');
  expect(d.fields).toEqual([
    { label: 'Dep', value: '08:00 AKDT' },
    { label: 'Arr', value: '09:12 AKDT', tracker: 'Tracker: 09:00' },
    { label: 'Duration', value: '1.2 hr' },
    { label: 'Origin', value: 'Kodiak Muni', tracker: 'Tracker: Kodiak' },
    { label: 'Dest', value: 'Larsen Bay' },
    { label: 'Aircraft', value: 'N123AB' },
    { label: 'Pilot', value: 'Jane Pilot' },
  ]);
  expect(flightDetail(TZ, flight({ end_time: null }), roster).fields[1].value).toBe('In progress');
});

test('the track: its line, start and end, and bounds; a manual flight’s named points', () => {
  const colors = { track: 'T', start: 'S', end: 'E' };
  const p = (lon: number, lat: number) => ({ t: 0, lat, lon, v: null, e: null, c: null });
  const tr = flightTrack(flight({ points: [p(-152.4, 57.7), p(-153, 57.9), p(-153.9, 57.5)] }), colors);
  expect(tr.line.features[0].geometry.coordinates).toHaveLength(3);
  expect(tr.ends.features.map((f) => [f.geometry.coordinates, f.properties!.color])).toEqual([[[-152.4, 57.7], 'S'], [[-153.9, 57.5], 'E']]);
  expect(tr.bounds).toEqual([-153.9, 57.5, -152.4, 57.9]);

  const manual = flightTrack(flight({ start_lon: -152.4, start_lat: 57.7, end_lon: null, end_lat: null }), colors);
  expect(manual.line.features).toEqual([]);
  expect(manual.ends.features).toHaveLength(1);
  // A single point still gets a box to fit.
  expect(manual.bounds![2] - manual.bounds![0]).toBeCloseTo(0.05);
  expect(flightTrack(flight({}), colors).bounds).toBeNull();
});

test('assignment: active choices plus the flight’s own, and a request with only what changed', () => {
  const aircraft = [
    { tail_number: 'N123AB', name: 'Beaver', active: 0 },
    { tail_number: 'N456CD', name: null, active: 1 },
    { tail_number: 'N789EF', name: null, active: 0 },
  ];
  const pilots = [{ id: 3, name: 'Jane Pilot', active: 1 }, { id: 4, name: 'Old Pilot', active: 0 }];
  const f = flight({});
  const c = assignmentChoices(f, aircraft, pilots);
  expect(c.aircraft.map((x) => x.label)).toEqual(['Unknown Aircraft', 'N123AB – Beaver', 'N456CD']);
  expect(c.pilots.map((x) => x.value)).toEqual([null, 3]);
  // A manual flight always has a pilot.
  expect(assignmentChoices(flight({ edit: edit({ manual: true }) }), aircraft, pilots).pilots.map((x) => x.value)).toEqual([3]);

  expect(assignmentRequest(f, 'N123AB', 3)).toBeNull();
  expect(assignmentRequest(f, 'N456CD', 3)).toEqual({ flight_ids: [1], entry_ids: [], aircraft_tail: 'N456CD' });
  expect(assignmentRequest(f, 'N123AB', null)).toEqual({ flight_ids: [1], entry_ids: [], pilot_id: null });
  const manual = flight({ id: -9, tracker_id: null, edit: edit({ manual: true }) });
  expect(assignmentRequest(manual, null, 3)).toEqual({ flight_ids: [], entry_ids: [9], aircraft_tail: null });
});
