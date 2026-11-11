import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { trackerLiveData } from '@wingbeat/core/live';
import { useAccounts } from '@/lib/accounts-context';
import { origin } from '@/lib/api';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useFlights } from '@/lib/flights-context';
import { inFlightTracks, initialView, positionFeatures, statusCards } from '@/lib/live';
import { LiveMap, type LiveMapRef } from '@/lib/live-map';
import { availableBasemaps } from '@/lib/map-style';
import { Placeholder } from '@/lib/placeholder';
import { StatusCards } from '@/lib/status-cards';
import { useTokens } from '@/lib/theme';
import { useNow } from '@/lib/use-now';

export default function LiveScreen() {
  const t = useTokens();
  const { loaded, active } = useAccounts();
  const { bootstrap, handshake } = useBootstrap();
  const { store, lastRefresh, generation } = useFlights();
  const map = useRef<LiveMapRef>(null);
  const now = useNow(30_000);  // the cards' "GPS 5 min ago"

  const trackers = useMemo(() => bootstrap?.trackers.filter((tr) => tr.active && !tr.deleted) ?? [], [bootstrap]);
  const live = useMemo(
    () => (store ? trackerLiveData(trackers, store.getRaw, lastRefresh) : {}),
    [store, trackers, lastRefresh, generation],
  );
  const cards = useMemo(() => statusCards(trackers, live, now, t['text-faint']), [trackers, live, now, t]);
  const positions = useMemo(() => positionFeatures(cards, live), [cards, live]);
  const tracks = useMemo(() => inFlightTracks(cards, store?.getRaw ?? (() => [])), [store, cards, generation]);

  // The map waits for the bootstrap, which has the basemaps and the default view.
  if (!loaded || !active || active.signedOut || handshake === 'server-too-old' || !bootstrap) {
    return <Placeholder text="Loading…" />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: t['bg-base'] }}>
      <LiveMap
        ref={map}
        basemaps={availableBasemaps(bootstrap)}
        overlays={bootstrap.overlays}
        origin={origin(active.host)}
        initialView={initialView(bootstrap.instance, cards)}
        positions={positions}
        tracks={tracks}
      />
      <StatusCards cards={cards} onSelect={(c) => c.position && map.current?.flyTo(c.position)} />
    </View>
  );
}
