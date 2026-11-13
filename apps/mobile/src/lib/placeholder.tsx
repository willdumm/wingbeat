import { useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAccounts } from './accounts-context';
import { useBootstrap } from './bootstrap-context';
import { EmptyState } from './empty-state';
import { useTokens } from './theme';

/** What a tab says when the active account's server is older than this app supports; the
 * built tabs keep showing their cached data under it. */
export const serverTooOld = (host: string) => `${host} needs an update to work with this version of the app.`;

/** A tab's body while it loads (no text) or when it has nothing to show, or the way to add
 * an account when there's no signed-in one. */
export function Placeholder({ text }: { text?: string }) {
  const t = useTokens();
  const router = useRouter();
  const { loaded, active } = useAccounts();
  const { handshake } = useBootstrap();
  const addAccount = { label: 'Add Account', onPress: () => router.push('/add-account') };
  if (loaded && !active) {
    return <EmptyState title="No account" systemImage="person.crop.circle.badge.plus"
      description="Sign in by scanning the code from Wingbeat on the web." action={addAccount} />;
  }
  if (active?.signedOut) {
    return <EmptyState title="Signed out" systemImage="person.crop.circle.badge.exclamationmark"
      description={`You’ve been signed out of ${active.host}. Scan a new code to sign in again.`} action={addAccount} />;
  }
  if (active && handshake === 'server-too-old') {
    return <EmptyState title="Server update needed" systemImage="exclamationmark.icloud" description={serverTooOld(active.host)} />;
  }
  if (text) return <EmptyState title={text} />;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t['bg-base'] }}>
      <ActivityIndicator />
    </View>
  );
}
