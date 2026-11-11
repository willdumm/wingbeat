import { useRouter } from 'expo-router';
import { Button, Text, View } from 'react-native';
import { useAccounts } from './accounts-context';
import { useTokens } from './theme';

/** A tab's body until its step of phase 5 builds it, or the way to add an account when
 * there's no signed-in one. */
export function Placeholder({ text }: { text: string }) {
  const t = useTokens();
  const router = useRouter();
  const { loaded, active } = useAccounts();
  const needsAccount = loaded && (!active || active.signedOut);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: t['bg-base'] }}>
      <Text style={{ color: t['text-muted'], textAlign: 'center' }}>
        {!needsAccount ? text
          : active ? `You’ve been signed out of ${active.host}. Scan a new code to sign in again.`
          : 'Sign in by scanning the code from Wingbeat on the web.'}
      </Text>
      {needsAccount && <Button title="Add account" color={t['accent']} onPress={() => router.push('/add-account')} />}
    </View>
  );
}
