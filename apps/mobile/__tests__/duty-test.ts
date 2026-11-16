import type { DutyLogResponse } from '@wingbeat/core/api/duty';
import { dutyExportEarliest, dutyMonthIndex, dutyMonthOf } from '@wingbeat/core/duty';
import type { FlightCorrection, FlightEdit } from '@wingbeat/core/flight-edits';
import { MAX_DUTY_DAYS_PER_REQUEST } from '@wingbeat/core/record-limits';
import { dateOfDayKey, dateOfTime, dayKeyOfDate, timeOfDate } from '@/lib/date-pickers';
import {
  dutyDayFormOf, dutyDayRequest, dutyDaysRecorded, dutyTimesSuggested,
  dutyExportMonths, dutyExportOptions, dutyMonth, dutyMonths, dutyMonthView, dutyPilots, dutyPilotShown,
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
const correction = (over: Partial<FlightCorrection>): FlightCorrection => ({
  id: 9, tracker_id: 7, flight_start_time: null, start_time: null, end_time: null, origin_label: null, destination_label: null,
  part91: 0, unpaid: 0, excluded: 0, remark: null, pilot_id: null, aircraft_tail: null, ...over,
});
const edit = (over: Partial<FlightEdit>): FlightEdit => ({
  entry: correction({}), manual: false, part91: false, unpaid: false, remark: null, excluded: false, original: {}, ...over,
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
  const gone = correction({ id: 5, flight_start_time: JUL1_0800 + 36000, pilot_id: 3, part91: 1 });
  const view = dutyMonthView(TZ, dutyMonth(TZ, NOW, [long], [gone], PILOT, 2026, 7, log()));
  const jul1 = view.days.at(-1)!;
  expect(jul1.data.find((i) => i.kind === 'warning')).toMatchObject({
    text: '9:00 flight time in the 24 h to 17:00 (§135.267(b) limit 8:00)',
  });
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

test('the pilot shown: the one picked while it exists, else the user’s own, else the first active one; the menu’s pilots', () => {
  const pilots = [{ id: 1, name: 'Ann', active: 0 }, { id: 2, name: 'Bo', active: 1 }, { id: 3, name: 'Cy', active: 1 }];
  expect(dutyPilotShown(pilots, 3, null)?.id).toBe(3);
  expect(dutyPilotShown(pilots, 1, null)?.id).toBe(1);
  expect(dutyPilotShown(pilots, 9, null)?.id).toBe(2);
  expect(dutyPilotShown(pilots, null, null)?.id).toBe(2);
  expect(dutyPilotShown(pilots, null, 3)?.id).toBe(3);
  expect(dutyPilotShown(pilots, 2, 3)?.id).toBe(2);
  expect(dutyPilotShown(pilots, null, 9)?.id).toBe(2);
  expect(dutyPilotShown([], null, null)).toBeNull();
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

test('the Export PDF menu: the shown month, its quarter so far, the quarter before, the last 12 months', () => {
  const cur = dutyMonthIndex(2026, 7);
  expect(dutyExportOptions(TZ, [flight({})], PILOT.id, cur, cur).map(({ title, subtitle }) => [title, subtitle])).toEqual([
    ['Month', 'July 2026'],
    ['Quarter', 'July 2026'],
    ['Previous quarter', 'April – June 2026'],
    ['Last 12 months', 'August 2025 – July 2026'],
  ]);
});

test('a Custom export reaches back to the pilot’s first flight', () => {
  const cur = dutyMonthIndex(2026, 7);
  const early = flight({ start_time: Date.UTC(2024, 9, 15, 20) / 1000 });
  const earliest = dutyExportEarliest(TZ, [early, flight({})], PILOT.id, cur, cur);
  expect(dutyMonthOf(earliest)).toEqual([2024, 10]);
  expect(dutyExportMonths(earliest, cur).at(-1)).toEqual({ value: earliest, label: 'October 2024' });
});

test('a Custom export offers the months newest first', () => {
  const cur = dutyMonthIndex(2026, 7);
  expect(dutyExportMonths(cur - 2, cur)).toEqual([
    { value: cur, label: 'July 2026' },
    { value: cur - 1, label: 'June 2026' },
    { value: cur - 2, label: 'May 2026' },
  ]);
});

test('an export’s months, in order, as the screen computes each', () => {
  const months = dutyMonths(TZ, NOW, [flight({})], [], PILOT, dutyMonthIndex(2026, 5), dutyMonthIndex(2026, 7), log());
  expect(months.map((m) => [m.year, m.month, m.pilotName])).toEqual([[2026, 5, 'Jane Pilot'], [2026, 6, 'Jane Pilot'], [2026, 7, 'Jane Pilot']]);
  expect(months[2].monthSecs).toBe(4320);
});

test('the day form fills from the first date’s record', () => {
  const l = log({ days: [day('2026-07-04', { duty_start: '06:00', duty_end: '15:00', note: 'Charter' }), day('2026-07-06', { rest: 1 })] });
  expect(dutyDayFormOf(l, '2026-07-04', null)).toEqual({ from: '2026-07-04', through: null, rest: false, times: { start: '06:00', end: '15:00' }, note: 'Charter' });
  expect(dutyDayFormOf(l, '2026-07-06', '2026-07-08')).toEqual({ from: '2026-07-06', through: '2026-07-08', rest: true, times: null, note: '' });
  expect(dutyDaysRecorded(l, { from: '2026-07-05', through: null })).toBe(false);
  expect(dutyDaysRecorded(l, { from: '2026-07-05', through: '2026-07-06' })).toBe(true);
});

test('the day form’s request: a rest day sends no times, and a bad range or times say why', () => {
  const form = { from: '2026-07-04', through: '2026-07-05', rest: false, times: { start: '08:00', end: '17:00' }, note: 'x' };
  expect(dutyDayRequest(form)).toEqual({
    keys: ['2026-07-04', '2026-07-05'],
    body: { dates: ['2026-07-04', '2026-07-05'], duty_start: '08:00', duty_end: '17:00', rest: false, note: 'x' },
  });
  expect(dutyDayRequest({ ...form, rest: true })).toMatchObject({ body: { duty_start: null, duty_end: null, rest: true } });
  expect(dutyDayRequest({ ...form, through: '2026-07-01' })).toBe('The Through date is before the date.');
  expect(dutyDayRequest({ ...form, times: { start: '08:00', end: '08:00' } })).toBe('The duty end must differ from its start.');
  // Times on a rest day aren't sent, so they aren't checked either.
  expect(dutyDayRequest({ ...form, rest: true, times: { start: '08:00', end: '08:00' } })).toMatchObject({ body: { rest: true } });
  const past = dayKeyOfDate(new Date(2026, 6, 4 + MAX_DUTY_DAYS_PER_REQUEST, 12));
  expect(dutyDayRequest({ ...form, through: past })).toBe('Enter at most ' + MAX_DUTY_DAYS_PER_REQUEST + ' days at a time.');
});

test('Duty Times starts from the pilot’s default on the date', () => {
  const l = log({ default_duties: [{ effective_date: '2026-07-05', duty_start: '07:00', duty_end: '16:00' }] });
  expect(dutyTimesSuggested(l, '2026-07-04')).toEqual({ start: '07:00', end: '16:00' }); // the earliest entry before it starts
  expect(dutyTimesSuggested(log(), '2026-07-04')).toEqual({ start: '08:00', end: '17:00' });
});

test('dates and times round-trip through the pickers’ Dates', () => {
  expect(dayKeyOfDate(dateOfDayKey('2026-03-08'))).toBe('2026-03-08');
  expect(timeOfDate(dateOfTime('06:05'))).toBe('06:05');
});
