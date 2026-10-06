import React, { createContext, useContext, useState } from 'react';
import { Platform } from 'react-native';
import { LocalKeyValueStorage } from '@/services/storage/localKeyValueStorage';
import { isThemeId, themes, type ThemeId } from './themes';

export const THEME_STORAGE_KEY = 'appearance.theme.v1';
const ThemeContext = createContext({ theme: themes.minimal, headingFont: undefined as string | undefined,
  selectTheme: (_id: ThemeId) => {}, error: null as string | null });
export function ThemeProvider({ children, pixelFontReady = false }: React.PropsWithChildren<{ pixelFontReady?: boolean }>) {
  const [id, setId] = useState<ThemeId>(() => {
    try { const saved = LocalKeyValueStorage.getString(THEME_STORAGE_KEY); return isThemeId(saved) ? saved : 'minimal'; }
    catch { return 'minimal'; }
  });
  const [error, setError] = useState<string | null>(null);
  function selectTheme(next: ThemeId) {
    try { LocalKeyValueStorage.setString(THEME_STORAGE_KEY, next); setId(next); setError(null); }
    catch { setError('Impossible d’enregistrer l’apparence. Réessaie.'); }
  }
  const headingFont = id === 'papier' ? Platform.select({ ios: 'Georgia', default: 'serif' })
    : id === 'pixel' ? (pixelFontReady ? 'Silkscreen' : Platform.select({ ios: 'Courier', default: 'monospace' })) : undefined;
  return <ThemeContext.Provider value={{ theme: themes[id], headingFont, selectTheme, error }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
