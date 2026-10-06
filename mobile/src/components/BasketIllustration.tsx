import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
export function BasketIllustration({ complete }: { complete: boolean }) {
  const { theme } = useTheme();
  const pixel = theme.id === 'pixel';
  return <Svg width={88} height={88} viewBox="0 0 88 88" accessibilityElementsHidden importantForAccessibility="no">
    <Path d={pixel ? 'M8 16H20V24H76V48H68V56H28V48H20V24 M28 56V64H68' : 'M9 18h11l10 38h35l12-29H23M30 56l-3 9h40'}
      fill="none" stroke={theme.text} strokeWidth={pixel ? 5 : 3} strokeLinecap={pixel ? 'square' : 'round'} strokeLinejoin={pixel ? 'miter' : 'round'} />
    <Circle cx="32" cy="74" r="4" fill={theme.text} /><Circle cx="64" cy="74" r="4" fill={theme.text} />
    {complete ? <Path d={pixel ? 'M36 37v6h7v-6h7v-6h7' : 'M35 39l8 8 15-17'} fill="none" stroke={theme.success} strokeWidth={4} strokeLinecap={pixel ? 'square' : 'round'} /> : null}
  </Svg>;
}
