/**
 * wingbeat://pair?host=…&token=…, the fallback when the code is scanned with the system
 * camera or the link is tapped. Anything can open a link, so this asks before signing in.
 */
import { useLocalSearchParams } from 'expo-router';
import { Button, StyleSheet, Text, View } from 'react-native';
import { parseFailureMessage, parsePairingLink } from '@/lib/pairing-link';
import { PairingStatusView } from '@/lib/pairing-status';
import { useTokens } from '@/lib/theme';
import { usePairing } from '@/lib/use-pairing';

export default function PairScreen() {
  const t = useTokens();
  const { host = '', token = '' } = useLocalSearchParams<{ host?: string; token?: string }>();
  const { status, pairFrom, reset } = usePairing();
  const link = `wingbeat://pair?host=${encodeURIComponent(host)}&token=${encodeURIComponent(token)}`;
  const parsed = parsePairingLink(link);

  return (
    <View style={[styles.centered, { backgroundColor: t['bg-base'] }]}>
      {!parsed.ok ? (
        <Text style={[styles.text, { color: t['danger'] }]}>{parseFailureMessage(parsed.reason, link)}</Text>
      ) : status.kind === 'idle' ? (
        <>
          <Text style={[styles.text, { color: t['text-primary'] }]}>Sign in to {parsed.target.host}?</Text>
          <Button title="Sign in" color={t['accent']} onPress={() => pairFrom(link)} />
        </>
      ) : (
        <PairingStatusView status={status} onRetry={reset} retryTitle="Try again" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  text: { fontSize: 16, textAlign: 'center' },
});
