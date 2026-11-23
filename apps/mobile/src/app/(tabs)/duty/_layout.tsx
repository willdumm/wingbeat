import { Stack } from 'expo-router';
import { instanceHeaderOptions } from '@/lib/instance-header';

export default function DutyLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Duty', headerLargeTitle: true, ...instanceHeaderOptions }} />
      <Stack.Screen name="[id]" options={{ title: 'Flight' }} />
      <Stack.Screen name="assign" options={{ presentation: 'modal', title: 'Assignment' }} />
      <Stack.Screen name="export" options={{ presentation: 'modal', title: 'Export PDF' }} />
      <Stack.Screen name="day" options={{ presentation: 'modal', title: 'Duty or Rest' }} />
      <Stack.Screen name="flight" options={{ presentation: 'modal', title: 'Add Flight' }} />
    </Stack>
  );
}
