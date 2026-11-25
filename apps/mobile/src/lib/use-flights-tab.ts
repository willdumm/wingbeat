/**
 * What the Flights tab's screens read: the active trackers' effective flights from the
 * flight store (getAll(), as the dashboard lists them: removed flights left out), the
 * operator's timezone and the bootstrap's roster; findFlight also finds an inactive
 * tracker's flight (a duty log's can be one). ready is false until there's a signed-in
 * account whose server answered the handshake with its settings.
 */
import { useMemo } from 'react';
import type { BootstrapResponse } from '@wingbeat/core/api/bootstrap';
import { activeTrackers } from '@wingbeat/core/live';
import { useAccounts } from './accounts-context';
import { useBootstrap } from './bootstrap-context';
import { useFlights } from './flights-context';
import type { Flight, Roster } from './flights';

type Ready = {
  ready: true;
  tz: string;
  bootstrap: BootstrapResponse;
  flights: Flight[];
  /** The flight with this id: among flights, else among every tracker's; null if removed. */
  findFlight: (id: number) => Flight | null;
  /** Every tracker's flights, inactive ones' too. */
  allFlights: () => Flight[];
  roster: Roster;
  isAdmin: boolean;
};

export function useFlightsTab(): Ready | { ready: false } {
  const { loaded, active } = useAccounts();
  const { bootstrap, handshake } = useBootstrap();
  const { store, generation } = useFlights();
  const trackerIds = useMemo(
    () => activeTrackers(bootstrap?.trackers ?? []).map((t) => t.id),
    [bootstrap],
  );
  const flights = useMemo(
    () => (store ? store.getAll(trackerIds) as Flight[] : []),
    [store, trackerIds.join(','), generation],
  );
  if (!loaded || !active || active.signedOut || handshake === 'server-too-old' || !bootstrap?.instance || !store) {
    return { ready: false };
  }
  return {
    ready: true,
    tz: bootstrap.instance.timezone,
    bootstrap,
    flights,
    findFlight: (id) => flights.find((f) => f.id === id) ?? (store.getAll() as Flight[]).find((f) => f.id === id) ?? null,
    allFlights: () => store.getAll() as Flight[],
    roster: { hasAircraft: bootstrap.aircraft.length > 0, hasPilots: bootstrap.pilots.length > 0 },
    isAdmin: bootstrap.me.role === 'admin',
  };
}
