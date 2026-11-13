import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Stack, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Form, Host, LabeledContent, Section, Text, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { trackerColor } from '@wingbeat/core/live';
import { useAccounts } from '@/lib/accounts-context';
import { origin } from '@/lib/api';
import { flightDetail, flightTrack } from '@/lib/flights';
import { HeaderButton } from '@/lib/header-button';
import { LiveMap, type LiveMapRef } from '@/lib/live-map';
import { MapSheet, sheetDetentHeight } from '@/lib/map-sheet';
import { availableBasemaps } from '@/lib/map-style';
import { Placeholder } from '@/lib/placeholder';
import { useTokens } from '@/lib/theme';
import { useFlightsTab } from '@/lib/use-flights-tab';

const SECONDARY = foregroundStyle({ type: 'hierarchical', style: 'secondary' });

/**
 * One flight: its track on the full-screen map (or its named points), with its date, times,
 * labels and assignment in a native sheet over the map; without a map, in a plain form.
 */
export default function FlightScreen() {
  const t = useTokens();
  const router = useRouter();
  const focused = useIsFocused();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { active } = useAccounts();
  const tab = useFlightsTab();
  const flight = tab.ready ? tab.flights.find((f) => f.id === Number(id)) ?? null : null;
  const trackers = tab.ready ? tab.bootstrap.trackers : null;
  const track = useMemo(() => flight && trackers && flightTrack(flight, {
    track: (flight.tracker_id != null ? trackerColor(trackers, flight.tracker_id) : null) ?? t['accent'],
    start: t['success-dot'],
    end: t['danger'],
  }), [flight, trackers, t]);
  // Edit opens a modal, which can't come up while the sheet is: the sheet goes first, and
  // comes back with the screen.
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!focused) setEditing(false); }, [focused]);
  const [sheetHeight, setSheetHeight] = useState<number>();
  const map = useRef<LiveMapRef>(null);
  const { height: screen } = useWindowDimensions();

  if (!tab.ready || !active) return <Placeholder text="Loading…" />;
  if (!flight || !track) return <Placeholder text="This flight isn’t in the list any more." />;
  const detail = flightDetail(tab.tz, flight, tab.roster);
  const edit = () => router.push({ pathname: '/flights/assign', params: { id: String(flight.id) } });
  const notes = [detail.manual && 'Manual entry', !track.line.features.length && 'No track recorded'].filter(Boolean).join(' · ');
  const sections = (
    <>
      <Section footer={notes ? <Text>{notes}</Text> : undefined}>
        {detail.fields.map((field) => (
          <LabeledContent key={field.label} label={field.label}>
            {field.tracker ? (
              <VStack alignment="trailing" spacing={2}>
                <Text>{field.value + ' †'}</Text>
                <Text modifiers={[font({ textStyle: 'footnote' }), SECONDARY]}>{field.tracker}</Text>
              </VStack>
            ) : <Text>{field.value}</Text>}
          </LabeledContent>
        ))}
      </Section>
      {detail.remarks.length > 0 && (
        <Section title="Remarks">
          {detail.remarks.map((r, i) => <Text key={i}>{r}</Text>)}
        </Section>
      )}
    </>
  );
  return (
    <View style={{ flex: 1, backgroundColor: t['bg-base'] }}>
      <Stack.Screen options={{
        // The date and Edit head the sheet over the map; without a map, the header.
        title: track.bounds ? '' : detail.title,
        headerRight: tab.isAdmin && !track.bounds ? () => <HeaderButton title="Edit" onPress={edit} /> : undefined,
      }} />
      {track.bounds ? (
        <>
          <LiveMap
            ref={map}
            basemaps={availableBasemaps(tab.bootstrap)}
            overlays={tab.bootstrap.overlays}
            origin={origin(active.host)}
            initialView={{ bounds: track.bounds, padding: { top: 120, right: 40, bottom: 120, left: 40 } }}
            // Once the sheet is up, so the track fits above it.
            fit={sheetHeight ? track.bounds : undefined}
            sheetHeight={sheetHeight}
            positions={track.ends}
            tracks={track.line}
          />
          <MapSheet title={detail.title} summary={detail.summary} isPresented={focused && !editing}
            actions={tab.isAdmin ? <Button label="Edit" onPress={() => setEditing(true)} modifiers={[buttonStyle('glass')]} /> : undefined}
            onHeight={setSheetHeight} onDismiss={() => { if (editing) edit(); }}
            // Refit the track above the sheet as it settles, but not under a full-screen one.
            onDetent={(d) => { if (d !== 'large' && track.bounds) map.current?.fitBounds(track.bounds, { bottom: sheetDetentHeight(d, screen) }); }}>
            {sections}
          </MapSheet>
        </>
      ) : (
        <Host style={{ flex: 1 }}><Form>{sections}</Form></Host>
      )}
    </View>
  );
}
