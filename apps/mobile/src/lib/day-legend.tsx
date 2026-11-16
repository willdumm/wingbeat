/**
 * The day map's legend (the dashboard's day view legend), at the map's top right: each
 * tracker's color and its aircraft (or tracker name), stacked on the floating surface, when the
 * day has flights from more than one tracker (DayMap.legend is empty otherwise). It filters the
 * day by aircraft: tapping an entry hides its flights (dimmed, its dot hollow) or shows them
 * again. The last one shown can't be hidden.
 */
import { Pressable, Text, View } from 'react-native';
import type { DayMap } from './live';
import { px, shadow, useTokens } from './theme';

type Entry = DayMap['legend'][number];

export function DayLegend({ entries, onToggle }: { entries: DayMap['legend']; onToggle: (entry: Entry) => void }) {
  const t = useTokens();
  if (entries.length === 0) return null;
  const lastShown = entries.filter((e) => !e.hidden).length === 1;
  return (
    <View
      style={{
        paddingVertical: px(t['space-1']), paddingHorizontal: px(t['space-1']),
        borderRadius: px(t['radius-md']), borderWidth: 1, borderColor: t['glass-border'],
        backgroundColor: t['surface-float'], boxShadow: shadow(t['shadow-md']),
      }}>
      {entries.map((e) => (
        <Pressable key={String(e.trackerId)} onPress={() => onToggle(e)} disabled={!e.hidden && lastShown}
          accessibilityRole="switch" accessibilityLabel={e.label} accessibilityState={{ checked: !e.hidden }}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingVertical: px(t['space-1']), paddingHorizontal: px(t['space-2']),
            opacity: pressed ? 0.6 : e.hidden ? 0.45 : 1,
          })}>
          <View style={{
            width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: e.color,
            backgroundColor: e.hidden ? 'transparent' : e.color,
          }} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: t['text-primary'] }} numberOfLines={1}>{e.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
