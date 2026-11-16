/**
 * The aircraft status cards (the dashboard's status bar), in the map's top bar (LiveMap's
 * topBar): the tail on a pill in the tracker's color, in flight / on ground and GPS age (with a
 * dot only while fresh), then altitude and speed in flight and the place, on a second line
 * when they don't fit on the first. The cards stack, divided by hairlines: collapsed, the
 * in-flight ones and the pinned one (live.ts cardStack); "All Aircraft" under them opens
 * every card, and picking one there pins it (or, if pinned, unpins it) and collapses the list.
 * The dots follow the web's status primitive (src/shared/status.ts).
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { Host, Image } from '@expo/ui/swift-ui';
import { cardStack, type StatusCard } from './live';
import { px, useTokens } from './theme';

function Dot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;
}

/** An SF Symbol in RN layout; inside a Pressable, so the Pressable gets the touch. */
function Symbol({ name, size, color }: { name: 'pin.fill' | 'chevron.down' | 'chevron.up'; size: number; color: string }) {
  return (
    <View pointerEvents="none">
      <Host matchContents><Image systemName={name} size={size} color={color} /></Host>
    </View>
  );
}

function Card({ card, pinned, divider, disabled, onPress }: { card: StatusCard; pinned: boolean; divider: boolean; disabled: boolean; onPress: () => void }) {
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
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${card.label}, ${card.inFlight ? 'in flight' : 'on ground'}${pinned ? ', pinned' : ''}`}
      style={({ pressed }) => ({
        paddingVertical: px(t['space-2']), paddingHorizontal: px(t['space-3']), opacity: pressed ? 0.6 : 1,
        borderTopWidth: divider ? StyleSheet.hairlineWidth : 0, borderTopColor: t['border'],
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
          {pinned && <Symbol name="pin.fill" size={12} color={t['text-secondary']} />}
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

/**
 * onSelect: a card with a position was tapped. onPin: a card picked from the open list, to pin
 * (its id) or unpin (null).
 */
export function StatusCards({ cards, pinnedId, onSelect, onPin }: {
  cards: StatusCard[];
  pinnedId: number | null;
  onSelect: (card: StatusCard) => void;
  onPin: (trackerId: number | null) => void;
}) {
  const t = useTokens();
  const { height: screen } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  // One tracker: its card, nothing to pick.
  const listed = cards.length > 1;
  const { shown, moreInFlight } = cardStack(cards, listed ? pinnedId : null, listed && open);
  const pick = (c: StatusCard) => {
    if (open) {
      onPin(c.trackerId === pinnedId ? null : c.trackerId);
      setOpen(false);
    }
    if (c.position) onSelect(c);
  };
  const list = shown.map((c, i) => (
    <Card key={c.trackerId} card={c} pinned={listed && c.trackerId === pinnedId} divider={i > 0}
      disabled={!open && !c.position} onPress={() => pick(c)} />
  ));
  const toggle = open ? 'Show Less'
    : `All Aircraft (${cards.length})` + (moreInFlight ? ` · ${moreInFlight} more in flight` : '');
  return (
    <View>
      {/* The open list scrolls past half the screen. */}
      {open ? (
        <ScrollView style={{ flexGrow: 0, maxHeight: screen * 0.55 }} contentInsetAdjustmentBehavior="never">{list}</ScrollView>
      ) : list}
      {listed && (
        <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            paddingVertical: px(t['space-2']), opacity: pressed ? 0.6 : 1,
            borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t['border'],
          })}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t['accent'] }}>{toggle}</Text>
          <Symbol name={open ? 'chevron.up' : 'chevron.down'} size={12} color={t['accent']} />
        </Pressable>
      )}
    </View>
  );
}
