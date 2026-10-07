import { describe, expect, it } from 'vitest';
import { themes } from './themes';
function luminance(hex: string) {
  const rgb = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function ratio(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
describe('readability of all theme palettes', () => {
  for (const theme of Object.values(themes)) it(`${theme.name}: text and primary action have at least 4.5:1 contrast`, () => {
    for (const surface of [theme.bg, theme.surface, theme.raised]) {
      for (const text of [theme.text, theme.muted, theme.danger, theme.success, theme.warning]) expect(ratio(text, surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(theme.onPrimary, theme.primary)).toBeGreaterThanOrEqual(4.5);
  });
  it('Origine: checked controls and links contrast with every surface', () => {
    for (const surface of [themes.origine.bg, themes.origine.surface, themes.origine.raised]) {
      expect(ratio(themes.origine.primary, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
