import { expect, it } from 'vitest';
import { itemNameKey, normalizeItemName, truncateUtf8 } from './itemValidation';
it('fits imported names into the API limit without splitting Unicode characters', () => {
  expect(truncateUtf8('é'.repeat(101), 200)).toBe('é'.repeat(100));
  expect(truncateUtf8('🛒'.repeat(51), 200)).toBe('🛒'.repeat(50));
  expect(truncateUtf8('abc🛒', 6)).toBe('abc');
  expect(truncateUtf8('Lait', 200)).toBe('Lait');
});

it('singularizes known product heads and adjacent adjectives, keeping brands, complements and quantities', () => {
  for (const [input, expected] of [
    ['Oranges', 'Orange'], ['TOMATES ROUGES', 'Tomate rouge'], ['Pommes de terre', 'Pomme de terre'],
    ['Œufs frais', 'Œuf frais'], ['Poireaux', 'Poireau'], ['Haricots verts', 'Haricot vert'],
    ['Brosses à dents', 'Brosse à dents'], ['Yaourts aux fruits', 'Yaourt aux fruits'],
    ['Boîtes de tomates', 'Boîte de tomates'], ['Gâteaux', 'Gâteau'], ['Pansements 20 pièces', 'Pansement 20 pièces'],
    ['Riz', 'Riz'], ['Noix', 'Noix'], ['Jus', 'Jus'], ['Pâtes complètes', 'Pâtes complètes'],
    ['Petits pois', 'Petits pois'], ['Épinards frais', 'Épinards frais'], ['Chips', 'Chips'],
    ['Always', 'Always'], ['Pringles', 'Pringles'], ['M&M’s', 'M&m’s'], ['Couscous', 'Couscous'],
  ]) {
    expect(normalizeItemName(input), input).toBe(expected);
    expect(normalizeItemName(expected), `idempotent ${input}`).toBe(expected);
  }
  expect(itemNameKey('Oranges')).toBe(itemNameKey('Orange'));
});

it('removes accidental whitespace and preserves useful word separators', () => {
  expect(normalizeItemName('  Pain   de\t mie\u00a0 ')).toBe('Pain de mie');
  expect(normalizeItemName(' \n\t ')).toBe('');
  expect(itemNameKey('  CAFE\u0301  ')).toBe(itemNameKey('Café'));
  expect(itemNameKey('Pâte')).not.toBe(itemNameKey('Pâté'));
});

it('uses one leading capital and lowercase for the rest, including accented names', () => {
  for (const value of ['pain', 'Pain', 'PAIN', '  pAiN  ']) {
    expect(normalizeItemName(value)).toBe('Pain');
    expect(itemNameKey(value)).toBe('pain');
  }
  expect(normalizeItemName('PAIN DE MIE')).toBe('Pain de mie');
  expect(normalizeItemName('  e\u0301PINARDS   FRAIS ')).toBe('Épinards frais');
  expect(normalizeItemName('CrÈmE FRAÎCHE')).toBe('Crème fraîche');
  expect(normalizeItemName('7UP')).toBe('7up');
  expect(normalizeItemName(normalizeItemName('PAIN'))).toBe('Pain');
});
