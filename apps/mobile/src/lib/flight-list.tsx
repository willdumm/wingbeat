/**
 * The flight list (the dashboard's): operator days as sticky headings with their flight
 * count and, when a flight has a track, "Map all" (the day's flights on a map), newest first,
 * and each flight's time and duration, route, assignment and remarks.
 * A corrected time or label has the web's †; a manual flight its "Manual" chip. Pull to
 * refresh; with no flights, the empty state fills the screen.
 */
import { useState, type ReactElement } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import type { FlightDay, FlightRow } from './flights';
import { SFIcon } from './map-tools';
import { px, useTokens } from './theme';

/** One flight's row, also the duty log's (duty-list.tsx). */
export function FlightRowView({ row, onPress }: { row: FlightRow; onPress: () => void }) {
  const t = useTokens();
  const dim = { fontSize: 14, color: t['text-muted'] };
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        gap: 2, paddingVertical: px(t['space-3']), paddingHorizontal: px(t['space-4']),
        backgroundColor: pressed ? t['surface-hover'] : t['surface-1'],
        borderBottomWidth: 1, borderBottomColor: t['border-subtle'],
      })}
    >
      <Text style={{ fontSize: 16, fontWeight: '600', color: t['text-primary'] }}>
        {row.time}{row.timesEdited ? ' †' : ''}
        {row.duration && <Text style={{ fontWeight: '400', color: t['text-muted'] }}> {row.duration}</Text>}
      </Text>
      {(row.route || row.manual) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {row.route && <Text style={{ fontSize: 15, color: t['text-secondary'] }}>{row.route}{row.routeEdited ? ' †' : ''}</Text>}
          {row.manual && (
            <Text style={{
              fontSize: 11, fontWeight: '700', color: t['accent-text'], backgroundColor: t['accent-surface'],
              paddingHorizontal: 6, paddingVertical: 1, borderRadius: px(t['radius-pill']), overflow: 'hidden',
            }}>Manual</Text>
          )}
        </View>
      )}
      {row.assignment && <Text style={dim}>{row.assignment}</Text>}
      {row.remarks.map((r, i) => <Text key={i} style={{ ...dim, fontStyle: 'italic' }}>{r}</Text>)}
    </Pressable>
  );
}

export function FlightList({ days, empty, notice, onSelect, onMapDay, onRefresh }: {
  days: FlightDay[];
  empty: ReactElement;
  /** Above the days: when the trackers were last polled. */
  notice: string | null;
  onSelect: (id: number) => void;
  onMapDay: (dayKey: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const t = useTokens();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    onRefresh().finally(() => setRefreshing(false));
  };
  return (
    <SectionList
      sections={days}
      keyExtractor={(row) => String(row.id)}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t['bg-base'] }}
      contentContainerStyle={days.length ? undefined : { flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      stickySectionHeadersEnabled
      ListHeaderComponent={notice && days.length ? (
        <Text style={{ fontSize: 13, color: t['text-muted'], textAlign: 'center', paddingBottom: px(t['space-2']) }}>{notice}</Text>
      ) : undefined}
      renderSectionHeader={({ section }) => (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t['surface-2'],
          paddingVertical: px(t['space-2']), paddingHorizontal: px(t['space-4']),
        }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: t['text-primary'] }}>{section.title}</Text>
          <Text style={{ fontSize: 13, color: t['text-muted'] }}>
            {section.data.length + (section.data.length === 1 ? ' flight' : ' flights')}
          </Text>
          {section.mappable && (
            <Pressable onPress={() => onMapDay(section.dayKey)} accessibilityRole="button" accessibilityLabel={'Map all of ' + section.title} hitSlop={8}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.5 : 1 })}>
              <SFIcon name="map" fallback="⌖" size={13} color={t['accent']} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: t['accent'] }}>Map all</Text>
            </Pressable>
          )}
        </View>
      )}
      renderItem={({ item }) => <FlightRowView row={item} onPress={() => onSelect(item.id)} />}
      ListEmptyComponent={empty}
    />
  );
}
