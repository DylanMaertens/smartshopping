import React, { createContext, useContext, useState } from 'react';
import { Platform } from 'react-native';
import { PersonalSettings as LocalKeyValueStorage, THEME_STORAGE_KEY } from '@/services/storage/personalSettings';
import { DEFAULT_THEME_ID, isThemeId, themes, type ThemeId } from './themes';
import { MotionProvider } from './motion';

export { THEME_STORAGE_KEY } from '@/services/storage/personalSettings';
const ThemeContext = createContext({ theme: themes[DEFAULT_THEME_ID], headingFont: Platform.select({ ios: 'Georgia', default: 'serif' }) as string | undefined,
  selectTheme: (_id: ThemeId) => {}, reloadTheme: () => {}, error: null as string | null });
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
  function reloadTheme() {
    try {
      const saved = LocalKeyValueStorage.getString(THEME_STORAGE_KEY);
      setId(isThemeId(saved) ? saved : DEFAULT_THEME_ID); setError(null);
    } catch { setError('Données restaurées, mais impossible de recharger l’apparence. Relance l’application.'); }
  }
  const headingFont = id === 'origine' || id === 'papier' ? Platform.select({ ios: 'Georgia', default: 'serif' })
    : id === 'pixel' ? (pixelFontReady ? 'Silkscreen' : Platform.select({ ios: 'Courier', default: 'monospace' })) : undefined;
  return <ThemeContext.Provider value={{ theme: themes[id], headingFont, selectTheme, reloadTheme, error }}><MotionProvider>{children}</MotionProvider></ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
