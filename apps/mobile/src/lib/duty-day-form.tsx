/**
 * The day form's fields (the web's "Duty or rest", an admin's edit of a pilot's duty log):
 * the date and an optional Through date, duty or rest day, the duty times (a switch, since
 * a day may record none and use the default), the note, and Clear when the days have
 * records. A SwiftUI `Form`: compact `DatePicker`s, a segmented `Picker`, a `Toggle`.
 * Android: the Material date and time pickers, `SingleChoiceSegmentedButtonRow`, `Switch`
 * (docs/mobile-design-principles.md, 2).
 *
 * The note's text lives in a native state, so a caller that refills the form (another
 * date, a reload) passes a new fill to reset it.
 */
import { Button, DatePicker, Form, Host, Section, Text, TextField, Toggle, useNativeState } from '@expo/ui/swift-ui';
import { MAX_DUTY_NOTE_LENGTH } from '@wingbeat/core/record-limits';
import { ChoicePicker } from './choice-list';
import { dateOfDayKey, dateOfTime, dayKeyOfDate, timeOfDate } from './date-pickers';
import type { DutyDayForm } from './duty';

const KINDS = [{ value: false, label: 'Duty' }, { value: true, label: 'Rest Day' }];

function NoteField({ initial, onChange }: { initial: string; onChange: (note: string) => void }) {
  const note = useNativeState(initial);
  return <TextField text={note} placeholder="Note" axis="vertical" maxLength={MAX_DUTY_NOTE_LENGTH} onTextChange={onChange} />;
}

export function DutyDayFields({ form, fill, onChange, onFrom, onTimes, hint, onClear }: {
  form: DutyDayForm;
  /** Changed when the caller refills the form. */
  fill: number;
  /** Applied to the form as it is then. */
  onChange: (patch: Partial<DutyDayForm>) => void;
  /** Another date: the caller refills the form from its record, as the web's does. */
  onFrom: (from: string) => void;
  /** The Duty Times switch: on fills times the caller suggests. */
  onTimes: (on: boolean) => void;
  /** Under the day type: the rest designation, or the pilot's default duty. */
  hint: string | null;
  /** null when none of the days has a record. */
  onClear: (() => void) | null;
}) {
  const times = form.times;
  const several = form.through != null && form.through !== form.from;
  return (
    <Host style={{ flex: 1 }}>
      <Form>
        <Section>
          <DatePicker title="Date" selection={dateOfDayKey(form.from)} displayedComponents={['date']}
            onDateChange={(d) => onFrom(dayKeyOfDate(d))} />
          <Toggle label="Through" isOn={form.through != null} onIsOnChange={(on) => onChange({ through: on ? form.from : null })} />
          {form.through != null && (
            <DatePicker title="Last Day" selection={dateOfDayKey(form.through)} range={{ start: dateOfDayKey(form.from) }}
              displayedComponents={['date']} onDateChange={(d) => onChange({ through: dayKeyOfDate(d) })} />
          )}
        </Section>
        <Section footer={hint ? <Text>{hint}</Text> : undefined}>
          <ChoicePicker label="Day Type" style="segmented" choices={KINDS} value={form.rest} onChange={(rest) => onChange({ rest })} />
          {!form.rest && <Toggle label="Duty Times" isOn={times != null} onIsOnChange={onTimes} />}
          {!form.rest && times && (
            <>
              <DatePicker title="Start" selection={dateOfTime(times.start)} displayedComponents={['hourAndMinute']}
                onDateChange={(d) => onChange({ times: { ...times, start: timeOfDate(d) } })} />
              <DatePicker title="End" selection={dateOfTime(times.end)} displayedComponents={['hourAndMinute']}
                onDateChange={(d) => onChange({ times: { ...times, end: timeOfDate(d) } })} />
            </>
          )}
        </Section>
        <Section title="Note">
          <NoteField key={fill} initial={form.note} onChange={(note) => onChange({ note })} />
        </Section>
        {onClear && (
          <Section>
            <Button role="destructive" label={several ? 'Clear These Days' : 'Clear Day'} onPress={onClear} />
          </Section>
        )}
      </Form>
    </Host>
  );
}
