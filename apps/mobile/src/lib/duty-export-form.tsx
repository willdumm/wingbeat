/**
 * The Custom export's fields (the web's Export PDF form's From and To): two month menus in a
 * SwiftUI `Form`, with what the export does, or what's wrong with it, under them. Android:
 * Material dropdown menus (docs/mobile-design-principles.md, 2).
 */
import { Form, Host, Section, Text } from '@expo/ui/swift-ui';
import { ChoicePicker } from './choice-list';
import type { FilterChoice } from './flights';

export function DutyExportFields({ months, from, to, onFrom, onTo, footer }: {
  /** dutyExportMonths's. */
  months: FilterChoice<number>[];
  from: number;
  to: number;
  onFrom: (from: number) => void;
  onTo: (to: number) => void;
  footer: string;
}) {
  return (
    <Host style={{ flex: 1 }}>
      <Form>
        <Section footer={<Text>{footer}</Text>}>
          <ChoicePicker label="From" choices={months} value={from} onChange={onFrom} />
          <ChoicePicker label="To" choices={months} value={to} onChange={onTo} />
        </Section>
      </Form>
    </Host>
  );
}
