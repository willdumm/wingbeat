/**
 * App push (docs/mobile-app-plan.md, "Step 2: app push for hosted instances" and "Native
 * details"): permission asked at the first subscription, not at launch; this phone's Expo push
 * token registered with each account's session; banners while the app is open; and a tap
 * routed to what the push is about (push-route.ts), switching to its account first.
 */
import { useEffect, useRef } from 'react';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import type { ApiClient } from '@wingbeat/core/api/client';
import { registerPushDevice, type TrackerPushEvent } from '@wingbeat/core/api/push';
import { useAccounts } from './accounts-context';
import { parseTimeSensitive, TIME_SENSITIVE_KEY } from './prefs';
import { pushRoute } from './push-route';
import { readStored } from './stored-state';

/** Shows a push that arrives while the app is open as it would otherwise. */
export function initPush() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Whether pushes can be shown, asking the first time (iOS asks only once). */
export async function askPushPermission(): Promise<'granted' | 'denied'> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';
  return (await Notifications.requestPermissionsAsync()).granted ? 'granted' : 'denied';
}

/**
 * Registers this phone's Expo push token, and its Time Sensitive events (by default the stored
 * ones), with the account's session.
 */
export async function registerThisDevice(
  client: ApiClient,
  timeSensitive: TrackerPushEvent[] = readStored(TIME_SENSITIVE_KEY, parseTimeSensitive),
): Promise<void> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushDevice(client, { kind: 'expo', token, time_sensitive: timeSensitive });
}

/**
 * Keeps the active account's session registered (the token can change, and an account added
 * after permission was given has no device yet), once permission is there; and follows
 * notification taps.
 */
export function usePush() {
  const router = useRouter();
  const { loaded, accounts, active, client, setActive } = useAccounts();

  useEffect(() => {
    if (!client) return;
    Notifications.getPermissionsAsync()
      .then((p) => (p.granted ? registerThisDevice(client) : undefined))
      .catch(() => {});  // tried again with the next account change or launch
  }, [client]);

  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const route = pushRoute(response.notification.request.content.data);
    if (!route) return;
    const account = route.host ? accounts.find((a) => a.host === route.host && !a.signedOut) : null;
    if (route.host && !account) return;  // an account this phone no longer has
    (async () => {
      if (account && account.id !== active?.id) await setActive(account.id);
      router.navigate(route.href);
    })();
  }, [loaded, response]);
}
