import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { HomeScreen } from './src/screens/HomeScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
function AppContent() {
  const { theme } = useTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
    <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
    <HomeScreen />
  </SafeAreaView>;
}
export default function App() {
  const [loaded] = useFonts({ Silkscreen: require('./assets/fonts/Silkscreen-Regular.ttf') });
  return <SafeAreaProvider><ThemeProvider pixelFontReady={loaded}><AppContent /></ThemeProvider></SafeAreaProvider>;
}
