import { Stack, useRouter } from 'expo-router';
import { DatePicker, Form, Host, Section } from '@expo/ui/swift-ui';
import { emptyFilterState } from '@wingbeat/core/filters';
import { ChoicePicker, ToggleSection } from '@/lib/choice-list';
import { useFlightFilter } from '@/lib/flight-filter-context';
import { dateOfDayKey, dayKeyOfDate } from '@/lib/duty';
import { customDateRange, DATE_PRESETS, filterChoices, toggled, type DatePresetId } from '@/lib/flights';
import { Placeholder } from '@/lib/placeholder';
import { useFlightsTab } from '@/lib/use-flights-tab';

const DATE_CHOICES = DATE_PRESETS.map((p) => ({ value: p.id, label: p.label }));

/** The filter sheet: a date preset (Custom: From and To), and any of the aircraft, pilots and trackers (none: all). */
export default function FlightFiltersScreen() {
  const router = useRouter();
  const tab = useFlightsTab();
  const { filter, setFilter, preset, setPreset } = useFlightFilter();
  if (!tab.ready) return <Placeholder />;
  const { bootstrap, tz } = tab;
  // Custom starts from the range the preset showed.
  const pickPreset = (p: DatePresetId) => {
    if (p === 'custom' && preset !== 'custom') setFilter({ ...filter, ...customDateRange(tz, Date.now() / 1000, preset) });
    setPreset(p);
  };
  const choices = filterChoices(tab.flights, {
    trackers: bootstrap.trackers.filter((tr) => tr.active && !tr.deleted),
    pilots: bootstrap.pilots,
    aircraft: bootstrap.aircraft,
  });
  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => { setFilter(emptyFilterState()); setPreset('all'); }}>Clear</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={() => router.back()}>Done</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }}>
        <Form>
          <Section>
            <ChoicePicker label="Date" choices={DATE_CHOICES} value={preset} onChange={pickPreset} />
            {preset === 'custom' && filter.dateFrom && filter.dateTo && (
              <>
                <DatePicker title="From" selection={dateOfDayKey(filter.dateFrom)} range={{ end: dateOfDayKey(filter.dateTo) }}
                  displayedComponents={['date']} onDateChange={(d) => setFilter({ ...filter, dateFrom: dayKeyOfDate(d) })} />
                <DatePicker title="To" selection={dateOfDayKey(filter.dateTo)} range={{ start: dateOfDayKey(filter.dateFrom) }}
                  displayedComponents={['date']} onDateChange={(d) => setFilter({ ...filter, dateTo: dayKeyOfDate(d) })} />
              </>
            )}
          </Section>
          {choices.aircraft.length > 1 && (
            <ToggleSection title="Aircraft" choices={choices.aircraft} isOn={(v) => filter.aircraftTails.includes(v)}
              onToggle={(v) => setFilter({ ...filter, aircraftTails: toggled(filter.aircraftTails, v) })} />
          )}
          {choices.pilots.length > 1 && (
            <ToggleSection title="Pilots" choices={choices.pilots} isOn={(v) => filter.pilotIds.includes(v)}
              onToggle={(v) => setFilter({ ...filter, pilotIds: toggled(filter.pilotIds, v) })} />
          )}
          {choices.trackers.length > 1 && (
            <ToggleSection title="Trackers" choices={choices.trackers} isOn={(v) => filter.trackerIds.includes(v)}
              onToggle={(v) => setFilter({ ...filter, trackerIds: toggled(filter.trackerIds, v) })} />
          )}
        </Form>
      </Host>
    </>
  );
}
