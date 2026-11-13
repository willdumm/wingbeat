/**
 * Copying text, when the build has expo-clipboard's native module (null when it doesn't: a
 * dev build from before it was added, so callers fall back to the share sheet's Copy). The
 * module is loaded lazily, since importing it without the native side throws.
 */
import { requireOptionalNativeModule } from 'expo';

export const copyText: ((text: string) => Promise<void>) | null = requireOptionalNativeModule('ExpoClipboard')
  ? async (text) => {
      const Clipboard: typeof import('expo-clipboard') = require('expo-clipboard');
      await Clipboard.setStringAsync(text);
    }
  : null;
