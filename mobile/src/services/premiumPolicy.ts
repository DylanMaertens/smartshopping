import type { ThemeId } from '@/theme/themes';

export const PREMIUM_THEMES: readonly ThemeId[] = ['minimal', 'papier', 'pastel', 'pixel'];
export function canUseTheme(id: ThemeId, premium: boolean): boolean {
  return premium || !PREMIUM_THEMES.includes(id);
}
/** Local simulation is never a purchase receipt or a server entitlement. */
export function allowsPremiumSimulation(channel: unknown, development: boolean): boolean {
  return channel === 'preview' || (development && channel !== 'store' && channel !== 'direct');
}
