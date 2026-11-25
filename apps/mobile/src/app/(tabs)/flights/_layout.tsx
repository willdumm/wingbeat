import { Stack } from 'expo-router';
import { instanceHeaderOptions } from '@/lib/instance-header';

// A flight opened from its URL has the list under it to go back to.
export const unstable_settings = { anchor: 'index' };

export default function FlightsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Flights', headerLargeTitle: true, ...instanceHeaderOptions }} />
      <Stack.Screen name="[id]" options={{ title: 'Flight' }} />
      <Stack.Screen name="link" options={{ title: 'Flight' }} />
      <Stack.Screen name="day" options={{ title: 'Day' }} />
      <Stack.Screen name="filters" options={{ presentation: 'modal', title: 'Filter flights' }} />
      <Stack.Screen name="assign" options={{ presentation: 'modal', title: 'Assignment' }} />
      <Stack.Screen name="flight" options={{ presentation: 'modal', title: 'Edit Flight' }} />
      <Stack.Screen name="alerts" options={{ presentation: 'modal', title: 'Alerts' }} />
    </Stack>
  );
}
