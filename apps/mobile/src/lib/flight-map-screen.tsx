/**
 * The Flights tab's map: a day's flights at once (the dashboard's "Map all", from a day
 * header in the list) or one flight (from a row), on the full-screen map with a native sheet
 * over it. A flight tapped in a day's sheet takes the day's place on the same screen, map and
 * sheet, with a back button to the day; no new screen slides in.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Stack, useIsFocused, useRouter, useSegments } from 'expo-router';
import { Button, Form, Host, HStack, LabeledContent, Section, Text, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, disabled as disabledIf, font, foregroundStyle, labelStyle } from '@expo/ui/swift-ui/modifiers';
import { matchesFlight } from '@wingbeat/core/filters';
import { isFlightInProgress, trackerColor, trackerLiveData } from '@wingbeat/core/live';
import { SPEED_THRESHOLD_KMH } from '@wingbeat/core/regions';
import { useAccounts } from './accounts-context';
import { origin } from './api';
import { useFlightFilter } from './flight-filter-context';
import { useFlights } from './flights-context';
import { flightDetail, flightRow, flightTrack, presetDateRange } from './flights';
import { dayMap, flightTrackPicks, mapDays, pickDetails, pickedFeature, positionFeatures, spotDetails, statusCards, type PickedSpot } from './live';
import { LiveMap, type LiveMapRef } from './live-map';
import { LocationSections } from './location-sheet';
import { MapSheet, sheetDetentHeight } from './map-sheet';
import { availableBasemaps } from './map-style';
import { Placeholder } from './placeholder';
import { useTokens } from './theme';
import { useFlightsTab } from './use-flights-tab';
import { useNow } from './use-now';

const SECONDARY = foregroundStyle({ type: 'hierarchical', style: 'secondary' });
const FIT_PADDING = { top: 120, right: 40, bottom: 120, left: 40 };

/**
 * dayKey: a day's flights (the list's filter applies; arrows step to the next older or newer
 * day with tracks, through onDay). flightId: one flight, its track with its takeoff and landing
 * (or its named points), its date, times, labels and assignment; without a map, a plain form.
 * Either way a tap near a track (or a long press anywhere) picks a point, whose location
 * details take the sheet's place, as a place does in Maps, until it's closed.
 */
export function FlightMapScreen({ dayKey, flightId, onDay }: { dayKey?: string; flightId?: number; onDay?: (dayKey: string) => void }) {
  const t = useTokens();
  const router = useRouter();
  // The tab whose stack the screen is in (Flights, or Duty from a flight in the log), for Edit.
  const stack = useSegments()[1] === 'duty' ? 'duty' : 'flights';
  const focused = useIsFocused();
  const { active } = useAccounts();
  const { store, lastRefresh, generation } = useFlights();
  const tab = useFlightsTab();
  const { filter, preset } = useFlightFilter();
  const now = useNow(30_000);
  const map = useRef<LiveMapRef>(null);
  const { height: screen } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState<number>();
  const [picked, setPicked] = useState<PickedSpot | null>(null);
  // The day's flight shown in its place.
  const [chosen, setChosen] = useState<number | null>(null);
  // Edit opens a modal, which can't come up while the sheet is: the sheet goes first, and
  // comes back with the screen.
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!focused) setEditing(false); }, [focused]);

  const tz = tab.ready ? tab.tz : null;
  const trackers = useMemo(() => (tab.ready ? tab.bootstrap.trackers.filter((tr) => tr.active && !tr.deleted) : []), [tab.ready && tab.bootstrap]);
  // The list's flights: its filter and date preset.
  const flights = useMemo(() => {
    if (!tab.ready) return null;
    const applied = { ...filter, ...presetDateRange(tab.tz, now, preset) };
    return tab.flights.filter((f) => matchesFlight(tab.tz, f, applied));
  }, [tab.ready && tab.flights, tz, filter, preset]);
  const live = useMemo(
    () => (store ? trackerLiveData(trackers, store.getRaw, lastRefresh) : {}),
    [store, trackers, lastRefresh, generation],
  );
  const cards = useMemo(() => statusCards(trackers, live, now, t['text-faint']), [trackers, live, now, t]);
  const days = useMemo(() => (tz && flights && dayKey ? mapDays(tz, flights) : []), [tz, flights, dayKey]);
  const day = useMemo(() => {
    if (!tz || !flights || !dayKey) return null;
    const newestFirst = [...flights].reverse();
    const card = (id: number | null) => cards.find((c) => c.trackerId === id);
    return dayMap(tz, dayKey, flights, {
      colorFor: (id) => (id != null ? trackerColor(trackers, id) : null) ?? t['text-faint'],
      labelFor: (id) => card(id)?.label ?? 'Manual',
      inProgress: (f) => isFlightInProgress(SPEED_THRESHOLD_KMH, f, newestFirst, live),
    });
  }, [dayKey, tz, flights, trackers, cards, live, t]);
  const shownId = flightId ?? chosen;
  const flight = tab.ready && shownId != null ? tab.findFlight(shownId) : null;
  const track = useMemo(() => flight && flightTrack(flight, {
    track: (flight.tracker_id != null ? trackerColor(trackers, flight.tracker_id) : null) ?? t['accent'],
    start: t['success-dot'],
    end: t['danger'],
  }), [flight, trackers, t]);
  const picks = useMemo(() => flightTrackPicks(flight ? [flight] : day?.flights.map((d) => d.flight) ?? []), [flight, day]);

  if (!tab.ready || !active) return <Placeholder />;
  if (dayKey == null && (!flight || !track)) return <Placeholder text="This flight isn’t in the list any more." />;
  const info = days.find((d) => d.dayKey === dayKey);
  if (dayKey != null && (!day || !info || !day.bounds)) return <Placeholder text="No flights with a track on this day." />;

  const show = (id: number | null) => { setPicked(null); setChosen(id); };
  const pick = (spot: PickedSpot | null) => {
    setPicked(spot);
    if (spot) map.current?.reveal(spot.lngLat, { bottom: sheetHeight });
  };
  const pickedDot = picked
    ? [pickedFeature(picked, t['accent'])]
    : [];
  const iconButton = (label: string, systemImage: 'chevron.left' | 'chevron.right' | 'xmark', onPress: () => void, disabled = false) => (
    <Button label={label} systemImage={systemImage} onPress={onPress}
      modifiers={[buttonStyle('glass'), labelStyle('iconOnly'), disabledIf(disabled)]} />
  );

  // One flight: from the list, or from the day.
  const one = flight && track && (() => {
    const detail = flightDetail(tab.tz, flight, tab.roster);
    const edit = () => router.push({ pathname: `/${stack}/assign`, params: { id: String(flight.id) } });
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
    return { detail, edit, sections };
  })();

  // A flight without a map (from the list only: a day lists flights with a track).
  if (one && !track!.bounds) {
    return (
      <View style={{ flex: 1, backgroundColor: t['bg-base'] }}>
        <Stack.Screen options={{ title: one.detail.title }} />
        {tab.isAdmin && (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button onPress={one.edit}>Edit</Stack.Toolbar.Button>
          </Stack.Toolbar>
        )}
        <Host style={{ flex: 1 }}><Form>{one.sections}</Form></Host>
      </View>
    );
  }

  const bounds = one ? track!.bounds! : day!.bounds!;
  const positions = one
    ? [...track!.ends.features, ...pickedDot]
    : [...day!.points.features, ...positionFeatures(cards, live).features.filter((p) => p.properties?.inFlight), ...pickedDot];
  const sheet = picked ? {
    title: picked.snapped ? 'On route' : 'Off route',
    summary: picked.coords,
    actions: iconButton('Close', 'xmark', () => setPicked(null)),
    content: <LocationSections details={picked} />,
  } : one ? {
    title: one.detail.title,
    summary: one.detail.summary,
    // Back to the day it was picked from.
    leading: chosen != null ? iconButton('Back to the day', 'chevron.left', () => show(null)) : undefined,
    actions: tab.isAdmin ? <Button label="Edit" onPress={() => setEditing(true)} modifiers={[buttonStyle('glass')]} /> : undefined,
    content: one.sections,
  } : (() => {
    const older = days.find((d) => d.dayKey < dayKey!)?.dayKey ?? null;
    const newer = days.findLast((d) => d.dayKey > dayKey!)?.dayKey ?? null;
    const go = (key: string) => { setPicked(null); onDay?.(key); };
    return {
      title: info!.title,
      summary: info!.count + (info!.count === 1 ? ' flight' : ' flights'),
      actions: (
        <HStack spacing={8}>
          {iconButton('Older day', 'chevron.left', () => older && go(older), !older)}
          {iconButton('Newer day', 'chevron.right', () => newer && go(newer), !newer)}
        </HStack>
      ),
      content: (
        <Section>
          {day!.flights.map(({ flight: f, n, color }) => {
            const row = flightRow(tab.tz, f, tab.roster);
            return (
              <Button key={f.id} onPress={() => show(f.id)}>
                <HStack spacing={12}>
                  <Text modifiers={[font({ weight: 'bold' }), foregroundStyle(color)]}>{String(n)}</Text>
                  <VStack alignment="leading" spacing={2}>
                    {/* The text's own colors: a button's hierarchical styles take its blue tint, faint over the map. */}
                    <Text modifiers={[foregroundStyle(t['text-primary'])]}>
                      {row.time + (row.duration ? ' ' + row.duration : '')}
                    </Text>
                    {[row.route, row.assignment].filter((s): s is string => !!s).map((s) => (
                      <Text key={s} modifiers={[font({ textStyle: 'footnote' }), foregroundStyle(t['text-muted'])]}>{s}</Text>
                    ))}
                  </VStack>
                </HStack>
              </Button>
            );
          })}
        </Section>
      ),
    };
  })();

  return (
    <View style={{ flex: 1, backgroundColor: t['bg-base'] }}>
      {/* The date and Edit head the sheet over the map. */}
      <Stack.Screen options={{ title: '' }} />
      <LiveMap
        ref={map}
        basemaps={availableBasemaps(tab.bootstrap)}
        overlays={tab.bootstrap.overlays}
        origin={origin(active.host)}
        initialView={{ bounds, padding: FIT_PADDING }}
        // Once the sheet is up, so the tracks fit above it, and again on each day or flight.
        fit={sheetHeight ? bounds : undefined}
        fitKey={dayKey + ':' + shownId}
        sheetHeight={sheetHeight}
        positions={{ type: 'FeatureCollection', features: positions }}
        tracks={one ? track!.line : day!.tracks}
        picks={picks}
        // Away from the tracks, a tap goes back to the day or the flight.
        onPress={(lngLat, zoom) => pick(pickDetails(tab.tz, lngLat, zoom, picks, (tid) => tab.bootstrap.trackers.find((tr) => tr.id === tid) ?? null))}
        onLongPress={(lngLat) => pick(spotDetails(tab.tz, lngLat))}
      />
      <MapSheet title={sheet.title} summary={sheet.summary} leading={'leading' in sheet ? sheet.leading : undefined} actions={sheet.actions}
        isPresented={focused && !editing}
        onHeight={setSheetHeight} onDismiss={() => { if (editing) one?.edit(); }}
        // As it settles (but not full screen): the picked point into view above it, else the tracks.
        onDetent={(d) => {
          if (d === 'large') return;
          if (picked) map.current?.reveal(picked.lngLat, { bottom: sheetDetentHeight(d, screen) });
          else map.current?.fitBounds(bounds, { bottom: sheetDetentHeight(d, screen) });
        }}>
        {sheet.content}
      </MapSheet>
    </View>
  );
}
