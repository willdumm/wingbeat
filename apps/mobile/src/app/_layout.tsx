import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AccountsProvider, useAccounts } from '@/lib/accounts-context';
import { BootstrapProvider, useBootstrap } from '@/lib/bootstrap-context';
import { FlightsProvider } from '@/lib/flights-context';
import { initPush, usePush } from '@/lib/push';
import { initSentry, setInstanceTags, withSentry } from '@/lib/sentry';
import { applyStoredTheme } from '@/lib/theme';
import { ClientUpdateGate, useBackgroundUpdates } from '@/lib/updates';

initSentry();
applyStoredTheme();
initPush();

/** Keeps Sentry's instance tags on the active account's. */
function SentryTags() {
  const { active } = useAccounts();
  const { bootstrap } = useBootstrap();
  const host = active?.host ?? null;
  const apiVersion = bootstrap?.api_version ?? null;
  useEffect(() => setInstanceTags(host, apiVersion), [host, apiVersion]);
  return null;
}

/** Keeps the active account's stored user (its pilot, for the first tab) on the server's. */
function AccountUserSync() {
  const { active, syncUser } = useAccounts();
  const { bootstrap } = useBootstrap();
  const me = bootstrap?.me;
  useEffect(() => { if (active && me) syncUser(active.id, me); }, [active?.id, me]);
  return null;
}

/** Registers this phone for push and follows notification taps. */
function Push() {
  usePush();
  return null;
}

function RootLayout() {
  useBackgroundUpdates();
  return (
    <AccountsProvider>
      <BootstrapProvider>
        <SentryTags />
        <AccountUserSync />
        <Push />
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
