import { Stack } from 'expo-router';

export default function FlightsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Flights', headerLargeTitle: true }} />
      <Stack.Screen name="[id]" options={{ title: 'Flight' }} />
      <Stack.Screen name="day" options={{ title: 'Day' }} />
      <Stack.Screen name="filters" options={{ presentation: 'modal', title: 'Filter flights' }} />
      <Stack.Screen name="assign" options={{ presentation: 'modal', title: 'Assignment' }} />
    </Stack>
  );
}
