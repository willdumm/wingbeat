/**
 * App push (docs/mobile-app-plan.md, "Step 2: app push for hosted instances" and "Native
 * details"): permission asked at the first subscription, not at launch; this phone's Expo push
 * token registered with each account's session; banners while the app is open; and a tap
 * routed to what the push is about (push-route.ts), switching to its account first.
 */
import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import type { ApiClient } from '@wingbeat/core/api/client';
import { PUSH_ACTIONS, PUSH_CHANNELS, registerPushDevice, TRACKER_PUSH_CATEGORY, type TrackerPushEvent } from '@wingbeat/core/api/push';
import { useAccounts } from './accounts-context';
import { parseTimeSensitive, TIME_SENSITIVE_KEY } from './prefs';
import { pushMapShareUrl, pushRoute } from './push-route';
import { readStored } from './stored-state';

/**
 * Shows a push that arrives while the app is open as it would otherwise, and sets up what
 * pushes name: the Android channels (PUSH_CHANNELS) and the tracker events' actions
 * (TRACKER_PUSH_CATEGORY). Setting either again is harmless, and keeps a user's channel
 * settings.
 */
export function initPush() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    const channels: [string, string, Notifications.AndroidImportance][] = [
      [PUSH_CHANNELS.flights, 'Takeoffs and Landings', Notifications.AndroidImportance.HIGH],
      [PUSH_CHANNELS.gaps, 'Signal Gaps', Notifications.AndroidImportance.MAX],
      [PUSH_CHANNELS.alerts, 'Alerts', Notifications.AndroidImportance.DEFAULT],
    ];
    for (const [id, name, importance] of channels) {
      Notifications.setNotificationChannelAsync(id, { name, importance }).catch(() => {});
    }
  }
  Notifications.setNotificationCategoryAsync(TRACKER_PUSH_CATEGORY, [
    { identifier: PUSH_ACTIONS.viewOnMap, buttonTitle: 'View on Map', options: { opensAppToForeground: true } },
    { identifier: PUSH_ACTIONS.openMapShare, buttonTitle: 'Open MapShare', options: { opensAppToForeground: true } },
  ]).catch(() => {});
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
    if (!loaded || !response) return;
    const action = response.actionIdentifier;
    const id = response.notification.request.identifier + '/' + action;
    if (handled.current === id) return;
    handled.current = id;
    const data = response.notification.request.content.data;
    if (action === PUSH_ACTIONS.openMapShare) {
      const url = pushMapShareUrl(data);
      if (url) Linking.openURL(url).catch(() => {});
      return;
    }
    if (action !== Notifications.DEFAULT_ACTION_IDENTIFIER && action !== PUSH_ACTIONS.viewOnMap) return;
    const route = pushRoute(data);
    if (!route) return;
    const account = route.host ? accounts.find((a) => a.host === route.host && !a.signedOut) : null;
    if (route.host && !account) return;  // an account this phone no longer has
    (async () => {
      if (account && account.id !== active?.id) await setActive(account.id);
      router.navigate(route.href);
    })();
  }, [loaded, response]);
}
