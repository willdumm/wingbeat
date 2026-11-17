/**
 * The aircraft status cards (the dashboard's status bar), at the top of the Live tab: a floating
 * SwiftUI card, Liquid Glass on iOS 26 and a blurred material before it. Each row has the tail
 * on a pill in the tracker's color, in flight / on ground and GPS age (with a dot only while
 * fresh), then altitude, speed and the place. Collapsed, the rows are the pinned ones, or with
 * none the one that last reported (live.ts cardStack); "All Aircraft" under them expands the
 * card to every row, scrolling past about half the screen. Touching and holding a row (with
 * more than one tracker) pins or unpins it; tapping one opens its sheet and collapses the list.
 * The dots follow the web's status primitive (src/shared/status.ts).
 */
import { useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { Button, Circle, ContextMenu, Divider, HStack, Host, Image, ScrollView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel, Animation, animation, background, buttonStyle, clipShape, contentShape, disabled, font, foregroundStyle,
  frame, glassEffect, lineLimit, padding, rotationEffect, shapes, type ModifierConfig,
} from '@expo/ui/swift-ui/modifiers';
import { cardStack, type StatusCard } from './live';
import { px, useTokens } from './theme';

const RADIUS = 22;
// A row's height, for when the open list needs to scroll (the pill line and the details line).
const ROW_HEIGHT = 54;
// Liquid Glass needs iOS 26; before it, glassEffect does nothing, so the card takes a material.
const GLASS = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;
const CARD_SURFACE: ModifierConfig[] = GLASS
  ? [glassEffect({ glass: { variant: 'regular' }, shape: 'roundedRectangle', cornerRadius: RADIUS })]
  : [background({ type: 'material', material: 'regular' }, shapes.roundedRectangle({ cornerRadius: RADIUS })), clipShape('roundedRectangle', RADIUS)];

function Dot({ color }: { color: string }) {
  return <Circle modifiers={[frame({ width: 8, height: 8 }), foregroundStyle(color)]} />;
}

function Row({ card, pinned, width }: { card: StatusCard; pinned: boolean; width: number }) {
  const t = useTokens();
  const details = [card.metrics, card.location].filter(Boolean).join(' · ');
  return (
    <VStack alignment="leading" spacing={3} modifiers={[
      frame({ width, alignment: 'leading' }), padding({ horizontal: px(t['space-3']), vertical: px(t['space-2']) }),
      // The whole row takes the tap, not just its text.
      contentShape(shapes.rectangle()),
    ]}>
      <HStack spacing={6}>
        {/* The tail on the tracker's color, as on its map marker. */}
        <Text modifiers={[
          font({ size: 14, weight: 'bold' }), foregroundStyle(t['accent-fg']), lineLimit(1),
          padding({ horizontal: px(t['space-2']), vertical: 1 }), background(card.color, shapes.capsule()),
        ]}>{card.label}</Text>
        {card.inFlight && <Dot color={t['live-dot']} />}
        <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(card.inFlight ? t['live-fg'] : t['text-secondary'])]}>
          {card.inFlight ? 'IN FLIGHT' : 'ON GROUND'}
        </Text>
        {card.gps && <Text modifiers={[font({ size: 13 }), foregroundStyle(t['text-secondary'])]}>·</Text>}
        {card.gps && card.gpsFresh && <Dot color={t['success-dot']} />}
        {card.gps && (
          <Text modifiers={[font({ size: 13, weight: 'medium' }), lineLimit(1), foregroundStyle(card.gpsFresh ? t['text-primary'] : t['text-secondary'])]}>
            {card.gps}
          </Text>
        )}
        <Spacer />
        {pinned && <Image systemName="pin.fill" size={12} color={t['accent']} />}
      </HStack>
      {!!details && (
        <Text modifiers={[font({ size: 13, weight: 'medium' }), lineLimit(1), foregroundStyle(t['text-primary'])]}>{details}</Text>
      )}
    </VStack>
  );
}

/** onSelect: a card with a position was tapped. onPin: the pinned trackers, changed. */
export function StatusCards({ cards, pinnedIds, onSelect, onPin, width }: {
  cards: StatusCard[];
  pinnedIds: number[];
  onSelect: (card: StatusCard) => void;
  onPin: (trackerIds: number[]) => void;
  /** The card's width (the screen's, less its margins). */
  width: number;
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

  const rows = shown.map((c, i) => {
    const isPinned = pinned.includes(c.trackerId);
    const row = (
      <Button onPress={() => pick(c)} modifiers={[
        buttonStyle('plain'), disabled(!open && !c.position),
        accessibilityLabel(`${c.label}, ${c.inFlight ? 'in flight' : 'on ground'}${isPinned ? ', pinned' : ''}`),
      ]}>
        <Row card={c} pinned={isPinned} width={width} />
      </Button>
    );
    return (
      <VStack key={c.trackerId} spacing={0}>
        {i > 0 && <Divider />}
        {listed ? (
          <ContextMenu>
            <ContextMenu.Items>
              <Button label={isPinned ? 'Unpin' : 'Pin'} systemImage={isPinned ? 'pin.slash' : 'pin'} onPress={() => pin(c.trackerId)} />
            </ContextMenu.Items>
            <ContextMenu.Trigger>{row}</ContextMenu.Trigger>
          </ContextMenu>
        ) : row}
      </VStack>
    );
  });
  // A ScrollView takes all the height it's offered, so only a list too tall for the cap scrolls.
  const cap = Math.round(screen * 0.55);
  const scrolls = open && shown.length * ROW_HEIGHT > cap;
  const toggle = open ? 'Show Less'
    : `All Aircraft (${cards.length})` + (moreInFlight ? ` · ${moreInFlight} more in flight` : '');

  return (
    <Host matchContents style={{ alignSelf: 'center' }}>
      <VStack spacing={0} modifiers={[frame({ width }), ...CARD_SURFACE, animation(Animation.snappy(), open)]}>
        {scrolls
          ? <ScrollView modifiers={[frame({ width, height: cap })]}><VStack spacing={0}>{rows}</VStack></ScrollView>
          : rows}
        {open && pinned.length === 0 && (
          <VStack spacing={0}>
            <Divider />
            <Text modifiers={[font({ size: 12 }), foregroundStyle(t['text-muted']), frame({ width, alignment: 'leading' }),
              padding({ horizontal: px(t['space-3']), vertical: px(t['space-1']) })]}>
              Touch and hold an aircraft to pin its card here. Unpinned, the one that last reported shows.
            </Text>
          </VStack>
        )}
        {listed && (
          <VStack spacing={0}>
            <Divider />
            <Button onPress={() => setOpen((o) => !o)} modifiers={[buttonStyle('plain'), accessibilityLabel(open ? 'Show less' : toggle)]}>
              <HStack spacing={6} modifiers={[frame({ width }), padding({ vertical: px(t['space-2']) }), contentShape(shapes.rectangle())]}>
                <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(t['accent'])]}>{toggle}</Text>
                <Image systemName="chevron.down" size={12} color={t['accent']}
                  modifiers={[rotationEffect(open ? 180 : 0), animation(Animation.snappy(), open)]} />
              </HStack>
            </Button>
          </VStack>
        )}
      </VStack>
    </Host>
  );
}
