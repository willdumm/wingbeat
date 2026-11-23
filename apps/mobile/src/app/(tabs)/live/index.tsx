import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { activeTrackers, locationDetails, trackerLiveData } from '@wingbeat/core/live';
import { useAccounts } from '@/lib/accounts-context';
import { origin } from '@/lib/api';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useFlights } from '@/lib/flights-context';
import { groundTrailFeatures, initialView, latestTracks, liveBounds, liveTrackPicks, pickDetails, pickedFeature, positionFeatures, spotDetails, statusCards, trackStarts, type PickedSpot } from '@/lib/live';
import { LiveMap, type LiveMapRef } from '@/lib/live-map';
import { LocationSheet } from '@/lib/location-sheet';
import { sheetDetentHeight } from '@/lib/map-sheet';
import { availableBasemaps } from '@wingbeat/core/map-style';
import { Placeholder } from '@/lib/placeholder';
import { accountPrefKey, parseLivePinned } from '@/lib/prefs';
import { StatusCards } from '@/lib/status-cards';
import { useStoredState } from '@/lib/stored-state';
import { px, useTokens } from '@/lib/theme';
import { useFlightsTab } from '@/lib/use-flights-tab';
import { useNow } from '@/lib/use-now';

/**
 * The live view: each tracker's position and the track of its current or latest flight, with a
 * dot where it took off (the dashboard's default view), fitted each time the tab comes up, again
 * when a new point comes in (once the map's been left alone a few seconds), and by the Fit all
 * tool, with the status cards stacked along the top (the pinned ones, or the one that last
 * reported; status-cards.tsx); tapping one flies to it and opens its location details, a tap on the map near a drawn track opens that track point's, and a long press
 * anywhere the pressed spot's. A day's flights at once (the dashboard's "Map all") are on the
 * Flights tab's day headers. A `tracker` param (a notification tap, push.ts) selects that
 * tracker as its card would.
 */
export default function LiveScreen() {
  const t = useTokens();
  const { loaded, active } = useAccounts();
  const { bootstrap, handshake } = useBootstrap();
  const { store, lastRefresh, generation } = useFlights();
  const tab = useFlightsTab();
  const map = useRef<LiveMapRef>(null);
  const { height: screen, width: screenWidth } = useWindowDimensions();
  const now = useNow(30_000);  // the cards' "GPS 5 min ago"
  // Each visit to the tab refits the map to the tracks.
  const focused = useIsFocused();
  const [visits, setVisits] = useState(0);
  useEffect(() => { if (focused) setVisits((v) => v + 1); }, [focused]);
  const [selected, setSelected] = useState<number | null>(null);
  const [picked, setPicked] = useState<PickedSpot | null>(null);
  const [pinned, setPinned] = useStoredState(active ? accountPrefKey(active.host, active.user.id, 'live-pinned') : null, parseLivePinned);
  const router = useRouter();
  const { tracker: trackerParam } = useLocalSearchParams<{ tracker?: string }>();

  const trackers = useMemo(() => activeTrackers(bootstrap?.trackers ?? []), [bootstrap]);
  const live = useMemo(
    () => (store ? trackerLiveData(trackers, store.getRaw, lastRefresh) : {}),
    [store, trackers, lastRefresh, generation],
  );
  const cards = useMemo(() => statusCards(trackers, live, now, t['text-faint']), [trackers, live, now, t]);
  const latest = useMemo(() => latestTracks(cards, store?.getRaw ?? (() => [])), [store, cards, generation]);
  // Each latest track's takeoff dot under the planes and pilots.
  const positions = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: [...trackStarts(latest).features, ...positionFeatures(cards, live, { trails: true }).features],
  }), [latest, cards, live]);
  const tracks = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: [...latest.features, ...groundTrailFeatures(cards, live).features],
  }), [latest, cards, live]);
  const bounds = useMemo(() => liveBounds(tracks, positions), [tracks, positions]);
  // Changes with each tracker's newest fix: the map refits to take it in.
  const fixes = Object.values(live).map((d) => d?.garmin_time ?? '').join(',');

  const tz = tab.ready ? tab.tz : null;
  const flights = tab.ready ? tab.flights : null;
  // What a tap on the map snaps to: the tracks drawn.
  const picks = useMemo(() => liveTrackPicks(cards, live, store?.getRaw ?? (() => [])), [cards, live, store, generation]);

  const select = (c: (typeof cards)[number]) => {
    // Centered above the location sheet, which opens at half the screen.
    if (c.position) map.current?.flyTo(c.position, { bottom: sheetDetentHeight('medium', screen) });
    setPicked(null);
    setSelected(c.trackerId);
  };
  // Once its card is there; the param is cleared so a later visit doesn't select it again. A
  // tracker with no card (gone, or turned off since the notification) is dropped once the
  // cards are in.
  const paramCard = trackerParam ? cards.find((c) => String(c.trackerId) === trackerParam) : undefined;
  useEffect(() => {
    if (!trackerParam || (!paramCard && !cards.length)) return;
    router.setParams({ tracker: undefined });
    if (paramCard) select(paramCard);
  }, [trackerParam, paramCard?.trackerId, cards.length]);

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
  const pickedDot = picked && pickedFeature(picked, t['accent']);

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
        // Not while a sheet's open: it would pan away from what the sheet is about.
        followKey={picked || selectedCard ? null : fixes}
        tools={bounds ? [{ id: 'fit', icon: 'arrow.up.left.and.arrow.down.right', label: 'Fit all', onPress: () => map.current?.fitBounds(bounds) }] : []}
        picks={picks}
        onPress={(lngLat, zoom) => {
          // Away from a track, a tap closes the sheet, as in Maps.
          if (tz) pick(pickDetails(tz, lngLat, zoom, picks, (id) => trackers.find((tr) => tr.id === id) ?? null));
        }}
        onLongPress={(lngLat) => { if (tz) pick(spotDetails(tz, lngLat)); }}
        topBar={cards.length > 0 && (
          <View style={{ paddingTop: px(t['space-1']), paddingBottom: px(t['space-2']) }} pointerEvents="box-none">
            <StatusCards cards={cards} pinnedIds={pinned} onSelect={select} onPin={setPinned} width={screenWidth - 2 * px(t['space-3'])} />
          </View>
        )}
      />
      {/* A status card's tracker, or a tap on the map (the web's point picker): one sheet, so one replaces the other in place. */}
      <LocationSheet title={picked ? (picked.snapped ? 'On route' : 'Off route') : selectedCard?.label ?? ''} details={picked ?? details}
        onClose={() => { setPicked(null); setSelected(null); }} />
    </View>
  );
}
