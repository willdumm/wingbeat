import { Stack } from 'expo-router';
import { AccountsProvider } from '@/lib/accounts-context';
import { BootstrapProvider } from '@/lib/bootstrap-context';
import { ClientUpdateGate, useBackgroundUpdates } from '@/lib/updates';

export default function RootLayout() {
  useBackgroundUpdates();
  return (
    <AccountsProvider>
      <BootstrapProvider>
        <ClientUpdateGate>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="add-account" options={{ presentation: 'modal', headerShown: true, title: 'Add account' }} />
            <Stack.Screen name="pair" options={{ presentation: 'modal', headerShown: true, title: 'Add account' }} />
          </Stack>
        </ClientUpdateGate>
      </BootstrapProvider>
    </AccountsProvider>
  );
}
