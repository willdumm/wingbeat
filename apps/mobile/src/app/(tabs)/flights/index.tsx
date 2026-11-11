import { useMemo } from 'react';
import { Button, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { emptyFilterState, matchesFlight } from '@wingbeat/core/filters';
import { unixToTzDateStr } from '@wingbeat/core/time';
import { useFlightFilter } from '@/lib/flight-filter-context';
import { FlightList } from '@/lib/flight-list';
import { flightDays, isFiltered, presetDateRange } from '@/lib/flights';
import { HeaderButton } from '@/lib/header-button';
import { Placeholder } from '@/lib/placeholder';
import { useTokens } from '@/lib/theme';
import { useFlightsTab } from '@/lib/use-flights-tab';
import { useNow } from '@/lib/use-now';

export default function FlightsScreen() {
  const t = useTokens();
  const router = useRouter();
  const tab = useFlightsTab();
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

  if (!tab.ready) return <Placeholder text="Loading…" />;
  const filtered = isFiltered(applied);
  return (
    <>
      <Stack.Screen options={{
        headerRight: () => <HeaderButton title={filtered ? 'Filter •' : 'Filter'} onPress={() => router.push('/flights/filters')} />,
      }} />
      <FlightList
        days={days}
        onSelect={(id) => router.push({ pathname: '/flights/[id]', params: { id: String(id) } })}
        empty={filtered ? (
          <>
            <Text style={{ color: t['text-muted'] }}>No flights match the filter.</Text>
            <Button title="Clear filter" color={t['accent']} onPress={() => { setFilter(emptyFilterState()); setPreset('all'); }} />
          </>
        ) : <Text style={{ color: t['text-muted'] }}>No flights recorded yet.</Text>}
      />
    </>
  );
}
