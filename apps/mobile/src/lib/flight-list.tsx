/**
 * The flight list (the dashboard's): operator days as sticky headings with their flight
 * count, newest first, and each flight's time and duration, route, assignment and remarks.
 * A corrected time or label has the web's †; a manual flight its "Manual" chip.
 */
import type { ReactNode } from 'react';
import { Pressable, SectionList, Text, View } from 'react-native';
import type { FlightDay, FlightRow } from './flights';
import { px, useTokens } from './theme';

function Row({ row, onPress }: { row: FlightRow; onPress: () => void }) {
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

export function FlightList({ days, empty, onSelect }: { days: FlightDay[]; empty: ReactNode; onSelect: (id: number) => void }) {
  const t = useTokens();
  return (
    <SectionList
      sections={days}
      keyExtractor={(row) => String(row.id)}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: t['bg-base'] }}
      stickySectionHeadersEnabled
      renderSectionHeader={({ section }) => (
        <View style={{
          flexDirection: 'row', alignItems: 'baseline', gap: 8, backgroundColor: t['surface-2'],
          paddingVertical: px(t['space-2']), paddingHorizontal: px(t['space-4']),
        }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: t['text-primary'] }}>{section.title}</Text>
          <Text style={{ fontSize: 13, color: t['text-muted'] }}>
            {section.data.length + (section.data.length === 1 ? ' flight' : ' flights')}
          </Text>
        </View>
      )}
      renderItem={({ item }) => <Row row={item} onPress={() => onSelect(item.id)} />}
      ListEmptyComponent={<View style={{ padding: px(t['space-8']), alignItems: 'center', gap: 12 }}>{empty}</View>}
    />
  );
}
