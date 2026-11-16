/**
 * The map's tools: a column of round glass buttons at its bottom left, each a native menu
 * (SwiftUI, through @expo/ui), or a plain button when the tool has `onPress` instead. A
 * tool's button shows as on (prominent, in the accent) while its `active` is set (the Day
 * tool while a day is mapped). Also the SF Symbol icon the map's overlays share.
 */
import type { ReactNode } from 'react';
import { Platform, Text } from 'react-native';
import { Button, GlassEffectContainer, Host, Image, Menu, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonBorderShape, buttonStyle, controlSize, frame, menuStyle, tint } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { px, useTokens } from './theme';

export type MapTool = {
  id: string;
  icon: SFSymbol;
  /** The button's accessibility label. */
  label: string;
  active?: boolean;
} & (
  /** The menu's items: SwiftUI Buttons, Toggles, Pickers and Sections. */
  | { menu: ReactNode; onPress?: never }
  /** A button without a menu: what a tap does. */
  | { onPress: () => void; menu?: never }
);

/**
 * An SF Symbol, for inside a Pressable (which takes the touch, not SwiftUI). Android has no
 * SF Symbols (iOS only for now), so it shows fallback.
 */
export function SFIcon({ name, fallback, size, color }: { name: SFSymbol; fallback: string; size: number; color: string }) {
  return Platform.OS === 'ios' ? (
    <Host matchContents pointerEvents="none">
      <Image systemName={name} size={size} color={color} />
    </Host>
  ) : (
    <Text style={{ fontSize: size * 0.85, fontWeight: '700', color }}>{fallback}</Text>
  );
}

const BUTTON = 44;

/** left and bottom: where the column sits on the map (bottom clear of the tab bar). */
export function MapTools({ tools, left, bottom }: { tools: MapTool[]; left: number; bottom: number }) {
  const t = useTokens();
  if (!tools.length) return null;
  return (
    <Host matchContents style={{ position: 'absolute', left, bottom }}>
      <GlassEffectContainer spacing={px(t['space-2'])}>
        <VStack spacing={px(t['space-2'])}>
          {tools.map((tool) => {
            const label = <Image systemName={tool.icon} size={19} modifiers={[frame({ width: BUTTON - 16, height: BUTTON - 16 })]} />;
            const modifiers = [
              accessibilityLabel(tool.label),
              buttonStyle(tool.active ? 'glassProminent' : 'glass'),
              buttonBorderShape('circle'),
              controlSize('large'),
              ...(tool.active ? [tint(t['accent-solid'])] : []),
            ];
            return tool.onPress ? (
              <Button key={tool.id} onPress={tool.onPress} modifiers={modifiers}>{label}</Button>
            ) : (
              <Menu key={tool.id} label={label} modifiers={[menuStyle('button'), ...modifiers]}>
                {tool.menu}
              </Menu>
            );
          })}
        </VStack>
      </GlassEffectContainer>
    </Host>
  );
}
