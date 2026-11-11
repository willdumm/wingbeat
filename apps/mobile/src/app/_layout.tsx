import { Stack } from 'expo-router';
import { AccountsProvider } from '@/lib/accounts-context';

export default function RootLayout() {
  return (
    <AccountsProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-account" options={{ presentation: 'modal', headerShown: true, title: 'Add account' }} />
        <Stack.Screen name="pair" options={{ presentation: 'modal', headerShown: true, title: 'Add account' }} />
      </Stack>
    </AccountsProvider>
  );
}
