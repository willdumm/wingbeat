import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { isFlightInProgress, trackerColor, trackerLiveData } from '@wingbeat/core/live';
import { SPEED_THRESHOLD_KMH } from '@wingbeat/core/regions';
import { useAccounts } from '@/lib/accounts-context';
import { origin } from '@/lib/api';
import { useBootstrap } from '@/lib/bootstrap-context';
import { DayBanner } from '@/lib/day-banner';
import { useFlights } from '@/lib/flights-context';
import { dayMap, inFlightTracks, initialView, mapDays, positionFeatures, statusCards } from '@/lib/live';
import { LiveMap, type LiveMapRef } from '@/lib/live-map';
import { PanelRow, PanelSection, type MapTool } from '@/lib/map-tools';
import { availableBasemaps } from '@/lib/map-style';
import { Placeholder } from '@/lib/placeholder';
import { StatusCards } from '@/lib/status-cards';
import { useTokens } from '@/lib/theme';
import { useFlightsTab } from '@/lib/use-flights-tab';
import { useNow } from '@/lib/use-now';

/** How many of the newest days with flights the Day tool lists. */
const DAYS_LISTED = 90;

/**
 * The live view (each tracker's position and the track of each flight in progress, with the
 * status cards), or with the Day tool a day's flights at once (the dashboard's "Map all").
 */
export default function LiveScreen() {
  const t = useTokens();
  const { loaded, active } = useAccounts();
  const { bootstrap, handshake } = useBootstrap();
  const { store, lastRefresh, generation } = useFlights();
  const tab = useFlightsTab();
  const map = useRef<LiveMapRef>(null);
  const now = useNow(30_000);  // the cards' "GPS 5 min ago"
  const [dayKey, setDayKey] = useState<string | null>(null);

  const trackers = useMemo(() => bootstrap?.trackers.filter((tr) => tr.active && !tr.deleted) ?? [], [bootstrap]);
  const live = useMemo(
    () => (store ? trackerLiveData(trackers, store.getRaw, lastRefresh) : {}),
    [store, trackers, lastRefresh, generation],
  );
  const cards = useMemo(() => statusCards(trackers, live, now, t['text-faint']), [trackers, live, now, t]);
  const positions = useMemo(() => positionFeatures(cards, live), [cards, live]);
  const tracks = useMemo(() => inFlightTracks(cards, store?.getRaw ?? (() => [])), [store, cards, generation]);

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
    return <Placeholder text="Loading…" />;
  }

  const dayTool: MapTool = {
    id: 'day',
    icon: 'calendar',
    label: 'Day',
    active: dayKey != null,
    panel: (close) => (
      <>
        <PanelRow label="Live" detail="Flights in progress" on={dayKey == null} onPress={() => { setDayKey(null); close(); }} />
        <PanelSection title="Map a day’s flights">
          {days.slice(0, DAYS_LISTED).map((d) => (
            <PanelRow key={d.dayKey} label={d.title} detail={String(d.count)} on={d.dayKey === dayKey}
              onPress={() => { setDayKey(d.dayKey); close(); }} />
          ))}
          {!days.length && <PanelRow label="No flights with a track yet" onPress={close} />}
        </PanelSection>
      </>
    ),
  };

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
        banner={dayKey && <DayBanner days={days} dayKey={dayKey} legend={day?.legend ?? []} onPick={setDayKey} />}
      />
      {!dayKey && <StatusCards cards={cards} onSelect={(c) => c.position && map.current?.flyTo(c.position)} />}
    </View>
  );
}
