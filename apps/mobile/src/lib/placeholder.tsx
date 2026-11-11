import { useRouter } from 'expo-router';
import { Button, Text, View } from 'react-native';
import { useAccounts } from './accounts-context';
import { useBootstrap } from './bootstrap-context';
import { useTokens } from './theme';

/** What a tab says when the active account's server is older than this app supports; the
 * built tabs keep showing their cached data under it. */
export const serverTooOld = (host: string) => `${host} needs an update to work with this version of the app.`;

/** A tab's body until its step of phase 5 builds it, or the way to add an account when
 * there's no signed-in one. */
export function Placeholder({ text }: { text: string }) {
  const t = useTokens();
  const router = useRouter();
  const { loaded, active } = useAccounts();
  const { handshake } = useBootstrap();
  const needsAccount = loaded && (!active || active.signedOut);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: t['bg-base'] }}>
      <Text style={{ color: t['text-muted'], textAlign: 'center' }}>
        {!needsAccount ? (handshake === 'server-too-old' ? serverTooOld(active!.host) : text)
          : active ? `You’ve been signed out of ${active.host}. Scan a new code to sign in again.`
          : 'Sign in by scanning the code from Wingbeat on the web.'}
      </Text>
      {needsAccount && <Button title="Add account" color={t['accent']} onPress={() => router.push('/add-account')} />}
    </View>
  );
}
