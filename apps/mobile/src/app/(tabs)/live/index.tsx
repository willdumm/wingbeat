import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Button, Picker, Section, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { isFlightInProgress, locationDetails, trackerColor, trackerLiveData } from '@wingbeat/core/live';
import { unixToTzDateStr } from '@wingbeat/core/time';
import { SPEED_THRESHOLD_KMH } from '@wingbeat/core/regions';
import { useAccounts } from '@/lib/accounts-context';
import { origin } from '@/lib/api';
import { useBootstrap } from '@/lib/bootstrap-context';
import { DayBanner } from '@/lib/day-banner';
import { DayPickerSheet } from '@/lib/day-picker-sheet';
import { useFlights } from '@/lib/flights-context';
import { dayMap, groundTrailFeatures, inFlightTracks, initialView, mapDays, positionFeatures, statusCards } from '@/lib/live';
import { LiveMap, type LiveMapRef } from '@/lib/live-map';
import { LocationSheet } from '@/lib/location-sheet';
import { sheetDetentHeight } from '@/lib/map-sheet';
import type { MapTool } from '@/lib/map-tools';
import { availableBasemaps } from '@/lib/map-style';
import { Placeholder } from '@/lib/placeholder';
import { StatusCards } from '@/lib/status-cards';
import { useTokens } from '@/lib/theme';
import { useFlightsTab } from '@/lib/use-flights-tab';
import { useNow } from '@/lib/use-now';

/** How many of the newest days with flights the Day menu lists (the calendar has the rest). */
const DAYS_LISTED = 30;
/** The Day menu's pick for the live view. */
const LIVE = 'live';

/**
 * The live view (each tracker's position and the track of each flight in progress, with the
 * status cards along the top; tapping one flies to it and opens its location details), or
 * with the Day tool a day's flights at once (the dashboard's "Map all").
 */
export default function LiveScreen() {
  const t = useTokens();
  const { loaded, active } = useAccounts();
  const { bootstrap, handshake } = useBootstrap();
  const { store, lastRefresh, generation } = useFlights();
  const tab = useFlightsTab();
  const map = useRef<LiveMapRef>(null);
  const { height: screen } = useWindowDimensions();
  const now = useNow(30_000);  // the cards' "GPS 5 min ago"
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const trackers = useMemo(() => bootstrap?.trackers.filter((tr) => tr.active && !tr.deleted) ?? [], [bootstrap]);
  const live = useMemo(
    () => (store ? trackerLiveData(trackers, store.getRaw, lastRefresh) : {}),
    [store, trackers, lastRefresh, generation],
  );
  const cards = useMemo(() => statusCards(trackers, live, now, t['text-faint']), [trackers, live, now, t]);
  const positions = useMemo(() => positionFeatures(cards, live, { trails: true }), [cards, live]);
  const tracks = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: [...inFlightTracks(cards, store?.getRaw ?? (() => [])).features, ...groundTrailFeatures(cards, live).features],
  }), [store, cards, live, generation]);

  const tz = tab.ready ? tab.tz : null;
  const flights = tab.ready ? tab.flights : null;
  const days = useMemo(() => (tz && flights ? mapDays(tz, flights) : []), [tz, flights]);
  const day = useMemo(() => {
    if (!dayKey || !tz || !flights) return null;
    const newestFirst = [...flights].reverse();
    const card = (id: number | null) => cards.find((c) => c.trackerId === id);
    return dayMap(tz, dayKey, flights, {
      colorFor: (id) => (id != null ? trackerColor(trackers, id) : null) ?? t['text-faint'],
      labelFor: (id) => card(id)?.label ?? 'Manual',
      inProgress: (f) => isFlightInProgress(SPEED_THRESHOLD_KMH, f, newestFirst, live),
    });
  }, [dayKey, tz, flights, trackers, cards, live, t]);

  // Fits the day when it's picked, not when a refresh redraws it.
  const dayBounds = day?.bounds;
  useEffect(() => {
    if (dayBounds) map.current?.fitBounds(dayBounds);
  }, [dayKey, !!dayBounds]);

  // The map waits for the bootstrap, which has the basemaps and the default view.
  if (!loaded || !active || active.signedOut || handshake === 'server-too-old' || !bootstrap) {
    return <Placeholder />;
  }

  const dayTool: MapTool = {
    id: 'day',
    icon: 'calendar',
    label: 'Day',
    active: dayKey != null,
    menu: (
      <>
        <Picker label="Day" selection={dayKey ?? LIVE} modifiers={[pickerStyle('inline')]}
          onSelectionChange={(key: string) => setDayKey(key === LIVE ? null : key)}>
          <Text modifiers={[tag(LIVE)]}>Live</Text>
          {days.slice(0, DAYS_LISTED).map((d) => (
            <Text key={d.dayKey} modifiers={[tag(d.dayKey)]}>{d.title + ' · ' + d.count + (d.count === 1 ? ' flight' : ' flights')}</Text>
          ))}
        </Picker>
        <Section>
          <Button label="Choose a Date…" systemImage="calendar.badge.clock" onPress={() => setCalendarOpen(true)} />
        </Section>
      </>
    ),
  };

  const selectedCard = cards.find((c) => c.trackerId === selected) ?? null;
  const pilotName = selected != null ? flights?.findLast((f) => f.tracker_id === selected)?.pilot_name : null;
  const details = selectedCard
    ? locationDetails(now, trackers.find((tr) => tr.id === selected) ?? null, live[selectedCard.trackerId], pilotName)
    : null;
  const today = tz ? unixToTzDateStr(tz, now) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t['bg-base'] }}>
      <LiveMap
        ref={map}
        basemaps={availableBasemaps(bootstrap)}
        overlays={bootstrap.overlays}
        origin={origin(active.host)}
        initialView={initialView(bootstrap.instance, cards)}
        positions={day ? { type: 'FeatureCollection', features: [...day.points.features, ...positions.features.filter((p) => p.properties?.inFlight)] } : positions}
        tracks={day ? day.tracks : tracks}
        tools={[dayTool]}
        overlay={dayKey && <DayBanner days={days} dayKey={dayKey} legend={day?.legend ?? []} onPick={setDayKey} />}
        topBar={!dayKey && cards.length > 0 && (
          <StatusCards cards={cards} onSelect={(c) => {
            // Centered above the location sheet, which opens at half the screen.
            if (c.position) map.current?.flyTo(c.position, { bottom: sheetDetentHeight('medium', screen) });
            setSelected(c.trackerId);
          }} />
        )}
      />
      <LocationSheet title={selectedCard?.label ?? ''} details={details} onClose={() => setSelected(null)} />
      {today && (
        <DayPickerSheet open={calendarOpen} dayKey={dayKey ?? today} first={days.at(-1)?.dayKey ?? null} today={today}
          onPick={setDayKey} onClose={() => setCalendarOpen(false)} />
      )}
    </View>
  );
}
