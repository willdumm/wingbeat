import { Stack } from 'expo-router';

export default function FlightsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Flights', headerLargeTitle: true }} />
    </Stack>
  );
}
