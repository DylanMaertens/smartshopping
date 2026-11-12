import { describe, expect, it } from 'vitest';
import { allowsPremiumSimulation, canUseTheme, PREMIUM_THEMES } from './premiumPolicy';
import { themeIds } from '@/theme/themes';

describe('premium preview policy', () => {
  it('gates only the four selected themes', () => {
    for (const id of themeIds) {
      expect(canUseTheme(id, false)).toBe(!PREMIUM_THEMES.includes(id));
      expect(canUseTheme(id, true)).toBe(true);
    }
  });
  it('never accepts a simulation in direct/store builds, even in development', () => {
    for (const channel of ['direct', 'store']) for (const dev of [false, true]) expect(allowsPremiumSimulation(channel, dev)).toBe(false);
    expect(allowsPremiumSimulation('preview', false)).toBe(true);
    expect(allowsPremiumSimulation(undefined, true)).toBe(true);
    expect(allowsPremiumSimulation(undefined, false)).toBe(false);
  });
});
