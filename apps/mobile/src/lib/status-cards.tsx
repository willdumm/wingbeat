/**
 * The aircraft status cards (the dashboard's status bar), in the map's top bar (LiveMap's
 * topBar): the tail on a pill in the tracker's color, in flight / on ground and GPS age (with a
 * dot only while fresh), then altitude and speed in flight and the place, on a second line
 * when they don't fit on the first. One card spans the bar; several scroll sideways, divided
 * by hairlines. The dots follow the web's status primitive (src/shared/status.ts).
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import type { StatusCard } from './live';
import { px, useTokens } from './theme';

function Dot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}

function Card({ card, width, divider, onPress }: { card: StatusCard; width: number | undefined; divider: boolean; onPress: () => void }) {
  const t = useTokens();
  const details = [card.metrics, card.location].filter(Boolean).join(' · ');
  const gap = 6;
  // The details stay on the first line when they fit, measured apart (an unseen copy) so
  // where they go doesn't change what's measured.
  const [w, setW] = useState({ row: 0, head: 0, details: 0 });
  const measure = (key: keyof typeof w) => (ev: LayoutChangeEvent) => {
    const v = ev.nativeEvent.layout.width;
    setW((p) => (p[key] === v ? p : { ...p, [key]: v }));
  };
  const inline = w.row > 0 && w.head + gap + w.details <= w.row;
  const detailsStyle = { fontSize: 15, fontWeight: '500', color: t['text-primary'] } as const;
  return (
    <Pressable
      onPress={onPress}
      disabled={!card.position}
      accessibilityRole="button"
      accessibilityLabel={`${card.label}, ${card.inFlight ? 'in flight' : 'on ground'}`}
      style={({ pressed }) => ({
        width, paddingVertical: px(t['space-2']), paddingHorizontal: px(t['space-3']), opacity: pressed ? 0.6 : 1,
        borderLeftWidth: divider ? StyleSheet.hairlineWidth : 0, borderLeftColor: t['border'],
      })}
    >
      <View onLayout={measure('row')} style={inline
        ? { flexDirection: 'row', alignItems: 'center', gap }
        : { alignItems: 'flex-start', gap: px(t['space-1']) }}>
        <View onLayout={measure('head')} style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap }}>
          {/* The tail on the tracker's color, as on its map marker. */}
          <View style={{ paddingHorizontal: px(t['space-2']), paddingVertical: 2, borderRadius: px(t['radius-pill']), backgroundColor: card.color }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: t['accent-fg'] }} numberOfLines={1}>{card.label}</Text>
          </View>
          {card.inFlight && <Dot color={t['live-dot']} />}
          <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 0.3, color: card.inFlight ? t['live-fg'] : t['text-secondary'] }}>
            {card.inFlight ? 'IN FLIGHT' : 'ON GROUND'}
          </Text>
          {card.gps && (
            <>
              <Text style={{ fontSize: 15, color: t['text-secondary'] }}>·</Text>
              {card.gpsFresh && <Dot color={t['success-dot']} />}
              <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '500', color: card.gpsFresh ? t['text-primary'] : t['text-secondary'] }} numberOfLines={1}>{card.gps}</Text>
            </>
          )}
        </View>
        {!!details && <Text style={[detailsStyle, { flexShrink: 1 }]} numberOfLines={1}>{inline ? '· ' + details : details}</Text>}
      </View>
      {!!details && (
        <Text onLayout={measure('details')} numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[detailsStyle, { position: 'absolute', opacity: 0 }]}>{'· ' + details}</Text>
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
