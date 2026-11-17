/**
 * The flight form's fields (the web's flight editor: an admin's add or edit of a flight): the
 * date and Dep/Arr times in the operator's zone (an arrival before the departure is the next
 * day, said under them), origin and destination (any text, with the named points that match
 * it suggested under the field, as the web's field with its suggestions), aircraft and pilot,
 * Part 135 or 91 and, for Part 91, pay, the remark and, for a flight being edited, its actions
 * (Remove from Log, Revert to Tracker, Delete Flight). A SwiftUI `Form`: compact
 * `DatePicker`s, menu and segmented `Picker`s, `TextField`s, a suggestion's `Button`.
 * Android: the Material date and time pickers, `ExposedDropdownMenuBox`,
 * `SingleChoiceSegmentedButtonRow`, `TextField` (docs/mobile-design-principles.md, 2).
 *
 * The places' and the remark's text live in native states, so a caller that refills the form
 * passes a new fill to reset them.
 */
import { useRef, useState } from 'react';
import { Button, DatePicker, Form, Host, Section, Text, TextField, useNativeState, type TextFieldRef } from '@expo/ui/swift-ui';
import { autocorrectionDisabled, textInputAutocapitalization } from '@expo/ui/swift-ui/modifiers';
import type { FilterChoice } from './flights';
import type { FlightFormFields as Fields } from '@wingbeat/core/corrections';
import { MAX_FLIGHT_TEXT_LENGTH } from '@wingbeat/core/record-limits';
import { ChoicePicker } from './choice-list';
import { dateOfDayKey, dateOfTime, dayKeyOfDate, timeOfDate } from './date-pickers';
import { placeSuggestions, type FlightFormChoices, type Place } from './flight-form';

const PARTS: { value: Fields['part']; label: string }[] = [{ value: '135', label: 'Part 135' }, { value: '91', label: 'Part 91' }];
const PAYS: { value: Fields['pay']; label: string }[] = [{ value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }];

function RemarkField({ initial, onChange }: { initial: string; onChange: (remark: string) => void }) {
  const remark = useNativeState(initial);
  return <TextField text={remark} placeholder="e.g. Training" maxLength={MAX_FLIGHT_TEXT_LENGTH} onTextChange={onChange} />;
}

/**
 * A place's text field and, under it while the text isn't a named point, the named points
 * that match it: picking one fills the field.
 */
function PlaceField({ label, places, initial, onChange }: {
  label: string;
  places: Place[];
  initial: string;
  onChange: (value: string) => void;
}) {
  const text = useNativeState(initial);
  const field = useRef<TextFieldRef>(null);
  const [typed, setTyped] = useState(initial);
  const change = (value: string) => {
    setTyped(value);
    onChange(value);
  };
  const pick = (name: string) => {
    text.set(name);
    change(name);
    field.current?.blur();
  };
  return (
    <>
      <TextField ref={field} text={text} placeholder={label} maxLength={MAX_FLIGHT_TEXT_LENGTH} onTextChange={change}
        modifiers={[textInputAutocapitalization('words'), autocorrectionDisabled()]} />
      {placeSuggestions(places, typed).map((name) => (
        <Button key={name} label={name} systemImage="mappin.and.ellipse" onPress={() => pick(name)} />
      ))}
    </>
  );
}

/** A button under the form. */
export interface FlightFormAction {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export function FlightFormFields({ fields, fill, choices, places, timesHint, placesHint = '', onChange, actions = [], actionsHint = '' }: {
  fields: Fields;
  /** Changed when the caller refills the form. */
  fill: number;
  choices: FlightFormChoices;
  /** The named points the origin and destination suggest. */
  places: Place[];
  /** Under the times: "Arrives the next day" and the like, or ''. */
  timesHint: string;
  /** Under the places, or ''. */
  placesHint?: string;
  /** Applied to the form as it is then. */
  onChange: (patch: Partial<Fields>) => void;
  /** The buttons under the form (none while saving), and the text under them. */
  actions?: FlightFormAction[];
  actionsHint?: string;
}) {
  return (
    <Host style={{ flex: 1 }}>
      <Form>
        <Section footer={timesHint ? <Text>{timesHint}</Text> : undefined}>
          <DatePicker title="Date" selection={dateOfDayKey(fields.date)} displayedComponents={['date']}
            onDateChange={(d) => onChange({ date: dayKeyOfDate(d) })} />
          <DatePicker title="Departure" selection={dateOfTime(fields.dep)} displayedComponents={['hourAndMinute']}
            onDateChange={(d) => onChange({ dep: timeOfDate(d) })} />
          <DatePicker title="Arrival" selection={dateOfTime(fields.arr)} displayedComponents={['hourAndMinute']}
            onDateChange={(d) => onChange({ arr: timeOfDate(d) })} />
        </Section>
        <Section footer={placesHint ? <Text>{placesHint}</Text> : undefined}>
          <PlaceField key={'origin' + fill} label="Origin" places={places} initial={fields.origin} onChange={(origin) => onChange({ origin })} />
          <PlaceField key={'dest' + fill} label="Destination" places={places} initial={fields.dest} onChange={(dest) => onChange({ dest })} />
        </Section>
        <Section>
          <ChoicePicker label="Aircraft" choices={choices.aircraft} value={fields.aircraft} onChange={(aircraft) => onChange({ aircraft })} />
          <ChoicePicker label="Pilot" choices={choices.pilots} value={fields.pilot} onChange={(pilot) => onChange({ pilot })} />
        </Section>
        <Section>
          <ChoicePicker label="Operated Under" style="segmented" choices={PARTS} value={fields.part} onChange={(part) => onChange({ part })} />
          {fields.part === '91' && (
            <ChoicePicker label="Pay" style="segmented" choices={PAYS} value={fields.pay} onChange={(pay) => onChange({ pay })} />
          )}
        </Section>
        <Section title="Remark">
          <RemarkField key={fill} initial={fields.remark} onChange={(remark) => onChange({ remark })} />
        </Section>
        {(actions.length > 0 || actionsHint) && (
          <Section footer={actionsHint ? <Text>{actionsHint}</Text> : undefined}>
            {actions.map((a) => (
              <Button key={a.label} role={a.destructive ? 'destructive' : undefined} label={a.label} onPress={a.onPress} />
            ))}
          </Section>
        )}
      </Form>
    </Host>
  );
}
