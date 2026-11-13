/**
 * Choices in a native form (SwiftUI `Form` sections): one of several in a `Picker`
 * (ChoicePicker: the assignment edit's aircraft and pilot, the filter's dates, the theme),
 * and any of several as `Toggle` rows (ToggleSection: the filter's aircraft, pilots and
 * trackers). Android: radio and `Checkbox` `ListItem`s (docs/mobile-design-principles.md, 2).
 */
import { Picker, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { pickerStyle, tag, type PickerStyleType } from '@expo/ui/swift-ui/modifiers';
import type { FilterChoice as Choice } from './flights';

/**
 * One of choices. The options are tagged by index, so a value can be anything (null
 * included, which a SwiftUI tag can't be). The default style is a menu in the row (a long
 * one scrolls); a short list can take `segmented` or `inline`. Not `navigationLink`: it
 * needs a SwiftUI navigation stack, and the app's stacks are React Navigation's.
 */
export function ChoicePicker<V>({ label, choices, value, onChange, style = 'menu' }: {
  label: string;
  choices: Choice<V>[];
  value: V;
  onChange: (v: V) => void;
  style?: PickerStyleType;
}) {
  return (
    <Picker label={label} selection={choices.findIndex((c) => c.value === value)} modifiers={[pickerStyle(style)]}
      onSelectionChange={(i: number) => { if (choices[i]) onChange(choices[i].value); }}>
      {choices.map((c, i) => <Text key={i} modifiers={[tag(i)]}>{c.label}</Text>)}
    </Picker>
  );
}

/** A section of choices, any of which can be on. */
export function ToggleSection<V>({ title, choices, isOn, onToggle }: {
  title: string;
  choices: Choice<V>[];
  isOn: (v: V) => boolean;
  onToggle: (v: V) => void;
}) {
  return (
    <Section title={title}>
      {choices.map((c) => (
        <Toggle key={String(c.value)} label={c.label} isOn={isOn(c.value)} onIsOnChange={() => onToggle(c.value)} />
      ))}
    </Section>
  );
}
