import { Pressable, Text } from 'react-native';
import { useTokens } from './theme';

/** A text button for a native stack header ("Filter", "Edit", "Save"). */
export function HeaderButton({ title, onPress, disabled, bold }: { title: string; onPress: () => void; disabled?: boolean; bold?: boolean }) {
  const t = useTokens();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} accessibilityRole="button">
      <Text style={{ fontSize: 17, fontWeight: bold ? '600' : '400', color: disabled ? t['text-faint'] : t['accent'] }}>{title}</Text>
    </Pressable>
  );
}
