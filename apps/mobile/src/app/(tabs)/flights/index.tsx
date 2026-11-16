import { useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { emptyFilterState, matchesFlight } from '@wingbeat/core/filters';
import { relativeTime } from '@wingbeat/core/time';
import { useAppliedFilter, useFlightFilter } from '@/lib/flight-filter-context';
import { EmptyState } from '@/lib/empty-state';
import { FlightList } from '@/lib/flight-list';
import { useFlights } from '@/lib/flights-context';
import { flightDays, isFiltered } from '@/lib/flights';
import { Placeholder } from '@/lib/placeholder';
import { useAlerts } from '@/lib/use-alerts';
import { useFlightsTab } from '@/lib/use-flights-tab';
import { useNow } from '@/lib/use-now';

export default function FlightsScreen() {
  const router = useRouter();
  const tab = useFlightsTab();
  const { refresh, lastRefresh } = useFlights();
  const { setFilter, setPreset } = useFlightFilter();
  const now = useNow(60_000);
  const alerts = useAlerts();
  const tz = tab.ready ? tab.tz : null;
  const applied = useAppliedFilter(tz, now);
  const flights = tab.ready ? tab.flights : null;
  const roster = tab.ready ? tab.roster : null;
  const days = useMemo(
    () => (tz && flights && roster ? flightDays(tz, flights.filter((f) => matchesFlight(tz, f, applied)), roster) : []),
    [flights, roster?.hasAircraft, roster?.hasPilots, tz, applied],
  );

  if (!tab.ready) return <Placeholder />;
  const filtered = isFiltered(applied);
  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={alerts?.length ? 'bell.badge' : 'bell'}
          accessibilityLabel={alerts?.length ? alerts.length + (alerts.length === 1 ? ' alert' : ' alerts') : 'Alerts'}
          onPress={() => router.push('/flights/alerts')} />
        <Stack.Toolbar.Button icon={filtered ? 'line.3.horizontal.decrease.circle.fill' : 'line.3.horizontal.decrease.circle'}
          accessibilityLabel={filtered ? 'Filter (on)' : 'Filter'} onPress={() => router.push('/flights/filters')} />
      </Stack.Toolbar>
      <FlightList
        days={days}
        // The dashboard's "updated" time: when the server last polled the trackers.
        notice={lastRefresh?.lastPolled ? 'Updated ' + relativeTime(now, lastRefresh.lastPolled) : null}
        onSelect={(id) => router.push({ pathname: '/flights/[id]', params: { id: String(id) } })}
        onMapDay={(day) => router.push({ pathname: '/flights/day', params: { day } })}
        onRefresh={refresh}
        empty={filtered ? (
          <EmptyState title="No matching flights" systemImage="line.3.horizontal.decrease.circle" description="No flights match the filter."
            action={{ label: 'Clear Filter', onPress: () => { setFilter(emptyFilterState()); setPreset('all'); } }} />
        ) : <EmptyState title="No flights yet" systemImage="airplane" description="Flights appear here once a tracker records one." />}
      />
    </>
  );
}
