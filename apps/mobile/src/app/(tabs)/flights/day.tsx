import { useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Stack, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, HStack, Section, Text, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, disabled as disabledIf, font, foregroundStyle, labelStyle } from '@expo/ui/swift-ui/modifiers';
import { matchesFlight } from '@wingbeat/core/filters';
import { isFlightInProgress, trackerColor, trackerLiveData } from '@wingbeat/core/live';
import { SPEED_THRESHOLD_KMH } from '@wingbeat/core/regions';
import { useAccounts } from '@/lib/accounts-context';
import { origin } from '@/lib/api';
import { useFlightFilter } from '@/lib/flight-filter-context';
import { useFlights } from '@/lib/flights-context';
import { flightRow, presetDateRange } from '@/lib/flights';
import { dayMap, flightTrackPicks, mapDays, pickDetails, positionFeatures, spotDetails, statusCards, type PickedSpot } from '@/lib/live';
import { LiveMap, type LiveMapRef } from '@/lib/live-map';
import { LocationSections } from '@/lib/location-sheet';
import { MapSheet, sheetDetentHeight } from '@/lib/map-sheet';
import { availableBasemaps } from '@/lib/map-style';
import { Placeholder } from '@/lib/placeholder';
import { useTokens } from '@/lib/theme';
import { useFlightsTab } from '@/lib/use-flights-tab';
import { useNow } from '@/lib/use-now';

const SECONDARY = foregroundStyle({ type: 'hierarchical', style: 'secondary' });

/**
 * A day's flights at once (the dashboard's "Map all", from a day header in the list): each
 * track in its tracker's color, numbered at its end, the planes still in the air, and the
 * day's flights in a native sheet over the map, as the flight detail shows one. The list's
 * filter applies. Arrows step to the next older or newer day with tracks; a flight opens its
 * detail; a tap near a track (or a long press anywhere) picks a point, as on the flight detail.
 */
export default function DayScreen() {
  const t = useTokens();
  const router = useRouter();
  const focused = useIsFocused();
  const { day: dayKey } = useLocalSearchParams<{ day: string }>();
  const { active } = useAccounts();
  const { store, lastRefresh, generation } = useFlights();
  const tab = useFlightsTab();
  const { filter, preset } = useFlightFilter();
  const now = useNow(30_000);
  const map = useRef<LiveMapRef>(null);
  const { height: screen } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState<number>();
  const [picked, setPicked] = useState<PickedSpot | null>(null);

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
  const days = useMemo(() => (tz && flights ? mapDays(tz, flights) : []), [tz, flights]);
  const day = useMemo(() => {
    if (!tz || !flights) return null;
    const newestFirst = [...flights].reverse();
    const card = (id: number | null) => cards.find((c) => c.trackerId === id);
    return dayMap(tz, dayKey, flights, {
      colorFor: (id) => (id != null ? trackerColor(trackers, id) : null) ?? t['text-faint'],
      labelFor: (id) => card(id)?.label ?? 'Manual',
      inProgress: (f) => isFlightInProgress(SPEED_THRESHOLD_KMH, f, newestFirst, live),
    });
  }, [dayKey, tz, flights, trackers, cards, live, t]);
  const picks = useMemo(() => flightTrackPicks(day?.flights.map((d) => d.flight) ?? []), [day]);

  if (!tab.ready || !active || !day) return <Placeholder />;
  const info = days.find((d) => d.dayKey === dayKey);
  if (!info || !day.bounds) return <Placeholder text="No flights with a track on this day." />;
  const older = days.find((d) => d.dayKey < dayKey)?.dayKey ?? null;
  const newer = days.findLast((d) => d.dayKey > dayKey)?.dayKey ?? null;
  const go = (key: string) => { setPicked(null); router.setParams({ day: key }); };
  const pick = (spot: PickedSpot | null) => {
    setPicked(spot);
    if (spot) map.current?.reveal(spot.lngLat, { bottom: sheetHeight });
  };
  const planes = positionFeatures(cards, live).features.filter((p) => p.properties?.inFlight);
  const pickedDot = picked
    ? [{ type: 'Feature' as const, id: 'picked', geometry: { type: 'Point' as const, coordinates: picked.lngLat }, properties: { color: t['accent'] } }]
    : [];
  const roster = tab.roster;
  const iconButton = (label: string, systemImage: 'chevron.left' | 'chevron.right' | 'xmark', onPress: () => void, disabled = false) => (
    <Button label={label} systemImage={systemImage} onPress={onPress}
      modifiers={[buttonStyle('glass'), labelStyle('iconOnly'), disabledIf(disabled)]} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: t['bg-base'] }}>
      <Stack.Screen options={{ title: '' }} />
      <LiveMap
        ref={map}
        basemaps={availableBasemaps(tab.bootstrap)}
        overlays={tab.bootstrap.overlays}
        origin={origin(active.host)}
        initialView={{ bounds: day.bounds, padding: { top: 120, right: 40, bottom: 120, left: 40 } }}
        // Once the sheet is up, and again on each day.
        fit={sheetHeight ? day.bounds : undefined}
        fitKey={dayKey}
        sheetHeight={sheetHeight}
        positions={{ type: 'FeatureCollection', features: [...day.points.features, ...planes, ...pickedDot] }}
        tracks={day.tracks}
        picks={picks}
        onPress={(lngLat, zoom) => pick(pickDetails(tab.tz, lngLat, zoom, picks, (tid) => trackers.find((tr) => tr.id === tid) ?? null))}
        onLongPress={(lngLat) => pick(spotDetails(tab.tz, lngLat))}
      />
      <MapSheet title={picked ? (picked.snapped ? 'On route' : 'Off route') : info.title}
        summary={picked ? picked.coords : info.count + (info.count === 1 ? ' flight' : ' flights')}
        isPresented={focused}
        actions={picked ? iconButton('Close', 'xmark', () => setPicked(null)) : (
          <HStack spacing={8}>
            {iconButton('Older day', 'chevron.left', () => older && go(older), !older)}
            {iconButton('Newer day', 'chevron.right', () => newer && go(newer), !newer)}
          </HStack>
        )}
        onHeight={setSheetHeight}
        onDetent={(d) => {
          if (d === 'large') return;
          if (picked) map.current?.reveal(picked.lngLat, { bottom: sheetDetentHeight(d, screen) });
          else if (day.bounds) map.current?.fitBounds(day.bounds, { bottom: sheetDetentHeight(d, screen) });
        }}>
        {picked ? <LocationSections details={picked} /> : (
          <Section>
            {day.flights.map(({ flight, n, color }) => {
              const row = flightRow(tab.tz, flight, roster);
              return (
                <Button key={flight.id} onPress={() => router.push({ pathname: '/flights/[id]', params: { id: String(flight.id) } })}>
                  <HStack spacing={12}>
                    <Text modifiers={[font({ weight: 'bold' }), foregroundStyle(color)]}>{String(n)}</Text>
                    <VStack alignment="leading" spacing={2}>
                      <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}>
                        {row.time + (row.duration ? ' ' + row.duration : '')}
                      </Text>
                      {[row.route, row.assignment].filter((s): s is string => !!s).map((s) => (
                        <Text key={s} modifiers={[font({ textStyle: 'footnote' }), SECONDARY]}>{s}</Text>
                      ))}
                    </VStack>
                  </HStack>
                </Button>
              );
            })}
          </Section>
        )}
      </MapSheet>
    </View>
  );
}
