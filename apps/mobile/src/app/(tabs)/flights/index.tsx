import { useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { emptyFilterState, matchesFlight } from '@wingbeat/core/filters';
import { unixToTzDateStr } from '@wingbeat/core/time';
import { useFlightFilter } from '@/lib/flight-filter-context';
import { EmptyState } from '@/lib/empty-state';
import { FlightList } from '@/lib/flight-list';
import { useFlights } from '@/lib/flights-context';
import { flightDays, isFiltered, presetDateRange } from '@/lib/flights';
import { Placeholder } from '@/lib/placeholder';
import { useFlightsTab } from '@/lib/use-flights-tab';
import { useNow } from '@/lib/use-now';

export default function FlightsScreen() {
  const router = useRouter();
  const tab = useFlightsTab();
  const { refresh } = useFlights();
  const { filter, setFilter, preset, setPreset } = useFlightFilter();
  const now = useNow(60_000);
  const tz = tab.ready ? tab.tz : null;
  // The preset's days move when the operator's day does.
  const today = tz ? unixToTzDateStr(tz, now) : null;
  const applied = useMemo(() => (tz ? { ...filter, ...presetDateRange(tz, now, preset) } : filter), [filter, preset, tz, today]);
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
        <Stack.Toolbar.Button icon={filtered ? 'line.3.horizontal.decrease.circle.fill' : 'line.3.horizontal.decrease.circle'}
          accessibilityLabel={filtered ? 'Filter (on)' : 'Filter'} onPress={() => router.push('/flights/filters')} />
      </Stack.Toolbar>
      <FlightList
        days={days}
        onSelect={(id) => router.push({ pathname: '/flights/[id]', params: { id: String(id) } })}
        onRefresh={refresh}
        empty={filtered ? (
          <EmptyState title="No matching flights" systemImage="line.3.horizontal.decrease.circle" description="No flights match the filter."
            action={{ label: 'Clear Filter', onPress: () => { setFilter(emptyFilterState()); setPreset('all'); } }} />
        ) : <EmptyState title="No flights yet" systemImage="airplane" description="Flights appear here once a tracker records one." />}
      />
    </>
  );
}
