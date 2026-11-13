import { useSegments } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { FlightFilterProvider } from '@/lib/flight-filter-context';

// The flight and day maps (and the Edit modal) hide the tab bar: their sheet covers the bottom
// of the screen, and at its smallest the tab bar would show around it. A flight opens from
// the duty log too.
const NO_TAB_BAR = ['[id]', 'day', 'assign'];

// The filter is above the tabs since the flight map reads it from the Duty tab too.
export default function TabsLayout() {
  const segments = useSegments();
  const hidden = (segments[1] === 'flights' || segments[1] === 'duty') && NO_TAB_BAR.includes(segments.at(-1) ?? '');
  return (
    <FlightFilterProvider>
      <NativeTabs hidden={hidden}>
        <NativeTabs.Trigger name="live">
          <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="map.fill" md="map" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="flights">
          <NativeTabs.Trigger.Label>Flights</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="airplane" md="flight" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="duty">
          <NativeTabs.Trigger.Label>Duty</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="calendar.badge.clock" md="event_note" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </FlightFilterProvider>
  );
}
