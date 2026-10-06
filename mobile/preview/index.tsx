import React from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { HomeScreen } from '../src/screens/HomeScreen';
createRoot(document.getElementById('root')!).render(<SafeAreaProvider><ThemeProvider pixelFontReady>
  <View style={{ flex: 1, height: '100%' }}><HomeScreen /></View>
</ThemeProvider></SafeAreaProvider>);
