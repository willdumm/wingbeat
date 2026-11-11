/**
 * What the Flights tab's screens read: the active trackers' effective flights from the
 * flight store (getAll(), as the dashboard lists them: removed flights left out), the
 * operator's timezone and the bootstrap's roster. ready is false until there's a signed-in
 * account whose server answered the handshake with its settings.
 */
import { useMemo } from 'react';
import type { BootstrapResponse } from '@wingbeat/core/api/bootstrap';
import { useAccounts } from './accounts-context';
import { useBootstrap } from './bootstrap-context';
import { useFlights } from './flights-context';
import type { Flight, Roster } from './flights';

type Ready = {
  ready: true;
  tz: string;
  bootstrap: BootstrapResponse;
  flights: Flight[];
  roster: Roster;
  isAdmin: boolean;
};

export function useFlightsTab(): Ready | { ready: false } {
  const { loaded, active } = useAccounts();
  const { bootstrap, handshake } = useBootstrap();
  const { store, generation } = useFlights();
  const trackerIds = useMemo(
    () => bootstrap?.trackers.filter((t) => t.active && !t.deleted).map((t) => t.id) ?? [],
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
    roster: { hasAircraft: bootstrap.aircraft.length > 0, hasPilots: bootstrap.pilots.length > 0 },
    isAdmin: bootstrap.me.role === 'admin',
  };
}
