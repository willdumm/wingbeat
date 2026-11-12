/**
 * Settings: the accounts (switch, add, sign out), deleting the active account, and the
 * theme. The instance's own settings are on the web until the app has them natively
 * (docs/mobile-app-plan.md, phase 11); the app doesn't link there. Deleting the account is App Review's requirement for an app
 * where an account can be created (docs/mobile-app-plan.md, "Account deletion").
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, ScrollView } from 'react-native';
import { apiErrorMessage } from '@wingbeat/core/api/client';
import { deleteMe } from '@wingbeat/core/api/me';
import { useAccounts } from '@/lib/accounts-context';
import type { Account } from '@/lib/accounts';
import { ChoiceSection, ListRow, ListSection } from '@/lib/choice-list';
import { THEME_CHOICES } from '@/lib/prefs';
import { px, useThemeChoice, useTokens } from '@/lib/theme';

const accountDetail = (a: Account) =>
  a.host + (a.signedOut ? ' · signed out' : a.user.role === 'admin' ? ' · admin' : '');

export default function SettingsScreen() {
  const t = useTokens();
  const router = useRouter();
  const { accounts, active, client, setActive, remove, signOut } = useAccounts();
  const [theme, setTheme] = useThemeChoice();
  const [busy, setBusy] = useState(false);

  const run = async (failure: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      Alert.alert(failure, apiErrorMessage(err, err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  // A signed-out account's session is already gone, so it's only removed from the phone.
  const confirmSignOut = (a: Account) => a.signedOut
    ? Alert.alert('Remove this account?', `${a.user.name} on ${a.host}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove(a.id) },
    ])
    : Alert.alert('Sign out?', `${a.user.name} on ${a.host}. Adding it again takes a new device link from the web’s Settings.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => run('Couldn’t sign out', () => signOut(a.id)) },
    ]);

  const confirmDelete = (a: Account) => Alert.alert(
    'Delete your account?',
    `This deletes ${a.user.name} on ${a.host} and signs out all your devices. `
      + 'The flights, duty days and pilot records stay with the operator.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => run('Couldn’t delete your account', async () => {
          await deleteMe(client!);
          await remove(a.id);
          Alert.alert('Account deleted', `${a.user.name} on ${a.host} is deleted.`);
        }),
      },
    ],
  );

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: t['bg-base'] }}
      contentContainerStyle={{ paddingVertical: px(t['space-4']), gap: px(t['space-6']) }}>
      <ListSection title="Accounts" footer={accounts.length > 1 ? 'Tap an account to show it; touch and hold to sign out.' : undefined}>
        {accounts.map((a) => (
          <ListRow key={a.id} label={a.user.name} detail={accountDetail(a)} selected={a.id === active?.id} disabled={busy}
            onPress={() => setActive(a.id)} onLongPress={() => confirmSignOut(a)} />
        ))}
        <ListRow label="Add account" disabled={busy} onPress={() => router.push('/add-account')} />
      </ListSection>

      {active && (
        <ListSection title={active.host}>
          <ListRow label={active.signedOut ? 'Remove from this phone' : 'Sign out'} disabled={busy} onPress={() => confirmSignOut(active)} />
          {!active.signedOut && (
            <ListRow label="Delete my account" destructive disabled={busy || !client} onPress={() => confirmDelete(active)} />
          )}
        </ListSection>
      )}

      <ChoiceSection title="Appearance" choices={THEME_CHOICES} isSelected={(v) => v === theme} onPress={setTheme} />
    </ScrollView>
  );
}
