import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Settings', headerLargeTitle: true }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
    </Stack>
  );
}
