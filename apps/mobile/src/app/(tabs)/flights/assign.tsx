import { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { setFlightAssignment } from '@wingbeat/core/api/corrections';
import { useAccounts } from '@/lib/accounts-context';
import { ChoiceSection } from '@/lib/choice-list';
import { useFlights } from '@/lib/flights-context';
import { assignmentChoices, assignmentRequest } from '@/lib/flights';
import { HeaderButton } from '@/lib/header-button';
import { Placeholder } from '@/lib/placeholder';
import { px, useTokens } from '@/lib/theme';
import { useFlightsTab } from '@/lib/use-flights-tab';

/**
 * An admin's edit of a flight's aircraft and pilot (PUT /api/flights/assignment, as the
 * web's flight form saves them). Saving refreshes the flight store, which updates the list
 * and the detail.
 */
export default function AssignScreen() {
  const t = useTokens();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useAccounts();
  const { store } = useFlights();
  const tab = useFlightsTab();
  const flight = tab.ready ? tab.flights.find((f) => f.id === Number(id)) ?? null : null;
  const [tail, setTail] = useState<string | null | undefined>(undefined);
  const [pilot, setPilot] = useState<number | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  if (!tab.ready || !client || !store) return <Placeholder text="Loading…" />;
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
      <Stack.Screen options={{
        headerLeft: () => <HeaderButton title="Cancel" onPress={() => router.back()} disabled={saving} />,
        headerRight: () => <HeaderButton title={saving ? 'Saving…' : 'Save'} bold onPress={save} disabled={saving} />,
      }} />
      <ScrollView
        style={{ backgroundColor: t['bg-base'] }}
        contentContainerStyle={{ gap: px(t['space-6']), paddingVertical: px(t['space-4']) }}
      >
        <ChoiceSection title="Aircraft" choices={choices.aircraft} isSelected={(v) => v === aircraftTail} onPress={setTail} />
        <ChoiceSection title="Pilot" choices={choices.pilots} isSelected={(v) => v === pilotId} onPress={setPilot} />
      </ScrollView>
    </>
  );
}
