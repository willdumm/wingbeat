/**
 * wingbeat://pair?host=…&token=…, the fallback when the code is scanned with the system
 * camera or the link is tapped. Anything can open a link, so this asks before signing in.
 * SwiftUI's ContentUnavailableView (the symbol, the instance, Sign In) under a Cancel bar
 * button; Android: a centered `Column` with a filled `Button` and a top app bar action
 * (docs/mobile-design-principles.md, 2).
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, ContentUnavailableView, Host, ProgressView } from '@expo/ui/swift-ui';
import { buttonStyle, controlSize } from '@expo/ui/swift-ui/modifiers';
import { EmptyState } from '@/lib/empty-state';
import { parseFailureMessage, parsePairingLink } from '@/lib/pairing-link';
import { usePairing } from '@/lib/use-pairing';

export default function PairScreen() {
  const router = useRouter();
  const { host = '', token = '' } = useLocalSearchParams<{ host?: string; token?: string }>();
  const { status, pairFrom, reset } = usePairing();
  const link = `wingbeat://pair?host=${encodeURIComponent(host)}&token=${encodeURIComponent(token)}`;
  const parsed = parsePairingLink(link);
  // Opened from a link, the modal may have nothing under it to go back to.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/live'));
  const signIn = () => {
    reset();
    pairFrom(link);
  };

  const cancel = (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button disabled={status.kind === 'pairing'} onPress={close}>Cancel</Stack.Toolbar.Button>
    </Stack.Toolbar>
  );

  if (!parsed.ok) {
    return (
      <>
        {cancel}
        <EmptyState title="Can’t Use This Link" systemImage="exclamationmark.triangle"
          description={parseFailureMessage(parsed.reason, link)} action={{ label: 'Close', onPress: close }} />
      </>
    );
  }

  const description = status.kind === 'pairing' ? `Signing in to ${status.host}…`
    : status.kind === 'failed' ? status.message
    : `This link signs the app in to your account at ${parsed.target.host}. Continue only if you opened it yourself.`;

  return (
    <>
      {cancel}
      <Host style={{ flex: 1 }}>
        <ContentUnavailableView title="Sign In to Wingbeat" systemImage="person.crop.circle.badge.plus"
          description={description}
          actions={status.kind === 'pairing' ? <ProgressView />
            : <Button label={status.kind === 'failed' ? 'Try Again' : 'Sign In'} onPress={signIn}
                modifiers={[buttonStyle('borderedProminent'), controlSize('large')]} />} />
      </Host>
    </>
  );
}
