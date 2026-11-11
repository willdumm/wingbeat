import { Stack } from 'expo-router';

export default function LiveLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Live', headerLargeTitle: true }} />
    </Stack>
  );
}
