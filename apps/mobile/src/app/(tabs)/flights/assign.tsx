import { useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Form, Host, Section } from '@expo/ui/swift-ui';
import { setFlightAssignment } from '@wingbeat/core/api/corrections';
import { useAccounts } from '@/lib/accounts-context';
import { ChoicePicker } from '@/lib/choice-list';
import { useFlights } from '@/lib/flights-context';
import { assignmentChoices, assignmentRequest } from '@/lib/flights';
import { Placeholder } from '@/lib/placeholder';
import { useFlightsTab } from '@/lib/use-flights-tab';

/**
 * An admin's edit of a flight's aircraft and pilot (PUT /api/flights/assignment, as the
 * web's flight form saves them). Saving refreshes the flight store, which updates the list
 * and the detail.
 */
export default function AssignScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useAccounts();
  const { store } = useFlights();
  const tab = useFlightsTab();
  const flight = tab.ready ? tab.findFlight(Number(id)) : null;
  const [tail, setTail] = useState<string | null | undefined>(undefined);
  const [pilot, setPilot] = useState<number | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  if (!tab.ready || !client || !store) return <Placeholder />;
  if (!flight || !tab.isAdmin) return <Placeholder text="This flight isn’t in the list any more." />;
  const choices = assignmentChoices(flight, tab.bootstrap.aircraft, tab.bootstrap.pilots);
  const aircraftTail = tail === undefined ? flight.aircraft_tail ?? null : tail;
  const pilotId = pilot === undefined ? flight.pilot_id ?? null : pilot;
  const body = assignmentRequest(flight, aircraftTail, pilotId);

  const save = async () => {
    if (!body) { router.back(); return; }
    setSaving(true);
    try {
      await setFlightAssignment(client, body);
      await store.refresh().catch(() => {});
      router.back();
    } catch (err) {
      setSaving(false);
      Alert.alert('Couldn’t save the assignment', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button disabled={saving} onPress={() => router.back()}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" disabled={saving} onPress={save}>{saving ? 'Saving…' : 'Save'}</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }}>
        <Form>
          <Section>
            <ChoicePicker label="Aircraft" choices={choices.aircraft} value={aircraftTail} onChange={setTail} />
            <ChoicePicker label="Pilot" choices={choices.pilots} value={pilotId} onChange={setPilot} />
          </Section>
        </Form>
      </Host>
    </>
  );
}
