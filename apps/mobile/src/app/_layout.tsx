import { Stack } from 'expo-router';
import { AccountsProvider } from '@/lib/accounts-context';
import { BootstrapProvider } from '@/lib/bootstrap-context';
import { FlightsProvider } from '@/lib/flights-context';
import { applyStoredTheme } from '@/lib/theme';
import { ClientUpdateGate, useBackgroundUpdates } from '@/lib/updates';

applyStoredTheme();

export default function RootLayout() {
  useBackgroundUpdates();
  return (
    <AccountsProvider>
      <BootstrapProvider>
        <FlightsProvider>
          <ClientUpdateGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="add-account" options={{ presentation: 'modal', headerShown: true, title: 'Add account' }} />
              <Stack.Screen name="pair" options={{ presentation: 'modal', headerShown: true, title: 'Add account' }} />
            </Stack>
          </ClientUpdateGate>
        </FlightsProvider>
      </BootstrapProvider>
    </AccountsProvider>
  );
}
