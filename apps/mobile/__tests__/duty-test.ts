import type { DutyLogResponse } from '@wingbeat/core/api/duty';
import type { FlightCorrection, FlightEdit } from '@wingbeat/core/flight-edits';
import {
  dutyMonth, dutyMonthIndex, dutyMonthOf, dutyMonthView, dutyPilots, dutyPilotShown,
} from '@/lib/duty';
import type { Flight } from '@/lib/flights';
import { parseDutyLog, parseDutyPilot } from '@/lib/prefs';

const TZ = 'America/Anchorage';
// 2026-07-01 08:00 AKDT (16:00 UTC); "now" is 2026-07-03 12:00 AKDT.
const JUL1_0800 = Date.UTC(2026, 6, 1, 16) / 1000;
const NOW = JUL1_0800 + 2 * 86400 + 4 * 3600;
const PILOT = { id: 3, name: 'Jane Pilot' };

const flight = (over: Partial<Flight>): Flight => ({
  id: 1, tracker_id: 7, start_time: JUL1_0800, end_time: JUL1_0800 + 4320,
  origin_label: 'Kodiak', destination_label: 'Larsen Bay', aircraft_tail: 'N123AB', pilot_id: 3, pilot_name: 'Jane Pilot',
  ...over,
});
const edit = (over: Partial<FlightEdit>): FlightEdit => ({
  entry: { id: 9 } as FlightCorrection, manual: false, part91: false, unpaid: false, remark: null, excluded: false, original: {}, ...over,
});
const log = (over: Partial<DutyLogResponse> = {}): DutyLogResponse => ({
  days: [], default_duties: [], duty_methods: [], last_history_id: 0, ...over,
});
const day = (date: string, over: Partial<DutyLogResponse['days'][number]> = {}) => ({
  pilot_id: 3, date, duty_start: null, duty_end: null, rest: 0, rest_designated_at: null, note: null, ...over,
});

test('the month newest first: duty, note, flights as the list’s rows, the day’s total, warnings', () => {
  const flights = [
    flight({}),
    flight({ id: 2, start_time: JUL1_0800 + 7200, end_time: JUL1_0800 + 9000, aircraft_tail: null, edit: edit({ part91: true, original: { end_time: 1 } }) }),
    flight({ id: 3, pilot_id: 4 }),
  ];
  const data = dutyMonth(TZ, NOW, flights, [], PILOT, 2026, 7, log({
    days: [day('2026-07-01', { duty_start: '07:30', duty_end: '16:00', note: 'Checkride' }), day('2026-07-02', { rest: 1 })],
  }));
  const view = dutyMonthView(TZ, data);
  expect(view.days.map((d) => d.title)).toEqual(['Fri Jul 3', 'Thu Jul 2', 'Wed Jul 1']);
  const jul1 = view.days[2];
  expect(jul1).toMatchObject({ duty: '07:30–16:00', note: 'Checkride', rest: false, total: '1:42' });
  expect(jul1.data.map((i) => i.kind)).toEqual(['flight', 'flight']);
  expect(jul1.data[0]).toEqual({
    kind: 'flight', key: 'f1',
    row: {
      id: 1, time: '08:00–09:12 AKDT', timesEdited: false, duration: '1:12', route: 'Kodiak → Larsen Bay', routeEdited: false,
      manual: false, assignment: 'N123AB', remarks: [],
    },
  });
  expect(jul1.data[1]).toMatchObject({ row: { timesEdited: true, assignment: null, remarks: ['Remarks: Part 91'] } });
  expect(view.days[1]).toMatchObject({ duty: 'Rest', rest: true, total: null, data: [] });
  expect(view.monthTotal).toBe('Month total 1:42');
  expect(view.isCurrentMonth).toBe(true);
  expect(view.totalsTitle).toBe('§135.267 totals as of now');
});

test('totals as meters: hours toward their limits, rest days toward the quarter’s minimum', () => {
  const view = dutyMonthView(TZ, dutyMonth(TZ, NOW, [flight({})], [], PILOT, 2026, 7, log({ days: [day('2026-07-05', { rest: 1 })] })));
  const hours = view.meters.filter((m) => !m.label.startsWith('24 h rest'));
  expect(hours.length).toBeGreaterThan(0);
  for (const m of hours) {
    expect(m).toMatchObject({ value: '1:12', over: false });
    expect(m.fraction).toBeGreaterThan(0);
    expect(m.fraction).toBeLessThan(0.01);
  }
  expect(view.meters.at(-1)).toMatchObject({ label: '24 h rest periods, Q3 2026', value: '0 + 1 planned', limit: '13', over: false });
  expect(view.upcoming).toEqual([{ dayKey: '2026-07-05', title: 'Jul 5 Sun', duty: 'Rest', rest: true, note: null }]);
});

test('a warning row, and a correction whose flight is gone', () => {
  const long = flight({ end_time: JUL1_0800 + 9 * 3600 });
  const gone = { id: 5, tracker_id: 7, flight_start_time: JUL1_0800 + 36000, pilot_id: 3, part91: 1 } as unknown as FlightCorrection;
  const view = dutyMonthView(TZ, dutyMonth(TZ, NOW, [long], [gone], PILOT, 2026, 7, log()));
  const jul1 = view.days.at(-1)!;
  expect(jul1.data.some((i) => i.kind === 'warning')).toBe(true);
  expect(jul1.data.find((i) => i.kind === 'unmatched')).toEqual({
    kind: 'unmatched', key: 'u5', text: 'Tracked flight from 18:00 no longer found; its corrections (Part 91) aren’t counted.',
  });
});

test('a past month: totals as of its last day, nothing upcoming', () => {
  const view = dutyMonthView(TZ, dutyMonth(TZ, NOW, [], [], PILOT, 2026, 6, log()));
  expect(view.isCurrentMonth).toBe(false);
  expect(view.totalsTitle).toBe('§135.267 totals as of Jun 30, 2026');
  expect(view.days).toHaveLength(30);
});

test('the pilot shown: the one picked while it exists, else the first active one; the menu’s pilots', () => {
  const pilots = [{ id: 1, name: 'Ann', active: 0 }, { id: 2, name: 'Bo', active: 1 }, { id: 3, name: 'Cy', active: 1 }];
  expect(dutyPilotShown(pilots, 3)?.id).toBe(3);
  expect(dutyPilotShown(pilots, 1)?.id).toBe(1);
  expect(dutyPilotShown(pilots, 9)?.id).toBe(2);
  expect(dutyPilotShown(pilots, null)?.id).toBe(2);
  expect(dutyPilotShown([], null)).toBeNull();
  expect(dutyPilots(pilots, 2).map((p) => p.id)).toEqual([2, 3]);
  expect(dutyPilots(pilots, 1).map((p) => p.id)).toEqual([1, 2, 3]);
});

test('months as one number', () => {
  expect(dutyMonthOf(dutyMonthIndex(2026, 1) - 1)).toEqual([2025, 12]);
  expect(dutyMonthOf(dutyMonthIndex(2026, 12))).toEqual([2026, 12]);
});

test('stored duty prefs', () => {
  expect(parseDutyPilot(4)).toBe(4);
  expect(parseDutyPilot('4')).toBeNull();
  expect(parseDutyPilot(undefined)).toBeNull();
  expect(parseDutyLog(log())).toEqual(log());
  expect(parseDutyLog({ days: 'x' })).toBeNull();
  expect(parseDutyLog(undefined)).toBeNull();
});
