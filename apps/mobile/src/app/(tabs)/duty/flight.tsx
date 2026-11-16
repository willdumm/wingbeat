import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { apiErrorMessage } from '@wingbeat/core/api/client';
import { saveFlightCorrection } from '@wingbeat/core/api/corrections';
import { getNamedPoints } from '@wingbeat/core/api/named-points';
import { flightFormTimesOf, flightSaveRequest, readFlightForm, type FlightFormFields as Fields, type FlightFormTarget } from '@wingbeat/core/corrections';
import { fmtDuration } from '@wingbeat/core/time';
import { useAccounts } from '@/lib/accounts-context';
import { flightFormChoices, newFlightFields, placeCoords, placesOf, type Place } from '@/lib/flight-form';
import { FlightFormFields } from '@/lib/flight-form-fields';
import { useFlights } from '@/lib/flights-context';
import { Placeholder } from '@/lib/placeholder';
import { dayParam, intParam } from '@/lib/route-params';
import { useFlightsTab } from '@/lib/use-flights-tab';

const NEW: FlightFormTarget = { tracked: false, entryId: null };

/**
 * An admin's new manual flight (the web's Add flight: POST /api/flight-corrections), from the
 * Duty header's + or the day form, on params date for params pilot (the duty log's). The
 * origin and destination are picked from the named points, fetched when the form opens, and
 * saved with their coordinates. A long flight asks first, as on the web. Saving refreshes the
 * flight store, which puts the flight in the duty log.
 */
export default function AddFlightScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ pilot?: string; date: string }>();
  const date = dayParam(params.date);
  const { client } = useAccounts();
  const { store } = useFlights();
  const tab = useFlightsTab();
  const [fields, setFields] = useState<Fields | null>(date ? newFlightFields(date, intParam(params.pilot)) : null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [placesFailed, setPlacesFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!client) return;
    let live = true;
    getNamedPoints(client).then((p) => { if (live) setPlaces(placesOf(p)); }, () => { if (live) setPlacesFailed(true); });
    return () => { live = false; };
  }, [client]);

  const cancel = (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button disabled={saving} onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
  const placeholder = (text?: string) => <>{cancel}<Placeholder text={text} /></>;
  if (!tab.ready || !client || !store) return placeholder();
  if (!tab.isAdmin) return placeholder('Only an admin can add flights.');
  if (!fields) return placeholder('This link doesn’t name a day.');
  if (placesFailed) return placeholder('Couldn’t load the named points.');
  if (!places) return placeholder();
  const tz = tab.tz;
  const times = flightFormTimesOf(tz, fields);
  const choices = flightFormChoices(fields, tab.bootstrap.aircraft, tab.bootstrap.pilots, places, false);

  const send = async () => {
    const v = readFlightForm(tz, fields, NEW);
    if (typeof v === 'string') { Alert.alert('Can’t Save', v); return; }
    const req = flightSaveRequest(v, NEW, { removed: false, baseHistoryId: store.historyId(), coords: (l) => placeCoords(places, l) });
    if (typeof req === 'string') { Alert.alert('Can’t Save', req); return; }
    setSaving(true);
    try {
      await saveFlightCorrection(client, req.body);
    } catch (err) {
      setSaving(false);
      Alert.alert('Couldn’t save the flight', apiErrorMessage(err, 'Something went wrong.'));
      return;
    }
    // Saved: close whatever the refresh does, so a failed one can't invite a second save (a
    // duplicate flight). The next refresh catches up.
    router.back();
    store.refresh().catch(() => {});
  };
  // A long flight is most likely a mistyped time read as the next day.
  const save = () => {
    if (!times?.long) { send(); return; }
    Alert.alert('Long Flight', 'This flight is ' + fmtDuration(times.secs) + ' long' + (times.nextDay ? ', arriving the next day' : '') + '. Save it?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: send },
    ]);
  };

  return (
    <>
      {cancel}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" disabled={saving} onPress={save}>{saving ? 'Saving…' : 'Save'}</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <FlightFormFields fields={fields} fill={0} choices={choices} timesHint={times?.hint ?? ''}
        onChange={(patch) => setFields((f) => (f ? { ...f, ...patch } : f))} />
    </>
  );
}
