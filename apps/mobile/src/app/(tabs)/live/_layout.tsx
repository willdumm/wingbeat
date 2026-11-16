import { Stack } from 'expo-router';

export default function LiveLayout() {
  return (
    <Stack>
      {/* No header: the map runs to the top, its tools below the status bar. */}
      <Stack.Screen name="index" options={{ title: 'Live', headerShown: false }} />
    </Stack>
  );
}
