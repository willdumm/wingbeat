/**
 * The Wingbeat lockup (the web's logoLockupMarkup, src/shared/brand.ts): the two-wing mark and
 * the instance's name, small, on a floating-surface pill. The mark is logo_plain.svg rasterized
 * (assets/logo-mark*.png), its black wing in each scheme's text-primary as on the web; redo
 * them from that file if the mark changes:
 *   rsvg-convert -h 72 logo_plain.svg -o apps/mobile/assets/logo-mark.png
 *   sed 's/fill:#000000/fill:#E9EEF2/I' logo_plain.svg | rsvg-convert -h 72 -o apps/mobile/assets/logo-mark-dark.png
 */
import { Image, Text, useColorScheme, View } from 'react-native';
import { px, useTokens } from './theme';

const MARK = require('../../assets/logo-mark.png');
const MARK_DARK = require('../../assets/logo-mark-dark.png');
// The PNGs' aspect (rsvg-convert keeps the SVG's).
const MARK_ASPECT = 76 / 72;

/** height: the pill's. Decorative: it takes no touches and says nothing to VoiceOver. */
export function LogoLockup({ appName, height = 28 }: { appName: string; height?: number }) {
  const t = useTokens();
  const dark = useColorScheme() === 'dark';
  const mark = Math.round(height * 0.6);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{
        height, flexDirection: 'row', alignItems: 'center', gap: px(t['space-1']) + 1,
        paddingHorizontal: px(t['space-2']) + 2, borderRadius: height / 2,
        backgroundColor: t['surface-float'], borderWidth: 1, borderColor: t['glass-border'], opacity: 0.9,
      }}>
      <Image source={dark ? MARK_DARK : MARK} style={{ width: mark * MARK_ASPECT, height: mark }} />
      <Text style={{ fontSize: Math.round(height * 0.46), fontWeight: '700', letterSpacing: -0.2, color: t['text-primary'] }} numberOfLines={1}>
        {appName}
      </Text>
    </View>
  );
}
