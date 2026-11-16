import { flightFormTimesOf, flightSaveRequest, readFlightForm, type FlightFormTarget } from '@wingbeat/core/corrections';
import { flightFormChoices, newFlightFields, placeCoords, placesOf } from '@/lib/flight-form';

const TZ = 'America/Anchorage';
const NEW: FlightFormTarget = { tracked: false, entryId: null };
const POINTS = {
  type: 'FeatureCollection' as const,
  features: [
    { type: 'Feature' as const, properties: { id: 2, name: 'Larsen Bay', maxKm: null }, geometry: { type: 'Point' as const, coordinates: [-153.98, 57.54] as [number, number] } },
    { type: 'Feature' as const, properties: { id: 1, name: 'Kodiak', maxKm: null }, geometry: { type: 'Point' as const, coordinates: [-152.49, 57.75] as [number, number] } },
  ],
};
const AIRCRAFT = [
  { tail_number: 'N123AB', name: 'Beaver', active: 1 },
  { tail_number: 'N9OLD', name: null, active: 0 },
];
const PILOTS = [{ id: 3, name: 'Jane Pilot', active: 1 }, { id: 4, name: 'Old Pilot', active: 0 }];

describe('places', () => {
  test('sorted by name, with lat and lon from the GeoJSON', () => {
    const places = placesOf(POINTS);
    expect(places).toEqual([
      { name: 'Kodiak', lat: 57.75, lon: -152.49 },
      { name: 'Larsen Bay', lat: 57.54, lon: -153.98 },
    ]);
    expect(placeCoords(places, 'Kodiak')).toEqual([57.75, -152.49]);
    expect(placeCoords(places, 'Somewhere')).toEqual([null, null]);
    expect(placeCoords(places, null)).toEqual([null, null]);
  });
});

describe('newFlightFields', () => {
  test('the pilot preset, equal times that the save refuses', () => {
    const f = newFlightFields('2026-07-01', 3);
    expect(f.pilot).toBe('3');
    expect(newFlightFields('2026-07-01', null).pilot).toBe('');
    expect(readFlightForm(TZ, f, NEW)).toBe('The arrival time is the same as the departure.');
  });
});

describe('flightFormChoices', () => {
  const places = placesOf(POINTS);
  test('active aircraft and pilots, the form\'s own inactive one, and Choose… until a manual flight has a pilot', () => {
    const c = flightFormChoices(newFlightFields('2026-07-01', null), AIRCRAFT, PILOTS, places, false);
    expect(c.aircraft.map((a) => a.value)).toEqual(['', 'N123AB']);
    expect(c.aircraft[1].label).toBe('N123AB – Beaver');
    expect(c.pilots).toEqual([{ value: '', label: 'Choose…' }, { value: '3', label: 'Jane Pilot' }]);
    const own = flightFormChoices({ ...newFlightFields('2026-07-01', 4), aircraft: 'N9OLD' }, AIRCRAFT, PILOTS, places, false);
    expect(own.aircraft.map((a) => a.value)).toEqual(['', 'N123AB', 'N9OLD']);
    expect(own.pilots.map((p) => p.value)).toEqual(['3', '4']);
    expect(flightFormChoices(newFlightFields('2026-07-01', 3), AIRCRAFT, PILOTS, places, true).pilots[0])
      .toEqual({ value: '', label: 'Unknown Pilot' });
  });
  test('named points, and a label that isn\'t one', () => {
    const c = flightFormChoices({ ...newFlightFields('2026-07-01', 3), dest: 'Uyak' }, AIRCRAFT, PILOTS, places, false);
    expect(c.origins.map((o) => o.value)).toEqual(['', 'Kodiak', 'Larsen Bay']);
    expect(c.dests.map((o) => o.value)).toEqual(['', 'Uyak', 'Kodiak', 'Larsen Bay']);
  });
});

describe('a new manual flight\'s save', () => {
  test('POSTs the whole row with the named points\' coordinates', () => {
    const places = placesOf(POINTS);
    const fields = { ...newFlightFields('2026-07-01', 3), dep: '08:00', arr: '09:12', origin: 'Kodiak', dest: 'Uyak', part: '91' as const, pay: 'unpaid' as const, remark: ' Training ' };
    const v = readFlightForm(TZ, fields, NEW);
    if (typeof v === 'string') throw new Error(v);
    const req = flightSaveRequest(v, NEW, { removed: false, baseHistoryId: 5, coords: (l) => placeCoords(places, l) });
    if (typeof req === 'string') throw new Error(req);
    // 2026-07-01 08:00 AKDT is 16:00 UTC.
    const start = Date.UTC(2026, 6, 1, 16) / 1000;
    expect(req.entryId).toBeNull();
    expect(req.body).toMatchObject({
      start_time: start, end_time: start + 72 * 60, origin_label: 'Kodiak', destination_label: 'Uyak',
      pilot_id: 3, aircraft_tail: null, part91: true, unpaid: true, remark: 'Training', excluded: false,
      start_lat: 57.75, start_lon: -152.49, end_lat: null, end_lon: null,
    });
  });
  test('an arrival before the departure is the next day', () => {
    const t = flightFormTimesOf(TZ, { date: '2026-07-01', dep: '23:30', arr: '00:30' });
    expect(t?.nextDay).toBe(true);
    expect(t?.secs).toBe(3600);
    expect(t?.hint).not.toBe('');
  });
  test('a manual flight needs a pilot', () => {
    const v = readFlightForm(TZ, { ...newFlightFields('2026-07-01', null), arr: '09:00' }, NEW);
    if (typeof v === 'string') throw new Error(v);
    expect(flightSaveRequest(v, NEW, { removed: false, baseHistoryId: 0, coords: () => [null, null] })).toBe('Choose a pilot.');
  });
});
