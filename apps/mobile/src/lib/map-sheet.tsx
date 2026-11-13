/**
 * A native sheet over a map (SwiftUI, through @expo/ui), as Maps shows a place: its title, a
 * one-line summary and its actions (an Edit button) at the top, then a Form of its content
 * (Sections). It can't be dismissed, only dragged between a peek of the title, half the
 * screen and the full screen, and the map behind it stays live up to half. onHeight follows
 * its height as it moves (LiveMap's sheetHeight keeps the tools on top of it); onDetent says
 * where it settled. It covers the tab bar, as sheets do.
 */
import { useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { BottomSheet, Form, Group, HStack, Host, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  font, foregroundStyle, frame, interactiveDismissDisabled, lineLimit, onGeometryChange, padding, presentationBackgroundInteraction,
  presentationDetents, presentationDragIndicator, type PresentationDetent,
} from '@expo/ui/swift-ui/modifiers';

// The sheet's height when dragged down to its title.
const PEEK = 100;

const DETENTS: PresentationDetent[] = [{ height: PEEK }, 'medium', 'large'];

export type SheetDetent = 'peek' | 'medium' | 'large';

/** How much of a full-window map a sheet at the detent covers (iOS's medium is half the screen). */
export function sheetDetentHeight(detent: SheetDetent, screen: number): number {
  return detent === 'peek' ? PEEK : detent === 'medium' ? screen / 2 : screen;
}

/** isPresented: false while the screen is away or another modal needs the stage; onDismiss: it's gone. */
export function MapSheet({ title, summary, actions, isPresented, onDismiss, onHeight, onDetent, children }: {
  title: string; summary?: string; actions?: ReactNode; isPresented: boolean; onDismiss?: () => void;
  onHeight?: (height: number) => void; onDetent?: (detent: SheetDetent) => void; children: ReactNode;
}) {
  const [detent, setDetent] = useState<PresentationDetent>('medium');
  const { height: screen } = useWindowDimensions();
  return (
    <Host matchContents style={{ position: 'absolute' }}>
      <BottomSheet isPresented={isPresented} onIsPresentedChange={() => {}} onDismiss={onDismiss}>
        <Group modifiers={[
          presentationDetents(DETENTS, {
            selection: detent,
            onSelectionChange: (d) => {
              setDetent(d);
              onDetent?.(typeof d === 'object' ? 'peek' : d === 'large' ? 'large' : 'medium');
            },
          }),
          presentationDragIndicator('visible'),
          presentationBackgroundInteraction({ type: 'enabledUpThrough', detent: 'medium' }),
          interactiveDismissDisabled(),
        ]}>
          {/* Its top, in the window, as the sheet moves. */}
          <VStack alignment="leading" spacing={0} modifiers={onHeight ? [onGeometryChange((g) => onHeight(screen - g.y))] : []}>
            <HStack modifiers={[padding({ top: 20, horizontal: 20, bottom: 8 })]}>
              <VStack alignment="leading" spacing={2} modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
                <Text modifiers={[font({ textStyle: 'title3', weight: 'bold' }), lineLimit(1)]}>{title}</Text>
                {!!summary && <Text modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(1)]}>{summary}</Text>}
              </VStack>
              {actions && <><Spacer />{actions}</>}
            </HStack>
            <Form>{children}</Form>
          </VStack>
        </Group>
      </BottomSheet>
    </Host>
  );
}
