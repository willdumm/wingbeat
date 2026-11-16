/**
 * The day map's legend (the dashboard's day view legend), at the map's top right: each
 * tracker's color and its aircraft (or tracker name), stacked on the floating surface, when the
 * day has flights from more than one tracker (DayMap.legend is empty otherwise). It filters the
 * day by aircraft: tapping an entry hides its flights (dimmed, its dot hollow) or shows them
 * again. The last one shown can't be hidden. Each entry is a full 44-point row, the
 * smallest comfortable tap target (Apple's guidelines), divided by hairlines.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
        overflow: 'hidden', borderRadius: px(t['radius-md']), borderWidth: 1, borderColor: t['glass-border'],
        backgroundColor: t['surface-float'], boxShadow: shadow(t['shadow-md']),
      }}>
      {entries.map((e, i) => (
        <Pressable key={String(e.trackerId)} onPress={() => onToggle(e)} disabled={!e.hidden && lastShown}
          accessibilityRole="switch" accessibilityLabel={e.label} accessibilityState={{ checked: !e.hidden }}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: px(t['space-2']),
            minHeight: 44, minWidth: 120, paddingHorizontal: px(t['space-3']),
            borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: t['border'],
            backgroundColor: pressed ? t['border'] : 'transparent',
            opacity: e.hidden ? 0.45 : 1,
          })}>
          <View style={{
            width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: e.color,
            backgroundColor: e.hidden ? 'transparent' : e.color,
          }} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: t['text-primary'] }} numberOfLines={1}>{e.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
