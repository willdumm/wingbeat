/**
 * Settings: the accounts (switch, add, sign out), deleting the active account, clearing its
 * flight cache, the theme and a link to the docs site. The instance's own settings are on the web until the app has them natively
 * (docs/mobile-app-plan.md, phase 11); the app doesn't link there. Deleting the account is App Review's requirement for an app
 * where an account can be created (docs/mobile-app-plan.md, "Account deletion").
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Button, ContextMenu, Form, HStack, Host, Image, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { disabled, font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { apiErrorMessage } from '@wingbeat/core/api/client';
import { deleteMe } from '@wingbeat/core/api/me';
import { docsHref } from '@wingbeat/core/docs';
import { useAccounts } from '@/lib/accounts-context';
import type { Account } from '@/lib/accounts';
import { useFlights } from '@/lib/flights-context';
import { ChoicePicker } from '@/lib/choice-list';
import { THEME_CHOICES } from '@/lib/prefs';
import { useThemeChoice, useTokens } from '@/lib/theme';

const PRIMARY = foregroundStyle({ type: 'hierarchical', style: 'primary' });
const SECONDARY = foregroundStyle({ type: 'hierarchical', style: 'secondary' });

const accountDetail = (a: Account) =>
  a.host + (a.signedOut ? ' · signed out' : a.user.role === 'admin' ? ' · admin' : '');

export default function SettingsScreen() {
  const t = useTokens();
  const router = useRouter();
  const { accounts, active, client, setActive, remove, signOut } = useAccounts();
  const { store, clearCache } = useFlights();
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

  const confirmClearCache = () => Alert.alert(
    'Clear the flight cache?',
    'The flights saved on this phone are downloaded again from the server.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => run('Couldn’t clear the cache', clearCache) },
    ],
  );

  return (
    <Host style={{ flex: 1 }}>
      <Form modifiers={[disabled(busy)]}>
        <Section title="Accounts" footer={accounts.length > 1 ? <Text>Tap an account to show it; touch and hold it to sign out.</Text> : undefined}>
          {accounts.map((a) => (
            <ContextMenu key={a.id}>
              <ContextMenu.Items>
                <Button role="destructive" label={a.signedOut ? 'Remove from This Phone' : 'Sign Out'} systemImage={a.signedOut ? 'trash' : 'rectangle.portrait.and.arrow.right'}
                  onPress={() => confirmSignOut(a)} />
              </ContextMenu.Items>
              <ContextMenu.Trigger>
                <Button onPress={() => setActive(a.id)}>
                  <HStack>
                    <VStack alignment="leading" spacing={2}>
                      <Text modifiers={[PRIMARY]}>{a.user.name}</Text>
                      <Text modifiers={[font({ textStyle: 'footnote' }), SECONDARY]}>{accountDetail(a)}</Text>
                    </VStack>
                    <Spacer />
                    {a.id === active?.id && <Image systemName="checkmark" color={t['accent']} />}
                  </HStack>
                </Button>
              </ContextMenu.Trigger>
            </ContextMenu>
          ))}
          <Button label="Add Account" onPress={() => router.push('/add-account')} />
        </Section>

        {active && (
          <Section title={active.host}>
            {!active.signedOut && (
              <Button role="destructive" label="Clear Flight Cache" modifiers={[disabled(!store)]} onPress={confirmClearCache} />
            )}
            <Button label={active.signedOut ? 'Remove from This Phone' : 'Sign Out'} onPress={() => confirmSignOut(active)} />
            {!active.signedOut && (
              <Button role="destructive" label="Delete My Account" modifiers={[disabled(!client)]} onPress={() => confirmDelete(active)} />
            )}
          </Section>
        )}

        <Section title="Appearance">
          <ChoicePicker label="Theme" choices={THEME_CHOICES} value={theme} onChange={setTheme} style="segmented" />
        </Section>

        <Section title="Help" footer={<Text>How tracking, flight editing, the duty log and settings work.</Text>}>
          <Button label="Documentation" systemImage="book" onPress={() => WebBrowser.openBrowserAsync(docsHref())} />
        </Section>
      </Form>
    </Host>
  );
}
