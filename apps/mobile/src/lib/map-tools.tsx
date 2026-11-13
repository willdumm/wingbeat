/**
 * The map's tools: a column of round glass buttons at its bottom left, each a native menu
 * (SwiftUI, through @expo/ui). A tool's button shows as on (prominent, in the accent) while its
 * `active` is set (the Day tool while a day is mapped). Also the bits of native chrome the
 * map's overlays share: SF Symbol icons and shadows.
 */
import type { ReactNode } from 'react';
import { Platform, Text } from 'react-native';
import { GlassEffectContainer, Host, Image, Menu, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonBorderShape, buttonStyle, controlSize, frame, menuStyle, tint } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import { px, useTokens } from './theme';

export interface MapTool {
  id: string;
  icon: SFSymbol;
  /** The button's accessibility label. */
  label: string;
  active?: boolean;
  /** The menu's items: SwiftUI Buttons, Toggles, Pickers and Sections. */
  menu: ReactNode;
}

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

// A shadow token as boxShadow (dark mode's are 'none').
export const shadow = (token: string) => (token === 'none' ? undefined : token);

const BUTTON = 44;

/** left and bottom: where the column sits on the map (bottom clear of the tab bar). */
export function MapTools({ tools, left, bottom }: { tools: MapTool[]; left: number; bottom: number }) {
  const t = useTokens();
  if (!tools.length) return null;
  return (
    <Host matchContents style={{ position: 'absolute', left, bottom }}>
      <GlassEffectContainer spacing={px(t['space-2'])}>
        <VStack spacing={px(t['space-2'])}>
          {tools.map((tool) => (
            <Menu
              key={tool.id}
              label={<Image systemName={tool.icon} size={19} modifiers={[frame({ width: BUTTON - 16, height: BUTTON - 16 })]} />}
              modifiers={[
                accessibilityLabel(tool.label),
                menuStyle('button'),
                buttonStyle(tool.active ? 'glassProminent' : 'glass'),
                buttonBorderShape('circle'),
                controlSize('large'),
                ...(tool.active ? [tint(t['accent-solid'])] : []),
              ]}
            >
              {tool.menu}
            </Menu>
          ))}
        </VStack>
      </GlassEffectContainer>
    </Host>
  );
}
