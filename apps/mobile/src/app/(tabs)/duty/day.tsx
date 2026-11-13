import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ApiHttpError, apiErrorMessage } from '@wingbeat/core/api/client';
import { clearDutyDays, putDutyDays } from '@wingbeat/core/api/duty';
import { dutyDayKeys, dutyDefaultHint, dutyDefaultOn, dutyRestHint, dutySaveConfirmText } from '@wingbeat/core/duty';
import { editConflictText } from '@wingbeat/core/edit-history';
import { useAccounts } from '@/lib/accounts-context';
import { dutyDayFormOf, dutyDayRequest, dutyDaysRecorded, dutyTimesSuggested, type DutyDayForm } from '@/lib/duty';
import { DutyDayFields } from '@/lib/duty-day-form';
import { Placeholder } from '@/lib/placeholder';
import { useDutyLog } from '@/lib/use-duty-log';
import { useFlightsTab } from '@/lib/use-flights-tab';

/** Resolves with whether the user chose OK. */
const confirm = (title: string, message: string, ok: string) => new Promise<boolean>((resolve) => {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: ok, style: 'destructive', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) });
});

/**
 * An admin's plan or edit of a pilot's day (the web's "Duty or rest" form: PUT
 * /api/duty-days/:pilot, or its clear), from a day of the Duty tab, an Upcoming row or the
 * header's +. A Through date applies it to every day of a range, in one request.
 *
 * The form is filled from the pilot's log, again when it's refetched while unchanged. A
 * save sends what the log was as of (base_history_id), so a change another admin made
 * since is refused, and the Alert offers to reload.
 */
export default function DutyDayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pilot: string; date: string }>();
  const pilotId = Number(params.pilot);
  const { client } = useAccounts();
  const tab = useFlightsTab();
  const { log, reload } = useDutyLog(pilotId);
  const [form, setForm] = useState<DutyDayForm | null>(null);
  // The log's history id the form was filled as of, and a count of the fills (which resets
  // the note field).
  const [base, setBase] = useState(0);
  const [fill, setFill] = useState(0);
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);

  const refill = (from: string, through: string | null) => {
    if (!log) return;
    setForm(dutyDayFormOf(log, from, through));
    setBase(log.last_history_id);
    setFill((n) => n + 1);
  };
  useEffect(() => {
    if (log && (!form || (!changed && log.last_history_id !== base))) refill(form?.from ?? params.date, form?.through ?? null);
  }, [log?.last_history_id]);

  if (!tab.ready || !client || !log || !form) return <Placeholder />;
  if (!tab.isAdmin) return <Placeholder text="Only an admin can edit the duty log." />;
  const tz = tab.tz;

  const edit = (patch: Partial<DutyDayForm>) => {
    setChanged(true);
    setForm((f) => (f ? { ...f, ...patch } : f));
  };
  const record = log.days.find((d) => d.date === form.from) ?? null;
  const def = dutyDefaultOn(log.default_duties, form.from);
  const hint = form.rest ? dutyRestHint(tz, record) : !form.times && def ? dutyDefaultHint(def) : null;

  // Runs a write, then refetches the log (the Duty tab refetches too when it's shown again).
  const write = async (fn: () => Promise<unknown>, failed: string) => {
    setSaving(true);
    try {
      await fn();
      await reload();
      router.back();
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiHttpError && err.conflict) {
        Alert.alert('Changed Since Loaded', editConflictText(tz, err.conflict) + ' Reload it to see the change; your edits here are discarded.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reload', onPress: () => { setChanged(false); reload(); } },
        ]);
      } else {
        Alert.alert(failed, apiErrorMessage(err, 'Something went wrong.'));
      }
    }
  };

  const save = async () => {
    const req = dutyDayRequest(form);
    if (typeof req === 'string') { Alert.alert('Can’t Save', req); return; }
    const ask = dutySaveConfirmText(tz, log.days, req.keys, req.body);
    if (ask && !await confirm('Replace Records?', ask, 'Save')) return;
    await write(() => putDutyDays(client, pilotId, { ...req.body, base_history_id: base }), 'Couldn’t save');
  };
  const clear = async () => {
    const keys = dutyDayKeys(form.from, form.through ?? '');
    if (typeof keys === 'string') { Alert.alert('Can’t Clear', keys); return; }
    if (keys.length > 1 && !await confirm('Clear Days?', 'Clear duty, rest and notes for all ' + keys.length + ' days?', 'Clear')) return;
    await write(() => clearDutyDays(client, pilotId, { dates: keys, base_history_id: base }), 'Couldn’t clear');
  };

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button disabled={saving} onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" disabled={saving} onPress={save}>{saving ? 'Saving…' : 'Save'}</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <DutyDayFields
        form={form}
        fill={fill}
        onChange={edit}
        onFrom={(from) => refill(from, form.through == null ? null : form.through < from ? from : form.through)}
        onTimes={(on) => edit({ times: on ? dutyTimesSuggested(log, form.from) : null })}
        hint={hint}
        onClear={dutyDaysRecorded(log, form) && !saving ? clear : null}
      />
    </>
  );
}
