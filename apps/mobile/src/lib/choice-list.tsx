/**
 * A titled group of choices, each a row with a check when it's selected: the filter
 * sheet's multi-selects and the assignment edit's single choices.
 */
import { Pressable, Text, View } from 'react-native';
import { px, useTokens } from './theme';

export function ChoiceSection<V>({ title, choices, isSelected, onPress }: {
  title: string;
  choices: { value: V; label: string }[];
  isSelected: (v: V) => boolean;
  onPress: (v: V) => void;
}) {
  const t = useTokens();
  return (
    <View style={{ gap: px(t['space-2']) }}>
      <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: 0.3, color: t['text-muted'], textTransform: 'uppercase', paddingHorizontal: px(t['space-4']) }}>
        {title}
      </Text>
      <View style={{ borderRadius: px(t['radius-md']), overflow: 'hidden', marginHorizontal: px(t['space-3']), backgroundColor: t['surface-1'] }}>
        {choices.map((c, i) => {
          const on = isSelected(c.value);
          return (
            <Pressable
              key={String(c.value)}
              onPress={() => onPress(c.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', paddingVertical: px(t['space-3']), paddingHorizontal: px(t['space-4']),
                backgroundColor: pressed ? t['surface-hover'] : t['surface-1'],
                borderTopWidth: i ? 1 : 0, borderTopColor: t['border-subtle'],
              })}
            >
              <Text style={{ flex: 1, fontSize: 16, color: t['text-primary'] }}>{c.label}</Text>
              {on && <Text style={{ fontSize: 16, fontWeight: '700', color: t['accent'] }}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
