import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ApiHttpError, apiErrorMessage } from '@wingbeat/core/api/client';
import { deleteFlightCorrection, saveFlightCorrection, setFlightFlags, updateManualFlight } from '@wingbeat/core/api/corrections';
import { getNamedPoints } from '@wingbeat/core/api/named-points';
import {
  flightFlagsRequest, flightFormFieldsOf, flightFormTarget, flightFormTimesOf, flightSaveRequest, flightTimesChanged, readFlightForm,
  type FlightFormFields as Fields, type FlightFormTarget,
} from '@wingbeat/core/corrections';
import { editConflictText } from '@wingbeat/core/edit-history';
import { fmtDuration } from '@wingbeat/core/time';
import { useAccounts } from '@/lib/accounts-context';
import { flightFormChoices, newFlightFields, placeCoords, placesOf, trackerNotes, type Place } from '@/lib/flight-form';
import { FlightFormFields, type FlightFormAction } from '@/lib/flight-form-fields';
import { useFlights } from '@/lib/flights-context';
import { Placeholder } from '@/lib/placeholder';
import { dayParam, intParam } from '@/lib/route-params';
import { useFlightsTab } from '@/lib/use-flights-tab';

/** Resolves with whether the user chose OK. */
const confirm = (title: string, message: string, ok: string, destructive = false) => new Promise<boolean>((resolve) => {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) });
});

/**
 * An admin's new manual flight (the web's Add flight: POST /api/flight-corrections), from the
 * Duty header's + or the day form, on params date for params pilot (the duty log's); or, with
 * params id, the edit of a flight from its detail (Edit): a manual flight's row (PUT
 * /api/flight-corrections/:id), which can also be deleted, or a tracked flight's correction
 * (POST, only what differs from the tracker, its aircraft/pilot change with it), which can be
 * reverted to the tracker's. Either can be removed from the log. The origin and destination take any text and suggest the named
 * points, fetched when the form opens; one that is a named point is saved with its
 * coordinates. A long flight asks first, as on the web. Saving refreshes the flight store,
 * which puts the flight in the duty log.
 *
 * An edit sends the store's history id it was filled as of (base_history_id), so a change
 * another admin made since is refused, and the Alert offers to reload the flight.
 */
export default function FlightFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pilot?: string; date?: string; id?: string }>();
  const id = intParam(params.id);
  const date = dayParam(params.date);
  const { client } = useAccounts();
  const { store } = useFlights();
  const tab = useFlightsTab();
  const flight = id != null && tab.ready ? tab.findFlight(id) : null;
  const [fields, setFields] = useState<Fields | null>(id == null && date ? newFlightFields(date, intParam(params.pilot)) : null);
  const [target, setTarget] = useState<FlightFormTarget>({ tracked: false, entryId: null });
  // The store's history id the form was filled as of, and a count of the fills (which resets
  // the text fields).
  const [base, setBase] = useState(0);
  const [fill, setFill] = useState(0);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [placesFailed, setPlacesFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!client) return;
    let live = true;
    getNamedPoints(client).then((p) => { if (live) setPlaces(placesOf(p)); }, () => { if (live) setPlacesFailed(true); });
    return () => { live = false; };
  }, [client]);

  const refill = () => {
    if (!flight || flight.end_time == null || !store || !tab.ready) return;
    setFields(flightFormFieldsOf(tab.tz, flight));
    setTarget(flightFormTarget(flight));
    setBase(store.historyId());
    setFill((n) => n + 1);
  };
  // An edit's form, filled once its flight is in the store, and again after a Reload.
  useEffect(() => { if (id != null && !fields) refill(); }, [flight, !fields]);

  const editing = id != null;
  const title = <Stack.Screen options={{ title: editing ? 'Edit Flight' : 'Add Flight' }} />;
  const cancel = (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button disabled={saving} onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
  const placeholder = (text?: string) => <>{title}{cancel}<Placeholder text={text} /></>;
  if (!tab.ready || !client || !store) return placeholder();
  if (!tab.isAdmin) return placeholder(editing ? 'Only an admin can edit flights.' : 'Only an admin can add flights.');
  if (editing && !flight) return placeholder('This flight isn’t in the list any more.');
  if (flight && flight.end_time == null) return placeholder('A flight in progress can be edited once it lands.');
  if (!editing && !date) return placeholder('This link doesn’t name a day.');
  if (placesFailed) return placeholder('Couldn’t load the named points.');
  if (!places || !fields) return placeholder();
  const tz = tab.tz;
  const times = flightFormTimesOf(tz, fields);
  const choices = flightFormChoices(fields, tab.bootstrap.aircraft, tab.bootstrap.pilots, target.tracked);
  const removed = !!flight?.edit?.excluded;
  const notes = flight && target.tracked ? trackerNotes(tz, flight, target.orig) : null;

  // Runs a write and closes the form. Closed whatever the refresh does, so a failed one
  // can't invite a second save (a duplicate flight); the next refresh catches up.
  const write = async (fn: () => Promise<unknown>, failed: string) => {
    setSaving(true);
    try {
      await fn();
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiHttpError && err.conflict) {
        Alert.alert('Changed Since Loaded', editConflictText(tz, err.conflict) + ' Reload it to see the change; your edits here are discarded.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reload', onPress: () => { store.refresh().catch(() => {}).then(() => setFields(null)); } },
        ]);
      } else {
        Alert.alert(failed, apiErrorMessage(err, 'Something went wrong.'));
      }
      return;
    }
    router.back();
    store.refresh().catch(() => {});
  };

  const save = async () => {
    const v = readFlightForm(tz, fields, target);
    if (typeof v === 'string') { Alert.alert('Can’t Save', v); return; }
    const req = flightSaveRequest(v, target, { removed, baseHistoryId: editing ? base : store.historyId(), coords: (l) => placeCoords(places, l) });
    if (typeof req === 'string') { Alert.alert('Can’t Save', req); return; }
    // A long flight is most likely a mistyped time read as the next day.
    if (times?.long && flightTimesChanged(times, target) && !await confirm('Long Flight',
      'This flight is ' + fmtDuration(times.secs) + ' long' + (times.nextDay ? ', arriving the next day' : '') + '. Save it?', 'Save')) return;
    await write(() => (req.entryId != null ? updateManualFlight(client, req.entryId, req.body) : saveFlightCorrection(client, req.body)),
      'Couldn’t save the flight');
  };
  // An edited flight's buttons, as the web form's footer has them.
  const entryId = flight?.edit?.entry.id ?? null;
  const actions: FlightFormAction[] = !flight || saving ? [] : [
    ...(removed ? [] : [{ label: 'Remove from Log', destructive: true, onPress: async () => {
      if (!await confirm('Remove Flight?', 'It’s hidden everywhere (flight list, map, analytics, maintenance, duty log) except the web’s ' +
        'flight editor with Show removed, where it can be restored.', 'Remove', true)) return;
      await write(() => setFlightFlags(client, flightFlagsRequest([flight], { excluded: true })), 'Couldn’t remove the flight');
    } }]),
    ...(target.tracked && entryId != null ? [{ label: 'Revert to Tracker', onPress: async () => {
      if (!await confirm('Revert to Tracker?', 'Drop this flight’s corrections, Part 91 and unpaid marks and remark, and show it as the ' +
        'tracker recorded it?', 'Revert', true)) return;
      await write(() => deleteFlightCorrection(client, entryId, base), 'Couldn’t revert the flight');
    } }] : []),
    ...(!target.tracked && entryId != null ? [{ label: 'Delete Flight', destructive: true, onPress: async () => {
      if (!await confirm('Delete Flight?', 'Delete this manual flight?', 'Delete', true)) return;
      await write(() => deleteFlightCorrection(client, entryId, base), 'Couldn’t delete the flight');
    } }] : []),
  ];

  return (
    <>
      {title}
      {cancel}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" disabled={saving} onPress={save}>{saving ? 'Saving…' : 'Save'}</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <FlightFormFields fields={fields} fill={fill} choices={choices} places={places}
        timesHint={[times?.hint ?? '', ...notes?.times ?? []].filter(Boolean).join('\n')}
        placesHint={notes?.places.join('\n') ?? ''}
        onChange={(patch) => setFields((f) => (f ? { ...f, ...patch } : f))}
        actions={actions} actionsHint={notes?.flight ?? ''} />
    </>
  );
}
