/**
 * The Live map's banner while it shows a day's flights: the day, its flight count, arrows to
 * the next older and newer day with flights, a close button back to the live view, and the
 * trackers' legend when the day has several.
 */
import { Pressable, Text, View } from 'react-native';
import type { DayMap, MapDay } from './live';
import { SFIcon, shadow } from './map-tools';
import { px, useTokens } from './theme';

function Arrow({ icon, label, fallback, onPress }: {
  icon: 'chevron.left' | 'chevron.right' | 'xmark'; label: string; fallback: string; onPress: (() => void) | null;
}) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress ?? undefined}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: pressed ? t['surface-hover'] : 'transparent' })}
    >
      <SFIcon name={icon} fallback={fallback} size={15} color={onPress ? t['text-primary'] : t['text-faint']} />
    </Pressable>
  );
}

/** days: newest first; onPick(null) closes the day. */
export function DayBanner({ days, dayKey, legend, onPick }: {
  days: MapDay[]; dayKey: string; legend: DayMap['legend']; onPick: (dayKey: string | null) => void;
}) {
  const t = useTokens();
  const i = days.findIndex((d) => d.dayKey === dayKey);
  const day = days[i];
  const older = i >= 0 && i + 1 < days.length ? days[i + 1].dayKey : null;
  const newer = i > 0 ? days[i - 1].dayKey : null;
  return (
    <View style={{
      maxWidth: '100%', paddingVertical: px(t['space-1']), paddingHorizontal: px(t['space-1']), gap: 2,
      borderRadius: px(t['radius-lg']), backgroundColor: t['surface-float'], borderWidth: 1, borderColor: t['glass-border'],
      boxShadow: shadow(t['shadow-md']),
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Arrow icon="chevron.left" label="Older day" fallback="‹" onPress={older ? () => onPick(older) : null} />
        <View style={{ flexShrink: 1, alignItems: 'center', paddingHorizontal: px(t['space-1']) }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: t['text-primary'] }} numberOfLines={1}>{day?.title ?? dayKey}</Text>
          <Text style={{ fontSize: 12, color: t['text-muted'] }}>
            {day ? day.count + (day.count === 1 ? ' flight' : ' flights') : 'No flights'}
          </Text>
        </View>
        <Arrow icon="chevron.right" label="Newer day" fallback="›" onPress={newer ? () => onPick(newer) : null} />
        <Arrow icon="xmark" label="Back to live" fallback="×" onPress={() => onPick(null)} />
      </View>
      {legend.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: px(t['space-2']), paddingHorizontal: px(t['space-2']), paddingBottom: px(t['space-1']) }}>
          {legend.map((l) => (
            <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: l.color }} />
              <Text style={{ fontSize: 12, color: t['text-secondary'] }}>{l.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
