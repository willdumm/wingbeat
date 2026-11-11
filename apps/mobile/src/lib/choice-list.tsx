/**
 * Grouped lists in the iOS Settings style: a titled section of rows (ListSection, ListRow),
 * and a section of choices, each row with a check when it's selected (ChoiceSection: the
 * filter sheet's multi-selects, the assignment edit's single choices, the theme).
 */
import { Children, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { px, useTokens } from './theme';

export function ListSection({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const t = useTokens();
  const rows = Children.toArray(children);
  return (
    <View style={{ gap: px(t['space-2']) }}>
      {title && (
        <Text style={{ fontSize: 13, fontWeight: '600', letterSpacing: 0.3, color: t['text-muted'], textTransform: 'uppercase', paddingHorizontal: px(t['space-4']) }}>
          {title}
        </Text>
      )}
      <View style={{ borderRadius: px(t['radius-md']), overflow: 'hidden', marginHorizontal: px(t['space-3']), backgroundColor: t['surface-1'] }}>
        {rows.map((row, i) => (
          <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: t['border-subtle'] }}>{row}</View>
        ))}
      </View>
      {footer && (
        <Text style={{ fontSize: 13, color: t['text-muted'], paddingHorizontal: px(t['space-4']) }}>{footer}</Text>
      )}
    </View>
  );
}

/** A row: its label, a line under it, and a check when selected; destructive is red. */
export function ListRow({ label, detail, selected, destructive, disabled, onPress, onLongPress }: {
  label: string;
  detail?: string;
  selected?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', paddingVertical: px(t['space-3']), paddingHorizontal: px(t['space-4']),
        backgroundColor: pressed ? t['surface-hover'] : t['surface-1'],
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 16, color: disabled ? t['text-faint'] : destructive ? t['danger'] : t['text-primary'] }}>{label}</Text>
        {detail && <Text style={{ fontSize: 13, color: t['text-muted'] }}>{detail}</Text>}
      </View>
      {selected && <Text style={{ fontSize: 16, fontWeight: '700', color: t['accent'] }}>✓</Text>}
    </Pressable>
  );
}

export function ChoiceSection<V>({ title, choices, isSelected, onPress }: {
  title: string;
  choices: { value: V; label: string }[];
  isSelected: (v: V) => boolean;
  onPress: (v: V) => void;
}) {
  return (
    <ListSection title={title}>
      {choices.map((c) => (
        <ListRow key={String(c.value)} label={c.label} selected={isSelected(c.value)} onPress={() => onPress(c.value)} />
      ))}
    </ListSection>
  );
}
