/**
 * OTA updates (docs/mobile-app-plan.md, "Versions and compatibility: OTA first"): the
 * background download on return to the foreground, and the screen that replaces the app
 * while a client too old for its server updates itself, or, when no update can fix it,
 * sends the user to the store.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Button, Linking, Platform, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useBootstrap } from './bootstrap-context';
import { fetchUpdateInBackground, updateForServer } from './handshake';
import { useTokens } from './theme';

/** The app's store page; iOS has none until the App Store record exists (phase 5, step 12). */
const STORE_URL = Platform.select({
  android: 'https://play.google.com/store/apps/details?id=dev.dummthings.wingbeat',
  default: null,
});

/** Downloads a newer update whenever the app returns to the foreground; it applies on the
 * next cold start. expo-updates checks on launch by itself. */
export function useBackgroundUpdates() {
  useEffect(() => {
    let running = false;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || running) return;
      running = true;
      fetchUpdateInBackground(Updates).finally(() => { running = false; });
    });
    return () => sub.remove();
  }, []);
}

/** The app, unless the active account's server needs a newer client than this bundle. */
export function ClientUpdateGate({ children }: { children: ReactNode }) {
  const { handshake } = useBootstrap();
  return handshake === 'client-too-old' ? <ClientUpdateScreen /> : children;
}

function ClientUpdateScreen() {
  const t = useTokens();
  const [outcome, setOutcome] = useState<'updating' | 'store'>('updating');

  useEffect(() => {
    let current = true;
    updateForServer(Updates).then((o) => { if (current && o === 'store') setOutcome('store'); });
    return () => { current = false; };
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: t['bg-base'] }}>
      {outcome === 'updating' ? (
        <>
          <ActivityIndicator color={t['accent']} />
          <Text style={{ color: t['text-primary'] }}>Updating…</Text>
        </>
      ) : (
        <>
          <Text style={{ color: t['text-primary'], fontSize: 17, textAlign: 'center' }}>Update the app</Text>
          <Text style={{ color: t['text-muted'], textAlign: 'center' }}>
            This server needs a newer version of Wingbeat. Update it from the {Platform.OS === 'ios' ? 'App Store' : 'Play Store'}.
          </Text>
          {STORE_URL && <Button title="Open the store" color={t['accent']} onPress={() => Linking.openURL(STORE_URL)} />}
        </>
      )}
    </View>
  );
}
