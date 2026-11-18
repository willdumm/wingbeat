/**
 * Opening Wingbeat's page in the Settings app, for a permission the user turned off. iOS can
 * refuse (seen in App Review), and a button that silently does nothing reads as broken, so a
 * refusal says where to go instead.
 */
import { Alert, Linking } from 'react-native';

export function openAppSettings(): void {
  Linking.openSettings().catch(() => {
    Alert.alert('Couldn’t open Settings', 'Open the Settings app, then choose Apps → Wingbeat.');
  });
}
