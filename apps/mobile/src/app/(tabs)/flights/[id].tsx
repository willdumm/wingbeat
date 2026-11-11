import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { trackerColor } from '@wingbeat/core/live';
import { useAccounts } from '@/lib/accounts-context';
import { origin } from '@/lib/api';
import { flightDetail, flightTrack } from '@/lib/flights';
import { HeaderButton } from '@/lib/header-button';
import { LiveMap } from '@/lib/live-map';
import { availableBasemaps } from '@/lib/map-style';
import { Placeholder } from '@/lib/placeholder';
import { px, useTokens } from '@/lib/theme';
import { useFlightsTab } from '@/lib/use-flights-tab';

/** One flight: its track on the map (or its named points), its times, labels and assignment. */
export default function FlightScreen() {
  const t = useTokens();
  const router = useRouter();
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

  if (!tab.ready || !active) return <Placeholder text="Loading…" />;
  if (!flight || !track) return <Placeholder text="This flight isn’t in the list any more." />;
  const detail = flightDetail(tab.tz, flight, tab.roster);
  return (
    <View style={{ flex: 1, backgroundColor: t['bg-base'] }}>
      <Stack.Screen options={{
        title: detail.title,
        headerRight: tab.isAdmin
          ? () => <HeaderButton title="Edit" onPress={() => router.push({ pathname: '/flights/assign', params: { id: String(flight.id) } })} />
          : undefined,
      }} />
      {track.bounds ? (
        <View style={{ height: '45%' }}>
          <LiveMap
            basemaps={availableBasemaps(tab.bootstrap)}
            overlays={tab.bootstrap.overlays}
            origin={origin(active.host)}
            initialView={{ bounds: track.bounds, padding: { top: 64, right: 40, bottom: 40, left: 40 } }}
            positions={track.ends}
            tracks={track.line}
          />
        </View>
      ) : null}
      <ScrollView contentContainerStyle={{ padding: px(t['space-4']), gap: px(t['space-3']) }}>
        {(detail.manual || !track.line.features.length) && (
          <Text style={{ fontSize: 14, color: t['text-muted'] }}>
            {[detail.manual && 'Manual entry', !track.line.features.length && 'No track recorded'].filter(Boolean).join(' · ')}
          </Text>
        )}
        <View style={{ borderRadius: px(t['radius-md']), backgroundColor: t['surface-1'], overflow: 'hidden' }}>
          {detail.fields.map((field, i) => (
            <View key={field.label} style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: px(t['space-3']), paddingHorizontal: px(t['space-4']),
              borderTopWidth: i ? 1 : 0, borderTopColor: t['border-subtle'],
            }}>
              <Text style={{ width: 84, fontSize: 15, color: t['text-muted'] }}>{field.label}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 15, color: t['text-primary'] }}>{field.value}{field.tracker ? ' †' : ''}</Text>
                {field.tracker && <Text style={{ fontSize: 13, color: t['text-faint'] }}>{field.tracker}</Text>}
              </View>
            </View>
          ))}
        </View>
        {detail.remarks.map((r, i) => (
          <Text key={i} style={{ fontSize: 15, fontStyle: 'italic', color: t['text-secondary'] }}>{r}</Text>
        ))}
      </ScrollView>
    </View>
  );
}
