/**
 * The aircraft status cards (the dashboard's status bar), compact in the map's top bar (on
 * its blur, LiveMap's topBar): tail and in flight / on ground, then GPS age with its
 * freshness dot, altitude and speed in flight, and the place. One card spans the bar;
 * several scroll sideways, divided by hairlines. The dots follow the web's status primitive
 * (src/shared/status.ts).
 */
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { StatusCard } from './live';
import { px, useTokens } from './theme';

function Dot({ color }: { color: string }) {
  return <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />;
}

function Card({ card, width, divider, onPress }: { card: StatusCard; width: number | undefined; divider: boolean; onPress: () => void }) {
  const t = useTokens();
  const details = [card.gps, card.metrics, card.location].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      disabled={!card.position}
      accessibilityRole="button"
      accessibilityLabel={`${card.label}, ${card.inFlight ? 'in flight' : 'on ground'}`}
      style={({ pressed }) => ({
        width, gap: 2, paddingVertical: px(t['space-2']), paddingHorizontal: px(t['space-3']), opacity: pressed ? 0.6 : 1,
        borderLeftWidth: divider ? StyleSheet.hairlineWidth : 0, borderLeftColor: t['border'],
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: card.color }} />
        <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '700', color: t['text-primary'] }} numberOfLines={1}>{card.label}</Text>
        <Dot color={card.inFlight ? t['live-dot'] : t['text-faint']} />
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.3, color: card.inFlight ? t['live-fg'] : t['text-secondary'] }}>
          {card.inFlight ? 'IN FLIGHT' : 'ON GROUND'}
        </Text>
      </View>
      {!!details && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {card.gps && <Dot color={card.gpsFresh ? t['success-dot'] : t['text-faint']} />}
          <Text style={{ flexShrink: 1, fontSize: 12, color: t['text-secondary'] }} numberOfLines={1}>{details}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** onSelect: a card with a position was tapped. */
export function StatusCards({ cards, onSelect }: { cards: StatusCard[]; onSelect: (card: StatusCard) => void }) {
  const t = useTokens();
  const { width: screen } = useWindowDimensions();
  if (cards.length <= 1) {
    return (
      <View>
        {cards.map((c) => <Card key={c.trackerId} card={c} width={undefined} divider={false} onPress={() => onSelect(c)} />)}
      </View>
    );
  }
  // Each card a little narrower than the bar, so the next one peeks in.
  const width = Math.min(320, screen - 48);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
      style={{ flexGrow: 0 }}
      snapToInterval={width}
      decelerationRate="fast"
    >
      {cards.map((c, i) => <Card key={c.trackerId} card={c} width={width} divider={i > 0} onPress={() => onSelect(c)} />)}
    </ScrollView>
  );
}
