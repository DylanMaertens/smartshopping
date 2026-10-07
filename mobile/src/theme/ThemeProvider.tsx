import React, { createContext, useContext, useState } from 'react';
import { Platform } from 'react-native';
import { LocalKeyValueStorage } from '@/services/storage/localKeyValueStorage';
import { DEFAULT_THEME_ID, isThemeId, themes, type ThemeId } from './themes';

export const THEME_STORAGE_KEY = 'appearance.theme.v1';
const ThemeContext = createContext({ theme: themes[DEFAULT_THEME_ID], headingFont: Platform.select({ ios: 'Georgia', default: 'serif' }) as string | undefined,
  selectTheme: (_id: ThemeId) => {}, error: null as string | null });
export function ThemeProvider({ children, pixelFontReady = false }: React.PropsWithChildren<{ pixelFontReady?: boolean }>) {
  const [id, setId] = useState<ThemeId>(() => {
    // Keep every valid saved choice, including the former default Minimal.
    try { const saved = LocalKeyValueStorage.getString(THEME_STORAGE_KEY); return isThemeId(saved) ? saved : DEFAULT_THEME_ID; }
    catch { return DEFAULT_THEME_ID; }
  });
  const [error, setError] = useState<string | null>(null);
  function selectTheme(next: ThemeId) {
    try { LocalKeyValueStorage.setString(THEME_STORAGE_KEY, next); setId(next); setError(null); }
    catch { setError('Impossible d’enregistrer l’apparence. Réessaie.'); }
  }
  const headingFont = id === 'origine' || id === 'papier' ? Platform.select({ ios: 'Georgia', default: 'serif' })
    : id === 'pixel' ? (pixelFontReady ? 'Silkscreen' : Platform.select({ ios: 'Courier', default: 'monospace' })) : undefined;
  return <ThemeContext.Provider value={{ theme: themes[id], headingFont, selectTheme, error }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
