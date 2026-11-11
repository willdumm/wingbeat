/**
 * The Flights tab's filter, shared by the list and the filter sheet: core's FilterState and
 * the date preset that sets its dates (presetDateRange(), recomputed as the day changes).
 * Each account keeps its own, between launches too (prefs.ts).
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { FilterState } from '@wingbeat/core/filters';
import { useAccounts } from './accounts-context';
import type { DatePresetId } from './flights';
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
