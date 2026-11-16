/**
 * Settings → Notifications: the active account's push subscriptions. Turning the first one on
 * asks for permission and registers this phone (push.ts); each change saves the whole set.
 * The Time Sensitive events are this phone's: a change is stored here and registered again
 * with every signed-in account.
 */
import { useEffect, useMemo, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Alert, Linking } from 'react-native';
import { ApiHttpError, apiErrorMessage } from '@wingbeat/core/api/client';
import { getPushSubscriptions, setPushSubscriptions, type TrackerPushEvent } from '@wingbeat/core/api/push';
import { useAccounts } from '@/lib/accounts-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { EmptyState } from '@/lib/empty-state';
import { NotificationSettings } from '@/lib/notification-settings';
import { Placeholder } from '@/lib/placeholder';
import { parseTimeSensitive, TIME_SENSITIVE_KEY } from '@/lib/prefs';
import { askPushPermission, registerThisDevice } from '@/lib/push';
import { setSubscribed, type Subscription } from '@/lib/push-route';
import { useStoredState } from '@/lib/stored-state';

export default function NotificationsScreen() {
  const { client, signedInClients } = useAccounts();
  const [timeSensitive, setTimeSensitive] = useStoredState(TIME_SENSITIVE_KEY, parseTimeSensitive);
  const { bootstrap } = useBootstrap();
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSubs(null);
    setUnsupported(false);
    if (!client) return;
    let current = true;
    getPushSubscriptions(client).then(
      (r) => { if (current) setSubs(r.subscriptions); },
      (err) => {
        if (!current) return;
        // A server from before app push.
        if (err instanceof ApiHttpError && err.status === 404) setUnsupported(true);
        else Alert.alert('Couldn’t load notifications', apiErrorMessage(err, String(err)));
      },
    );
    return () => { current = false; };
  }, [client]);

  const trackers = useMemo(
    () => bootstrap?.trackers.filter((tr) => tr.active && !tr.deleted).map((tr) => ({ id: tr.id, label: tr.assigned_aircraft || tr.name })) ?? [],
    [bootstrap],
  );

  if (unsupported) {
    return <EmptyState title="Not on This Server" systemImage="bell.slash" description="This server doesn’t send app notifications yet." />;
  }
  if (!client || !subs) return <Placeholder />;

  const change = async (sub: Subscription, on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        if (await askPushPermission() === 'denied') {
          Alert.alert('Notifications are off', 'Turn on notifications for Wingbeat in the Settings app.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
        await registerThisDevice(client);
      }
      setSubs((await setPushSubscriptions(client, { subscriptions: setSubscribed(subs, sub, on) })).subscriptions);
    } catch (err) {
      Alert.alert('Couldn’t save notifications', apiErrorMessage(err, err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const changeTimeSensitive = async (event: TrackerPushEvent, on: boolean) => {
    const next = parseTimeSensitive(on ? [...timeSensitive, event] : timeSensitive.filter((e) => e !== event));
    setTimeSensitive(next);
    // Without permission there's no registration to update; the first one sends it.
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    setBusy(true);
    try {
      await Promise.all((await signedInClients()).map((c) => registerThisDevice(c, next)));
    } catch (err) {
      Alert.alert('Couldn’t save notifications', apiErrorMessage(err, err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <NotificationSettings trackers={trackers} subscriptions={subs} timeSensitive={timeSensitive} busy={busy}
      onChange={change} onTimeSensitiveChange={changeTimeSensitive} />
  );
}
