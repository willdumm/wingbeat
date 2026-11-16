/**
 * The flight form's fields (the web's flight editor: an admin's add or edit of a flight): the
 * date and Dep/Arr times in the operator's zone (an arrival before the departure is the next
 * day, said under them), origin and destination from the named points, aircraft and pilot,
 * Part 135 or 91 and, for Part 91, pay, and the remark. A SwiftUI `Form`: compact
 * `DatePicker`s, menu and segmented `Picker`s, a `TextField`. Android: the Material date and
 * time pickers, `ExposedDropdownMenuBox`, `SingleChoiceSegmentedButtonRow`, `TextField`
 * (docs/mobile-design-principles.md, 2).
 *
 * The remark's text lives in a native state, so a caller that refills the form passes a new
 * fill to reset it.
 */
import { DatePicker, Form, Host, Section, Text, TextField, useNativeState } from '@expo/ui/swift-ui';
import type { FlightFormFields as Fields } from '@wingbeat/core/corrections';
import { MAX_FLIGHT_TEXT_LENGTH } from '@wingbeat/core/record-limits';
import { ChoicePicker } from './choice-list';
import { dateOfDayKey, dateOfTime, dayKeyOfDate, timeOfDate } from './date-pickers';
import type { FlightFormChoices } from './flight-form';

const PARTS: { value: Fields['part']; label: string }[] = [{ value: '135', label: 'Part 135' }, { value: '91', label: 'Part 91' }];
const PAYS: { value: Fields['pay']; label: string }[] = [{ value: 'paid', label: 'Paid' }, { value: 'unpaid', label: 'Unpaid' }];

function RemarkField({ initial, onChange }: { initial: string; onChange: (remark: string) => void }) {
  const remark = useNativeState(initial);
  return <TextField text={remark} placeholder="e.g. Training" maxLength={MAX_FLIGHT_TEXT_LENGTH} onTextChange={onChange} />;
}

export function FlightFormFields({ fields, fill, choices, timesHint, onChange }: {
  fields: Fields;
  /** Changed when the caller refills the form. */
  fill: number;
  choices: FlightFormChoices;
  /** Under the times: "Arrives the next day" and the like, or ''. */
  timesHint: string;
  /** Applied to the form as it is then. */
  onChange: (patch: Partial<Fields>) => void;
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
        <Section>
          <ChoicePicker label="Origin" choices={choices.origins} value={fields.origin} onChange={(origin) => onChange({ origin })} />
          <ChoicePicker label="Destination" choices={choices.dests} value={fields.dest} onChange={(dest) => onChange({ dest })} />
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
      </Form>
    </Host>
  );
}
