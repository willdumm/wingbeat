import { useSegments } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';

// The flight detail (and its Edit modal) hides the tab bar: its sheet covers the bottom of the
// screen, and at its smallest the tab bar would show around it.
const NO_TAB_BAR = ['[id]', 'assign'];

export default function TabsLayout() {
  const segments = useSegments();
  const hidden = segments[1] === 'flights' && NO_TAB_BAR.includes(segments.at(-1) ?? '');
  return (
    <NativeTabs hidden={hidden}>
      <NativeTabs.Trigger name="live">
        <NativeTabs.Trigger.Label>Live</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="map.fill" md="map" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="flights">
        <NativeTabs.Trigger.Label>Flights</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="airplane" md="flight" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
