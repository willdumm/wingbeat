import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { locationDetails, trackerLiveData } from '@wingbeat/core/live';
import { useAccounts } from '@/lib/accounts-context';
import { origin } from '@/lib/api';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useFlights } from '@/lib/flights-context';
import { groundTrailFeatures, initialView, latestTracks, liveBounds, liveTrackPicks, pickDetails, positionFeatures, spotDetails, statusCards, type PickedSpot } from '@/lib/live';
import { LiveMap, type LiveMapRef } from '@/lib/live-map';
import { LocationSheet } from '@/lib/location-sheet';
import { sheetDetentHeight } from '@/lib/map-sheet';
import { availableBasemaps } from '@/lib/map-style';
import { Placeholder } from '@/lib/placeholder';
import { StatusCards } from '@/lib/status-cards';
import { useTokens } from '@/lib/theme';
import { useFlightsTab } from '@/lib/use-flights-tab';
import { useNow } from '@/lib/use-now';

/**
 * The live view: each tracker's position and the track of its current or latest flight (the
 * dashboard's default view), fitted each time the tab comes up, with the status cards along
 * the top; tapping one flies to it and opens its location details, a tap on the map near a
 * drawn track opens that track point's, and a long press anywhere the pressed spot's. A day's
 * flights at once (the dashboard's "Map all") are on the Flights tab's day headers.
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
  // Each visit to the tab refits the map to the tracks.
  const focused = useIsFocused();
  const [visits, setVisits] = useState(0);
  useEffect(() => { if (focused) setVisits((v) => v + 1); }, [focused]);
  const [selected, setSelected] = useState<number | null>(null);
  const [picked, setPicked] = useState<PickedSpot | null>(null);

  const trackers = useMemo(() => bootstrap?.trackers.filter((tr) => tr.active && !tr.deleted) ?? [], [bootstrap]);
  const live = useMemo(
    () => (store ? trackerLiveData(trackers, store.getRaw, lastRefresh) : {}),
    [store, trackers, lastRefresh, generation],
  );
  const cards = useMemo(() => statusCards(trackers, live, now, t['text-faint']), [trackers, live, now, t]);
  const positions = useMemo(() => positionFeatures(cards, live, { trails: true }), [cards, live]);
  const tracks = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: [...latestTracks(cards, store?.getRaw ?? (() => [])).features, ...groundTrailFeatures(cards, live).features],
  }), [store, cards, live, generation]);
  const bounds = useMemo(() => liveBounds(tracks, positions), [tracks, positions]);

  const tz = tab.ready ? tab.tz : null;
  const flights = tab.ready ? tab.flights : null;
  // What a tap on the map snaps to: the tracks drawn.
  const picks = useMemo(() => liveTrackPicks(cards, live, store?.getRaw ?? (() => [])), [cards, live, store, generation]);

  // The map waits for the bootstrap, which has the basemaps and the default view.
  if (!loaded || !active || active.signedOut || handshake === 'server-too-old' || !bootstrap) {
    return <Placeholder />;
  }

  const selectedCard = cards.find((c) => c.trackerId === selected) ?? null;
  const pilotName = selected != null ? flights?.findLast((f) => f.tracker_id === selected)?.pilot_name : null;
  const details = selectedCard
    ? locationDetails(now, trackers.find((tr) => tr.id === selected) ?? null, live[selectedCard.trackerId], pilotName)
    : null;
  // The sheet opens at half the screen: a picked point under it pans up into view.
  const pick = (spot: PickedSpot | null) => {
    setSelected(null);
    setPicked(spot);
    if (spot) map.current?.reveal(spot.lngLat, { bottom: sheetDetentHeight('medium', screen) });
  };
  const pickedDot: GeoJSON.Feature<GeoJSON.Point> | null = picked
    && { type: 'Feature', id: 'picked', geometry: { type: 'Point', coordinates: picked.lngLat }, properties: { color: t['accent'] } };

  return (
    <View style={{ flex: 1, backgroundColor: t['bg-base'] }}>
      <LiveMap
        ref={map}
        basemaps={availableBasemaps(bootstrap)}
        overlays={bootstrap.overlays}
        origin={origin(active.host)}
        initialView={initialView(bootstrap.instance, cards)}
        positions={pickedDot ? { type: 'FeatureCollection', features: [...positions.features, pickedDot] } : positions}
        tracks={tracks}
        fit={bounds}
        // Again once the tracks load, if the positions came first.
        fitKey={visits + ':' + (tracks.features.length > 0)}
        picks={picks}
        onPress={(lngLat, zoom) => {
          // Away from a track, a tap closes the sheet, as in Maps.
          if (tz) pick(pickDetails(tz, lngLat, zoom, picks, (id) => trackers.find((tr) => tr.id === id) ?? null));
        }}
        onLongPress={(lngLat) => { if (tz) pick(spotDetails(tz, lngLat)); }}
        topBar={cards.length > 0 && (
          <StatusCards cards={cards} onSelect={(c) => {
            // Centered above the location sheet, which opens at half the screen.
            if (c.position) map.current?.flyTo(c.position, { bottom: sheetDetentHeight('medium', screen) });
            setPicked(null);
            setSelected(c.trackerId);
          }} />
        )}
      />
      {/* A status card's tracker, or a tap on the map (the web's point picker): one sheet, so one replaces the other in place. */}
      <LocationSheet title={picked ? (picked.snapped ? 'On route' : 'Off route') : selectedCard?.label ?? ''} details={picked ?? details}
        onClose={() => { setPicked(null); setSelected(null); }} />
    </View>
  );
}
