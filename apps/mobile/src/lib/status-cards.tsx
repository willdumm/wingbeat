/**
 * The aircraft status cards as a native list (the dashboard's status bar): tail and
 * In Flight / On Ground, GPS age with its freshness dot, altitude and speed in flight, and
 * the place. The status chip and dot follow the web's status primitive (src/shared/status.ts).
 */
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { StatusCard } from './live';
import { px, useTokens, type Tokens } from './theme';

function Dot({ color }: { color: string }) {
  return <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />;
}

function Chip({ inFlight, t }: { inFlight: boolean; t: Tokens }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, paddingHorizontal: 8,
      borderRadius: px(t['radius-pill']), backgroundColor: inFlight ? t['live-surface'] : t['surface-2'],
    }}>
      <Dot color={inFlight ? t['live-dot'] : t['text-faint']} />
      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.3, color: inFlight ? t['live-fg'] : t['text-secondary'] }}>
        {inFlight ? 'IN FLIGHT' : 'ON GROUND'}
      </Text>
    </View>
  );
}

function Card({ card, onPress }: { card: StatusCard; onPress: () => void }) {
  const t = useTokens();
  const details = [card.metrics, card.location].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      disabled={!card.position}
      style={({ pressed }) => ({
        gap: 6, padding: px(t['space-3']), borderRadius: px(t['radius-md']), borderWidth: 1.5,
        borderColor: card.inFlight ? card.color : t['border-subtle'],
        backgroundColor: pressed ? t['surface-hover'] : t['surface-1'],
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: card.color }} />
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: t['text-primary'] }} numberOfLines={1}>{card.label}</Text>
        <Chip inFlight={card.inFlight} t={t} />
      </View>
      {(card.gps || details) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {card.gps && <Dot color={card.gpsFresh ? t['success-dot'] : t['text-faint']} />}
          {card.gps && <Text style={{ fontSize: 13, color: t['text-muted'] }}>{card.gps}</Text>}
          {!!details && (
            <Text style={{ flex: 1, fontSize: 13, color: t['text-muted'] }} numberOfLines={1}>
              {card.gps ? '· ' : ''}{details}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

/** onSelect: a card with a position was tapped. */
export function StatusCards({ cards, onSelect }: { cards: StatusCard[]; onSelect: (card: StatusCard) => void }) {
  const t = useTokens();
  return (
    <ScrollView
      style={{ flexGrow: 0, maxHeight: '45%', backgroundColor: t['bg-base'] }}
      contentContainerStyle={{ gap: px(t['space-2']), padding: px(t['space-3']) }}
    >
      {cards.map((c) => <Card key={c.trackerId} card={c} onPress={() => onSelect(c)} />)}
      {!cards.length && <Text style={{ color: t['text-muted'], textAlign: 'center' }}>No active trackers.</Text>}
    </ScrollView>
  );
}
