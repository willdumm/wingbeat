import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Settings', headerLargeTitle: true }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      {/* The duty log, as in the Duty tab's stack (duty/_layout.tsx), for when that tab is hidden. */}
      <Stack.Screen name="duty/index" options={{ title: 'Duty' }} />
      <Stack.Screen name="duty/[id]" options={{ title: 'Flight' }} />
      <Stack.Screen name="duty/assign" options={{ presentation: 'modal', title: 'Assignment' }} />
      <Stack.Screen name="duty/export" options={{ presentation: 'modal', title: 'Export PDF' }} />
      <Stack.Screen name="duty/day" options={{ presentation: 'modal', title: 'Duty or Rest' }} />
    </Stack>
  );
}
