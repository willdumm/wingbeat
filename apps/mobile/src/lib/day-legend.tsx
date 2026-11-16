/**
 * The day map's legend (the dashboard's day view legend): each tracker's color and its
 * aircraft (or tracker name), on the floating surface over the map, when the day has flights
 * from more than one tracker (DayMap.legend is empty otherwise).
 */
import { Text, View } from 'react-native';
import type { DayMap } from './live';
import { px, shadow, useTokens } from './theme';

export function DayLegend({ entries }: { entries: DayMap['legend'] }) {
  const t = useTokens();
  if (entries.length === 0) return null;
  return (
    <View pointerEvents="none" accessibilityRole="summary"
      accessibilityLabel={'Track colors: ' + entries.map((e) => e.label).join(', ')}
      style={{
        flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: px(t['space-3']), rowGap: px(t['space-1']),
        paddingVertical: px(t['space-1']), paddingHorizontal: px(t['space-3']),
        borderRadius: px(t['radius-md']), borderWidth: 1, borderColor: t['glass-border'],
        backgroundColor: t['surface-float'], boxShadow: shadow(t['shadow-md']),
      }}>
      {entries.map((e) => (
        <View key={e.label + e.color} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: e.color }} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: t['text-primary'] }} numberOfLines={1}>{e.label}</Text>
        </View>
      ))}
    </View>
  );
}
