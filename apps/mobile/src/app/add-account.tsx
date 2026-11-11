/**
 * Add account: scan the sign-in QR code from Wingbeat on the web (Settings → Devices, or
 * an invite). The token goes from the camera straight to the instance, never through the
 * OS's URL routing (docs/mobile-app-plan.md, "Auth and pairing").
 */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from 'expo-router';
import { Button, Linking, StyleSheet, Text, View } from 'react-native';
import { PairingStatusView } from '@/lib/pairing-status';
import { useTokens } from '@/lib/theme';
import { usePairing } from '@/lib/use-pairing';

export default function AddAccountScreen() {
  const t = useTokens();
  const [permission, requestPermission] = useCameraPermissions();
  const { status, pairFrom, reset } = usePairing();
  // Only one camera preview can run at a time, so it's unmounted when this screen isn't shown.
  const focused = useIsFocused();

  if (!permission) return <View style={{ flex: 1, backgroundColor: t['bg-base'] }} />;

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { backgroundColor: t['bg-base'] }]}>
        <Text style={[styles.text, { color: t['text-primary'] }]}>
          Wingbeat needs the camera to scan the sign-in code from Wingbeat on the web.
        </Text>
        {permission.canAskAgain ? (
          <Button title="Allow camera" color={t['accent']} onPress={requestPermission} />
        ) : (
          <Button title="Open Settings" color={t['accent']} onPress={() => Linking.openSettings()} />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t['bg-base'] }}>
      {focused && (
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={status.kind === 'idle' ? ({ data }) => pairFrom(data) : undefined}
        />
      )}
      <View style={styles.bottom}>
        {status.kind === 'idle' ? (
          <Text style={[styles.text, styles.hint, { color: t['text-primary'], backgroundColor: t['surface-float'] }]}>
            In Wingbeat on the web, open Settings → Devices, add a phone, and scan its code here.
          </Text>
        ) : (
          <PairingStatusView status={status} onRetry={reset} retryTitle="Scan again" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  text: { fontSize: 16, textAlign: 'center' },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 48 },
  hint: { padding: 12, borderRadius: 12, overflow: 'hidden' },
});
