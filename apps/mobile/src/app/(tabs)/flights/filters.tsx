import { ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { emptyFilterState } from '@wingbeat/core/filters';
import { ChoiceSection } from '@/lib/choice-list';
import { useFlightFilter } from '@/lib/flight-filter-context';
import { DATE_PRESETS, filterChoices, toggled } from '@/lib/flights';
import { HeaderButton } from '@/lib/header-button';
import { Placeholder } from '@/lib/placeholder';
import { px, useTokens } from '@/lib/theme';
import { useFlightsTab } from '@/lib/use-flights-tab';

/** The filter sheet: a date preset, and any of the aircraft, pilots and trackers (none: all). */
export default function FlightFiltersScreen() {
  const t = useTokens();
  const router = useRouter();
  const tab = useFlightsTab();
  const { filter, setFilter, preset, setPreset } = useFlightFilter();
  if (!tab.ready) return <Placeholder text="Loading…" />;
  const { bootstrap } = tab;
  const choices = filterChoices(tab.flights, {
    trackers: bootstrap.trackers.filter((tr) => tr.active && !tr.deleted),
    pilots: bootstrap.pilots,
    aircraft: bootstrap.aircraft,
  });
  return (
    <>
      <Stack.Screen options={{
        headerLeft: () => <HeaderButton title="Clear" onPress={() => { setFilter(emptyFilterState()); setPreset('all'); }} />,
        headerRight: () => <HeaderButton title="Done" bold onPress={() => router.back()} />,
      }} />
      <ScrollView
        style={{ backgroundColor: t['bg-base'] }}
        contentContainerStyle={{ gap: px(t['space-6']), paddingVertical: px(t['space-4']) }}
      >
        <ChoiceSection title="Date" choices={DATE_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          isSelected={(v) => v === preset} onPress={setPreset} />
        {choices.aircraft.length > 1 && (
          <ChoiceSection title="Aircraft" choices={choices.aircraft} isSelected={(v) => filter.aircraftTails.includes(v)}
            onPress={(v) => setFilter({ ...filter, aircraftTails: toggled(filter.aircraftTails, v) })} />
        )}
        {choices.pilots.length > 1 && (
          <ChoiceSection title="Pilots" choices={choices.pilots} isSelected={(v) => filter.pilotIds.includes(v)}
            onPress={(v) => setFilter({ ...filter, pilotIds: toggled(filter.pilotIds, v) })} />
        )}
        {choices.trackers.length > 1 && (
          <ChoiceSection title="Trackers" choices={choices.trackers} isSelected={(v) => filter.trackerIds.includes(v)}
            onPress={(v) => setFilter({ ...filter, trackerIds: toggled(filter.trackerIds, v) })} />
        )}
      </ScrollView>
    </>
  );
}
