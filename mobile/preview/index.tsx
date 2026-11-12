import React from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { HomeScreen } from '../src/screens/HomeScreen';
import { PremiumProvider } from '../src/premium/PremiumProvider';
createRoot(document.getElementById('root')!).render(<SafeAreaProvider><PremiumProvider><ThemeProvider pixelFontReady>
  <View style={{ flex: 1, height: '100%' }}><HomeScreen /></View>
</ThemeProvider></PremiumProvider></SafeAreaProvider>);
