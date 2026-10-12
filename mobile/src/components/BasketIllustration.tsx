import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import { PodunaMark } from './PodunaMark';
export function BasketIllustration({ complete }: { complete: boolean }) {
  const { theme } = useTheme();
  return <View style={{ width: 104, height: 104 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <PodunaMark size={96} />
    {complete ? <Svg width={32} height={32} viewBox="0 0 32 32" style={{ position: 'absolute', right: 0, bottom: 0 }}>
      <Circle cx="16" cy="16" r="15" fill={theme.surface} stroke={theme.success} strokeWidth={2} />
      <Path d="m9 16 5 5 9-10" fill="none" stroke={theme.success} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg> : null}
  </View>;
}
