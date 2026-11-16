/**
 * Add account. The main path is "Sign in with Browser": the user types their Wingbeat address
 * and connects the app from the browser they're already signed in to (docs/mobile-app-plan.md,
 * "Auth and pairing"). The other is scanning the sign-in code Wingbeat on the web shows
 * (scan.tsx). "Try the Demo" signs in to the demo instance's simulated fleet, no account
 * needed (App Review uses it too). A SwiftUI `Form`; Android: a `Column` of a `TextField` and `Button`s
 * (docs/mobile-design-principles.md, 2).
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, Form, Host, Section, Text, TextField } from '@expo/ui/swift-ui';
import { autocorrectionDisabled, disabled, keyboardType, onSubmit, submitLabel, textContentType, textInputAutocapitalization } from '@expo/ui/swift-ui/modifiers';
import { usePairing } from '@/lib/use-pairing';

export default function AddAccountScreen() {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const { status, signInWithBrowser, tryDemo, reset } = usePairing();
  const pairing = status.kind === 'pairing';
  const signIn = () => {
    reset();
    signInWithBrowser(address);
  };
  const demo = () => {
    reset();
    tryDemo();
  };

  const footer = status.kind === 'pairing' ? `Signing in to ${status.host}…`
    : status.kind === 'failed' ? status.message
    : 'Opens your Wingbeat site in Safari. If you’re signed in there, you can connect the app to the same account.';

  return (
    <Host style={{ flex: 1 }}>
      <Form>
        <Section title="Sign in with Browser" footer={<Text>{footer}</Text>}>
          <TextField placeholder="Wingbeat address, like yourcompany" onTextChange={setAddress}
            modifiers={[keyboardType('url'), textContentType('URL'), textInputAutocapitalization('never'),
              autocorrectionDisabled(), submitLabel('go'), onSubmit(signIn)]} />
          <Button label="Sign in with Browser" systemImage="safari" onPress={signIn}
            modifiers={[disabled(pairing || !address.trim())]} />
        </Section>
        <Section footer={<Text>In Wingbeat on the web, open Settings → Devices and choose Get link to show a code.</Text>}>
          <Button label="Scan a Code" systemImage="qrcode.viewfinder" onPress={() => router.push('/scan')}
            modifiers={[disabled(pairing)]} />
        </Section>
        <Section footer={<Text>A demo company’s simulated fleet, two aircraft always in the air. No account needed.</Text>}>
          <Button label="Try the Demo" systemImage="airplane" onPress={demo}
            modifiers={[disabled(pairing)]} />
        </Section>
      </Form>
    </Host>
  );
}
