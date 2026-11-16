/**
 * The alerts screen's list (the web's alerts strip): Immediate, then Due Soon, in a SwiftUI
 * `Form`, each row core's alertText with its urgency's symbol. A row with an action (onPress
 * gives one) is a button; the rest only read. Android: `ListItem`s in a `LazyColumn`
 * (docs/mobile-design-principles.md, 2).
 */
import { Button, Form, HStack, Host, Image, Section, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { alertText, type Alert } from '@wingbeat/core/alerts';
import { useTokens } from './theme';

const PRIMARY = foregroundStyle({ type: 'hierarchical', style: 'primary' });
const SECONDARY = foregroundStyle({ type: 'hierarchical', style: 'secondary' });

export function AlertsList({ alerts, onPress, footer }: {
  alerts: Alert[];
  /** The row's action, or null for a row that only reads. */
  onPress: (alert: Alert) => (() => void) | null;
  /** Under the list. */
  footer?: string;
}) {
  const t = useTokens();
  const row = (alert: Alert, i: number) => {
    const { text, detail } = alertText(alert);
    const action = onPress(alert);
    const content = (
      <HStack spacing={12}>
        <Image systemName={alert.urgency === 'immediate' ? 'exclamationmark.circle.fill' : 'clock.fill'}
          color={alert.urgency === 'immediate' ? t['danger'] : t['warning-fg']} />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[PRIMARY]}>{text}</Text>
          {!!detail && <Text modifiers={[font({ textStyle: 'footnote' }), SECONDARY]}>{detail}</Text>}
        </VStack>
        <Spacer />
        {action && <Image systemName="chevron.right" size={13} color={t['text-faint']} />}
      </HStack>
    );
    return action ? <Button key={i} onPress={action}>{content}</Button> : <VStack key={i}>{content}</VStack>;
  };
  const immediate = alerts.filter((a) => a.urgency === 'immediate');
  const dueSoon = alerts.filter((a) => a.urgency === 'due_soon');
  // Under the last section.
  const note = footer ? <Text>{footer}</Text> : undefined;
  return (
    <Host style={{ flex: 1 }}>
      <Form>
        {immediate.length > 0 && <Section title="Immediate" footer={dueSoon.length === 0 ? note : undefined}>{immediate.map(row)}</Section>}
        {dueSoon.length > 0 && <Section title="Due Soon" footer={note}>{dueSoon.map(row)}</Section>}
      </Form>
    </Host>
  );
}
