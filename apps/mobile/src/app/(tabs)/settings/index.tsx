/**
 * Settings. For now, the accounts: which one the tabs show, removing one, and adding one.
 * Step 8 of phase 5 builds the rest.
 */
import { useRouter } from 'expo-router';
import { Alert, Button, Pressable, ScrollView, Text, View } from 'react-native';
import { useAccounts } from '@/lib/accounts-context';
import type { Account } from '@/lib/accounts';
import { useTokens } from '@/lib/theme';

export default function SettingsScreen() {
  const t = useTokens();
  const router = useRouter();
  const { accounts, activeId, setActive, remove } = useAccounts();

  const confirmRemove = (a: Account) => Alert.alert(
    'Remove this account?',
    `${a.user.name} on ${a.host}. This phone stays in your Devices list on the web until you sign it out there.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove(a.id) }],
  );

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: t['bg-base'] }}
      contentContainerStyle={{ padding: 16, gap: 8 }}>
      <Text style={{ color: t['text-muted'], fontSize: 13, textTransform: 'uppercase' }}>Accounts</Text>
      {accounts.map((a) => (
        <Pressable key={a.id} onPress={() => setActive(a.id)} onLongPress={() => confirmRemove(a)}
          style={{ padding: 12, borderRadius: 12, backgroundColor: t['surface-1'], borderWidth: 1,
            borderColor: a.id === activeId ? t['accent'] : t['border-subtle'] }}>
          <View style={{ gap: 2 }}>
            <Text style={{ color: t['text-primary'], fontSize: 16 }}>{a.user.name}</Text>
            <Text style={{ color: t['text-muted'] }}>
              {a.host}{a.signedOut ? ' · signed out' : a.user.role === 'admin' ? ' · admin' : ''}
            </Text>
          </View>
        </Pressable>
      ))}
      <Button title="Add account" color={t['accent']} onPress={() => router.push('/add-account')} />
    </ScrollView>
  );
}
