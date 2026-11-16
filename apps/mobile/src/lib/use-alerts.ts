/**
 * The alerts as the dashboard's strip lists them (core's computeAlerts: unassigned flights,
 * maintenance due, readings not recorded, pilots near a duty limit), from every tracker's
 * effective flights and the bootstrap's aircraft, pilots and trackers, recomputed when the
 * store changes and each minute. null until the Flights tab is ready. Computed once, by the
 * tabs' layout (useComputedAlerts), which provides them (AlertsContext) to the screens'
 * useAlerts.
 */
import { createContext, useContext, useMemo } from 'react';
import { computeAlerts, type Alert } from '@wingbeat/core/alerts';
import { useFlights } from './flights-context';
import { useFlightsTab } from './use-flights-tab';
import { useNow } from './use-now';

export const AlertsContext = createContext<Alert[] | null>(null);

export const useAlerts = () => useContext(AlertsContext);

export function useComputedAlerts(): Alert[] | null {
  const tab = useFlightsTab();
  const { store, generation } = useFlights();
  const now = useNow(60_000);
  const tz = tab.ready ? tab.tz : null;
  const bootstrap = tab.ready ? tab.bootstrap : null;
  return useMemo(() => (tz && bootstrap && store
    ? computeAlerts(tz, now, { flights: store.getAll(), aircraft: bootstrap.aircraft, pilots: bootstrap.pilots, trackers: bootstrap.trackers })
    : null), [tz, bootstrap, store, generation, now]);
}
