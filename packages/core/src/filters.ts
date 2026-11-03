/**
 * The flight filter (src/shared/filters.ts): the state the dashboard's flight list, the
 * analytics page and the flight editor filter by, and the test of one flight against it.
 * Days are operator days, in tz. Persisting the state stays with each client (the web
 * keeps it in localStorage, 'ft_filters_v1').
 */
import { tzDayEndUnix, tzDayStartUnix } from './time';

/** '__null__' in pilotIds or aircraftTails selects flights with none; '__manual__' in trackerIds, manual flights. */
export interface FilterState {
  /** YYYY-MM-DD, inclusive, or null for no bound. */
  dateFrom: string | null;
  dateTo: string | null;
  trackerIds: (number | '__manual__')[];
  pilotIds: (number | '__null__')[];
  aircraftTails: (string | '__null__')[];
}

/** The state with no filter set. */
export function emptyFilterState(): FilterState {
  return { dateFrom: null, dateTo: null, trackerIds: [], pilotIds: [], aircraftTails: [] };
}

/**
 * A stored state (parsed JSON, maybe from an older version or partly missing) with every
 * field present; anything that isn't an object is the empty state.
 */
export function normalizeFilterState(s: unknown): FilterState {
  if (!s || typeof s !== 'object') return emptyFilterState();
  const o = s as Partial<FilterState>;
  return {
    dateFrom:      o.dateFrom      ?? null,
    dateTo:        o.dateTo        ?? null,
    trackerIds:    o.trackerIds    ?? [],
    pilotIds:      o.pilotIds      ?? [],
    aircraftTails: o.aircraftTails ?? [],
  };
}

const dayParts = (dateKey: string) => dateKey.split('-').map(Number) as [number, number, number];

/** Whether flight passes state's filters. */
export function matchesFlight(
  tz: string,
  flight: { start_time: number; tracker_id: number | null; pilot_id?: number | null; aircraft_tail?: string | null },
  state: FilterState,
): boolean {
  if (state.dateFrom) {
    if (flight.start_time < tzDayStartUnix(tz, ...dayParts(state.dateFrom))) return false;
  }
  if (state.dateTo) {
    if (flight.start_time > tzDayEndUnix(tz, ...dayParts(state.dateTo))) return false;
  }
  // Manual flights (no tracker) show unless a tracker filter is set; '__manual__' in
  // trackerIds ("Manual entries") selects them.
  if (state.trackerIds.length > 0) {
    const tid = flight.tracker_id == null ? '__manual__' : flight.tracker_id;
    if (!state.trackerIds.includes(tid)) return false;
  }
  if (state.pilotIds.length > 0) {
    const pid = flight.pilot_id === null ? '__null__' : flight.pilot_id;
    if (!state.pilotIds.includes(pid as number | '__null__')) return false;
  }
  if (state.aircraftTails.length > 0) {
    const tail = flight.aircraft_tail === null ? '__null__' : flight.aircraft_tail;
    if (!state.aircraftTails.includes(tail as string)) return false;
  }
  return true;
}
