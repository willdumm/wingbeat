/**
 * The Flights tab's filter, shared by the list and the filter sheet: core's FilterState and
 * the date preset that sets its dates (presetDateRange(), recomputed as the day changes).
 * Each account keeps its own, between launches too (prefs.ts).
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { FilterState } from '@wingbeat/core/filters';
import { unixToTzDateStr } from '@wingbeat/core/time';
import { useAccounts } from './accounts-context';
import { presetDateRange, type DatePresetId } from './flights';
import { accountPrefKey, parseFlightFilter } from './prefs';
import { useStoredState } from './stored-state';

interface FlightFilterValue {
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  preset: DatePresetId;
  setPreset: (p: DatePresetId) => void;
}

const FlightFilterContext = createContext<FlightFilterValue | null>(null);

export function FlightFilterProvider({ children }: { children: ReactNode }) {
  const { active } = useAccounts();
  const key = active ? accountPrefKey(active.host, active.user.id, 'flight-filter') : null;
  const [pref, setPref] = useStoredState(key, parseFlightFilter);
  const value = useMemo<FlightFilterValue>(() => ({
    ...pref,
    setFilter: (filter) => setPref((p) => ({ ...p, filter })),
    setPreset: (preset) => setPref((p) => ({ ...p, preset })),
  }), [pref, setPref]);
  return <FlightFilterContext.Provider value={value}>{children}</FlightFilterContext.Provider>;
}

export function useFlightFilter(): FlightFilterValue {
  const v = useContext(FlightFilterContext);
  if (!v) throw new Error('useFlightFilter outside FlightFilterProvider');
  return v;
}

/**
 * The filter with its preset's dates as of now (Unix seconds) in tz, the operator's timezone;
 * recomputed when the operator's day changes, so "Today" moves at midnight.
 */
export function useAppliedFilter(tz: string | null, now: number): FilterState {
  const { filter, preset } = useFlightFilter();
  const today = tz ? unixToTzDateStr(tz, now) : null;
  return useMemo(() => (tz ? { ...filter, ...presetDateRange(tz, now, preset) } : filter), [filter, preset, tz, today]);
}
