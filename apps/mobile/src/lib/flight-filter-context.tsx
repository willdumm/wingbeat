/**
 * The Flights tab's filter, shared by the list and the filter sheet: core's FilterState and
 * the date preset that set its dates (presetDateRange(), recomputed as the day changes).
 * It lasts while the app runs and resets on an account switch; it isn't kept yet.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { emptyFilterState, type FilterState } from '@wingbeat/core/filters';
import { useAccounts } from './accounts-context';
import type { DatePresetId } from './flights';

interface FlightFilterValue {
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  preset: DatePresetId;
  setPreset: (p: DatePresetId) => void;
}

const FlightFilterContext = createContext<FlightFilterValue | null>(null);

export function FlightFilterProvider({ children }: { children: ReactNode }) {
  const { active } = useAccounts();
  const [filter, setFilter] = useState(emptyFilterState);
  const [preset, setPreset] = useState<DatePresetId>('all');
  const accountKey = active ? `${active.host}.${active.user.id}` : null;
  useEffect(() => { setFilter(emptyFilterState()); setPreset('all'); }, [accountKey]);
  return (
    <FlightFilterContext.Provider value={{ filter, setFilter, preset, setPreset }}>
      {children}
    </FlightFilterContext.Provider>
  );
}

export function useFlightFilter(): FlightFilterValue {
  const v = useContext(FlightFilterContext);
  if (!v) throw new Error('useFlightFilter outside FlightFilterProvider');
  return v;
}
