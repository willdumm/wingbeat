import { Stack } from 'expo-router';

export default function DutyLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Duty', headerLargeTitle: true }} />
      <Stack.Screen name="[id]" options={{ title: 'Flight' }} />
      <Stack.Screen name="assign" options={{ presentation: 'modal', title: 'Assignment' }} />
      <Stack.Screen name="day" options={{ presentation: 'modal', title: 'Duty or Rest' }} />
    </Stack>
  );
}
