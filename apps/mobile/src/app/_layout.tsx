import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AccountsProvider, useAccounts } from '@/lib/accounts-context';
import { BootstrapProvider, useBootstrap } from '@/lib/bootstrap-context';
import { FlightsProvider } from '@/lib/flights-context';
import { initSentry, setInstanceTags, withSentry } from '@/lib/sentry';
import { applyStoredTheme } from '@/lib/theme';
import { ClientUpdateGate, useBackgroundUpdates } from '@/lib/updates';

initSentry();
applyStoredTheme();

/** Keeps Sentry's instance tags on the active account's. */
function SentryTags() {
  const { active } = useAccounts();
  const { bootstrap } = useBootstrap();
  const host = active?.host ?? null;
  const apiVersion = bootstrap?.api_version ?? null;
  useEffect(() => setInstanceTags(host, apiVersion), [host, apiVersion]);
  return null;
}

function RootLayout() {
  useBackgroundUpdates();
  return (
    <AccountsProvider>
      <BootstrapProvider>
        <SentryTags />
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

export default withSentry(RootLayout);
