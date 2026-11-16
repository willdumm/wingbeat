/**
 * A tracker's location details in a native sheet, from tapping its status card, or a picked
 * point's: what the dashboard's location popup shows (core's locationDetails). The coordinates and links copy
 * (or, in a build without the clipboard module, share: the share sheet has Copy), with Google
 * Maps and Garmin MapShare links.
 */
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { BottomSheet, Button, Form, Group, HStack, Host, LabeledContent, Link, Section, ShareLink, Spacer, Text } from '@expo/ui/swift-ui';
import { buttonStyle, font, labelStyle, presentationBackgroundInteraction, presentationDetents, presentationDragIndicator, textSelection } from '@expo/ui/swift-ui/modifiers';
import type { LocationDetails } from '@wingbeat/core/live';
import { copyText } from './clipboard';

// Two buttons share a form row: borderless, so a tap fires only the one tapped.
const ROW_BUTTON = [buttonStyle('borderless'), labelStyle('iconOnly')];

/** details: null closes the sheet; onClose: the user dismissed it. */
export function LocationSheet({ title, details, onClose }: { title: string; details: LocationDetails | null; onClose: () => void }) {
  return (
    <Host matchContents style={{ position: 'absolute' }}>
      <BottomSheet isPresented={details != null} onIsPresentedChange={(shown) => { if (!shown) onClose(); }}>
        <Group modifiers={[
          presentationDetents(['medium', 'large']),
          presentationDragIndicator('visible'),
          // The map behind stays live at half the screen: panned, zoomed, or tapped for another point.
          presentationBackgroundInteraction({ type: 'enabledUpThrough', detent: 'medium' }),
        ]}>
          {details && <Form><LocationSections title={title} details={details} /></Form>}
        </Group>
      </BottomSheet>
    </Host>
  );
}

/** The sheet's sections, for a Form of its own or another sheet's (the flight detail's MapSheet). */
export function LocationSections({ title, details }: { title?: string; details: LocationDetails }) {
  return (
    <>
      <Section title={title}>
        <HStack>
          <Text modifiers={[font({ design: 'monospaced', textStyle: 'body' }), textSelection(true)]}>{details.coords}</Text>
          <Spacer />
          <CopyButton text={details.coords} />
        </HStack>
      </Section>
      <Section>
        {details.rows.map(([label, value]) => (
          <LabeledContent key={label} label={label}><Text>{value}</Text></LabeledContent>
        ))}
      </Section>
      <Section>
        <LinkRow label="Open in Google Maps" url={details.googleMapsUrl} />
        {!!details.mapshareUrl && <LinkRow label="Open Garmin MapShare" url={details.mapshareUrl} />}
      </Section>
    </>
  );
}

/** Copies text, showing "Copied" for a moment; shares it without the clipboard module. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  if (!copyText) return <ShareLink item={text} modifiers={ROW_BUTTON} />;
  const copy = copyText;
  return (
    <Button label={copied ? 'Copied' : 'Copy'} systemImage={copied ? 'checkmark' : 'doc.on.doc'} modifiers={[buttonStyle('borderless')]}
      onPress={() => { copy(text).then(() => setCopied(true), () => Alert.alert('Couldn’t copy')); }} />
  );
}

/** A link, with a copy button for the link itself (the web's "Copy link"). */
function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <HStack>
      <Link label={label} destination={url} modifiers={[buttonStyle('borderless')]} />
      <Spacer />
      <CopyButton text={url} />
    </HStack>
  );
}
