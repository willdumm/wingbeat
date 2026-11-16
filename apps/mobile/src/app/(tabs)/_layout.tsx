import { useSegments } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { DutyTabContext, useDutyTabState } from '@/lib/duty-tab';
import { FlightFilterProvider } from '@/lib/flight-filter-context';
import { AlertsContext, useComputedAlerts } from '@/lib/use-alerts';

// The flight and day maps (and the Edit modal) hide the tab bar: their sheet covers the bottom
// of the screen, and at its smallest the tab bar would show around it. A flight opens from
// the duty log too, in the Duty tab or in Settings.
const NO_TAB_BAR = ['[id]', 'day', 'assign', 'flight'];

// The filter is above the tabs since the flight map reads it from the Duty tab too. The Flights
// tab's badge counts the alerts (its header's bell opens them). The Duty tab shows as picked in
// Settings, which has the duty log too (duty-tab.ts).
export default function TabsLayout() {
  const segments = useSegments();
  const alerts = useComputedAlerts();
  const dutyTab = useDutyTabState();
  const inLog = segments[1] === 'flights' || segments[1] === 'duty' || (segments[1] === 'settings' && segments[2] === 'duty');
  const hidden = inLog && NO_TAB_BAR.includes(segments.at(-1) ?? '');
  return (
    <FlightFilterProvider>
      <AlertsContext.Provider value={alerts}>
        <DutyTabContext.Provider value={dutyTab}>
        <NativeTabs hidden={hidden}>
          <NativeTabs.Trigger name="live">
            <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf="map.fill" md="map" />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="flights">
            <NativeTabs.Trigger.Label>Flights</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf="airplane" md="flight" />
            {/* A value always shows, even "0" and with hidden: none when there are no alerts. */}
            <NativeTabs.Trigger.Badge hidden={!alerts?.length}>{alerts?.length ? String(alerts.length) : undefined}</NativeTabs.Trigger.Badge>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="duty" hidden={!dutyTab.shown}>
            <NativeTabs.Trigger.Label>Duty</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf="calendar.badge.clock" md="event_note" />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="settings">
            <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
          </NativeTabs.Trigger>
        </NativeTabs>
        </DutyTabContext.Provider>
      </AlertsContext.Provider>
    </FlightFilterProvider>
  );
}
