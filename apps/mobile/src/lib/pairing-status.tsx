import { ActivityIndicator, Button, Text, View } from 'react-native';
import { useTokens } from './theme';
import type { PairingStatus } from './use-pairing';

/** The pairing progress or failure, over the scanner or on the link's screen. */
export function PairingStatusView({ status, onRetry, retryTitle }: {
  status: PairingStatus;
  onRetry: () => void;
  retryTitle: string;
}) {
  const t = useTokens();
  if (status.kind === 'idle') return null;
  return (
    <View style={{ gap: 12, padding: 16, borderRadius: 12, backgroundColor: t['surface-1'], alignItems: 'center' }}>
      {status.kind === 'pairing' ? (
        <>
          <ActivityIndicator color={t['accent']} />
          <Text style={{ color: t['text-primary'] }}>Signing in to {status.host}…</Text>
        </>
      ) : (
        <>
          <Text style={{ color: t['danger'], textAlign: 'center' }}>{status.message}</Text>
          <Button title={retryTitle} color={t['accent']} onPress={onRetry} />
        </>
      )}
    </View>
  );
}
