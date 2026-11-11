import { Text, View } from 'react-native';
import { useTokens } from './theme';

/** A tab's body until its step of phase 5 builds it. */
export function Placeholder({ text }: { text: string }) {
  const t = useTokens();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t['bg-base'] }}>
      <Text style={{ color: t['text-muted'] }}>{text}</Text>
    </View>
  );
}
