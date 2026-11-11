import { Stack } from 'expo-router';
import { FlightFilterProvider } from '@/lib/flight-filter-context';

export default function FlightsLayout() {
  return (
    <FlightFilterProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Flights', headerLargeTitle: true }} />
        <Stack.Screen name="[id]" options={{ title: 'Flight' }} />
        <Stack.Screen name="filters" options={{ presentation: 'modal', title: 'Filter flights' }} />
        <Stack.Screen name="assign" options={{ presentation: 'modal', title: 'Assignment' }} />
      </Stack>
    </FlightFilterProvider>
  );
}
