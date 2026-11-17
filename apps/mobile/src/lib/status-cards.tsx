/**
 * The aircraft status cards (the dashboard's status bar), in the map's top bar (LiveMap's
 * topBar): the tail on a pill in the tracker's color, in flight / on ground and GPS age (with a
 * dot only while fresh), then altitude and speed in flight and the place, on a second line
 * when they don't fit on the first. The cards stack, divided by hairlines: collapsed, the
 * pinned ones, or with none the one that last reported (live.ts cardStack); "All Aircraft"
 * under them opens every card. Each card's pin button (with more than one tracker) pins or
 * unpins it; tapping a card opens its sheet and collapses the list. The dots follow the web's
 * status primitive (src/shared/status.ts).
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
function Symbol({ name, size, color }: { name: 'pin' | 'pin.fill' | 'chevron.down' | 'chevron.up'; size: number; color: string }) {
  return (
    <View pointerEvents="none">
      <Host matchContents><Image systemName={name} size={size} color={color} /></Host>
    </View>
  );
}

/** A card's pin: outlined until pinned. Its touch area runs the card's full height. */
function PinButton({ label, pinned, onPress }: { label: string; pinned: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable onPress={onPress} hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="switch" accessibilityLabel={'Pin ' + label} accessibilityState={{ checked: pinned }}
      style={({ pressed }) => ({ width: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
      <Symbol name={pinned ? 'pin.fill' : 'pin'} size={15} color={pinned ? t['accent'] : t['text-faint']} />
    </Pressable>
  );
}

function Card({ card, pinned, divider, disabled, onPress, onPin }: {
  card: StatusCard;
  pinned: boolean;
  divider: boolean;
  disabled: boolean;
  onPress: () => void;
  /** Pins or unpins it; null: no pin button. */
  onPin: (() => void) | null;
}) {
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
  const detailsStyle = { fontSize: 13, fontWeight: '500', color: t['text-primary'] } as const;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${card.label}, ${card.inFlight ? 'in flight' : 'on ground'}${pinned ? ', pinned' : ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: px(t['space-1']) + 2, paddingLeft: px(t['space-3']), paddingRight: onPin ? 0 : px(t['space-3']),
        opacity: pressed ? 0.6 : 1,
        borderTopWidth: divider ? StyleSheet.hairlineWidth : 0, borderTopColor: t['border'],
      })}
    >
      <View onLayout={measure('row')} style={[{ flex: 1 }, inline
        ? { flexDirection: 'row', alignItems: 'center', gap }
        : { alignItems: 'flex-start', gap: 2 }]}>
        <View onLayout={measure('head')} style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap }}>
          {/* The tail on the tracker's color, as on its map marker. */}
          <View style={{ paddingHorizontal: px(t['space-2']), paddingVertical: 1, borderRadius: px(t['radius-pill']), backgroundColor: card.color }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: t['accent-fg'] }} numberOfLines={1}>{card.label}</Text>
          </View>
          {card.inFlight && <Dot color={t['live-dot']} />}
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.3, color: card.inFlight ? t['live-fg'] : t['text-secondary'] }}>
            {card.inFlight ? 'IN FLIGHT' : 'ON GROUND'}
          </Text>
          {card.gps && (
            <>
              <Text style={{ fontSize: 13, color: t['text-secondary'] }}>·</Text>
              {card.gpsFresh && <Dot color={t['success-dot']} />}
              <Text style={{ flexShrink: 1, fontSize: 13, fontWeight: '500', color: card.gpsFresh ? t['text-primary'] : t['text-secondary'] }} numberOfLines={1}>{card.gps}</Text>
            </>
          )}
        </View>
        {!!details && <Text style={[detailsStyle, { flexShrink: 1 }]} numberOfLines={1}>{inline ? '· ' + details : details}</Text>}
      </View>
      {onPin && <PinButton label={card.label} pinned={pinned} onPress={onPin} />}
      {!!details && (
        <Text onLayout={measure('details')} numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[detailsStyle, { position: 'absolute', opacity: 0 }]}>{'· ' + details}</Text>
      )}
    </Pressable>
  );
}

/** onSelect: a card with a position was tapped. onPin: the pinned trackers, changed. */
export function StatusCards({ cards, pinnedIds, onSelect, onPin }: {
  cards: StatusCard[];
  pinnedIds: number[];
  onSelect: (card: StatusCard) => void;
  onPin: (trackerIds: number[]) => void;
}) {
  const t = useTokens();
  const { height: screen } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  // One tracker: its card, nothing to pick.
  const listed = cards.length > 1;
  const pinned = cards.filter((c) => pinnedIds.includes(c.trackerId)).map((c) => c.trackerId);
  const { shown, moreInFlight } = cardStack(cards, listed ? pinned : [], listed && open);
  const pick = (c: StatusCard) => {
    setOpen(false);
    if (c.position) onSelect(c);
  };
  const pin = (id: number) => onPin(pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id]);
  const list = shown.map((c, i) => (
    <Card key={c.trackerId} card={c} pinned={pinned.includes(c.trackerId)} divider={i > 0}
      disabled={!open && !c.position} onPress={() => pick(c)} onPin={listed ? () => pin(c.trackerId) : null} />
  ));
  const toggle = open ? 'Show Less'
    : `All Aircraft (${cards.length})` + (moreInFlight ? ` · ${moreInFlight} more in flight` : '');
  return (
    <View>
      {/* The open list scrolls past half the screen. */}
      {open ? (
        <ScrollView style={{ flexGrow: 0, maxHeight: screen * 0.55 }} contentInsetAdjustmentBehavior="never">{list}</ScrollView>
      ) : list}
      {open && pinned.length === 0 && (
        <Text style={{ paddingHorizontal: px(t['space-3']), paddingVertical: px(t['space-1']), fontSize: 12, color: t['text-muted'],
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t['border'] }}>
          Pin aircraft to keep their cards here. Unpinned, the one that last reported shows.
        </Text>
      )}
      {listed && (
        <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            paddingVertical: px(t['space-1']) + 2, opacity: pressed ? 0.6 : 1,
            borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t['border'],
          })}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: t['accent'] }}>{toggle}</Text>
          <Symbol name={open ? 'chevron.up' : 'chevron.down'} size={12} color={t['accent']} />
        </Pressable>
      )}
    </View>
  );
}
