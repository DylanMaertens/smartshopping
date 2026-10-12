import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { PODUNA_PATHS } from './podunaPaths';

/** Decorative when adjacent to the visible brand name; colors follow the saved theme. */
export function PodunaMark({ size = 40 }: { size?: number }) {
  const { theme } = useTheme();
  return <Svg width={size} height={size} viewBox="160 160 934 934" accessibilityElementsHidden importantForAccessibility="no">
    {PODUNA_PATHS.map((d, i) => <Path key={i} d={d} fill={theme.primary} fillRule="evenodd" />)}
  </Svg>;
}
