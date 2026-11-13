/**
 * The map's tools: a column of round icon buttons along its left edge, each opening its
 * panel beside the column (one at a time; tapping the button again or the map closes it).
 * A tool's button shows as on (accent) while its panel is open or its `active` is set (the
 * Day tool while a day is mapped). Icons are SF Symbols, through @expo/ui's SwiftUI Image.
 */
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Host, Image } from '@expo/ui/swift-ui';
import type { SFSymbol } from 'sf-symbols-typescript';
import { px, useTokens, type Tokens } from './theme';

export interface MapTool {
  id: string;
  icon: SFSymbol;
  /** The button's accessibility label and the panel's title. */
  label: string;
  active?: boolean;
  /** The panel's content; close() closes it (after a pick that's final, say). */
  panel: (close: () => void) => ReactNode;
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

const BUTTON = 44;

/** Where the column ends: what's beside it (an open panel, a banner) starts here. */
export const mapToolsWidth = (t: Tokens) => px(t['space-3']) + BUTTON + px(t['space-2']);

// A shadow token as boxShadow (dark mode's are 'none').
export const shadow = (token: string) => (token === 'none' ? undefined : token);

function ToolButton({ tool, on, onPress, t }: { tool: MapTool; on: boolean; onPress: () => void; t: Tokens }) {
  const color = on ? t['accent-fg'] : t['text-primary'];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tool.label}
      accessibilityState={{ selected: on }}
      style={({ pressed }) => ({
        width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: on ? t['accent-solid'] : pressed ? t['surface-hover'] : t['surface-float'],
        borderWidth: 1, borderColor: on ? t['accent-solid'] : t['glass-border'], boxShadow: shadow(t['shadow-md']),
      })}
    >
      <SFIcon name={tool.icon} fallback={tool.label[0]} size={19} color={color} />
    </Pressable>
  );
}

/** The panel's sections: a heading over a group of rows. */
export function PanelSection({ title, children }: { title?: string; children: ReactNode }) {
  const t = useTokens();
  return (
    <View style={{ gap: px(t['space-1']) }}>
      {title && (
        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.4, color: t['text-muted'], textTransform: 'uppercase' }}>
          {title}
        </Text>
      )}
      {children}
    </View>
  );
}

/** A panel row: a label (and detail) with a check when on. */
export function PanelRow({ label, detail, on, swatch, onPress }: {
  label: string; detail?: string; on?: boolean; swatch?: string; onPress: () => void;
}) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected: !!on }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: px(t['space-2']), minHeight: 40,
        paddingHorizontal: px(t['space-2']), borderRadius: px(t['radius-sm']),
        backgroundColor: on ? t['accent-surface'] : pressed ? t['surface-hover'] : 'transparent',
      })}
    >
      {swatch && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: swatch }} />}
      <Text style={{ flex: 1, fontSize: 15, fontWeight: on ? '600' : '400', color: on ? t['accent-text'] : t['text-primary'] }} numberOfLines={1}>
        {label}
      </Text>
      {detail && <Text style={{ fontSize: 13, color: t['text-muted'] }}>{detail}</Text>}
    </Pressable>
  );
}

/** top: where the column starts (below the header or the status bar); maxHeight bounds the panel. */
export function MapTools({ tools, top, maxHeight }: { tools: MapTool[]; top: number; maxHeight: number }) {
  const t = useTokens();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = tools.find((tool) => tool.id === openId) ?? null;
  const close = () => setOpenId(null);
  const left = px(t['space-3']);
  return (
    <>
      {open && <Pressable style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} onPress={close} accessibilityLabel="Close" />}
      <View style={{ position: 'absolute', top, left, gap: px(t['space-2']) }}>
        {tools.map((tool) => (
          <ToolButton key={tool.id} tool={tool} t={t} on={tool.id === openId || !!tool.active}
            onPress={() => setOpenId(tool.id === openId ? null : tool.id)} />
        ))}
      </View>
      {open && (
        <View style={{
          position: 'absolute', top, left: mapToolsWidth(t), right: px(t['space-3']), maxWidth: 320,
          maxHeight, borderRadius: px(t['radius-lg']), backgroundColor: t['surface-1'], borderWidth: 1, borderColor: t['border'], boxShadow: shadow(t['shadow-lg']),
        }}>
          <ScrollView
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={{ padding: px(t['space-3']), gap: px(t['space-3']) }}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: t['text-primary'] }}>{open.label}</Text>
            {open.panel(close)}
          </ScrollView>
        </View>
      )}
    </>
  );
}
