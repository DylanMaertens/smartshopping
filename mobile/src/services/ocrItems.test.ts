import { expect, it } from 'vitest';
import { cleanOcrText, prepareOcrText, parseOcrItems, mergeOcrItems } from './ocrItems';
import { OCR_COMPOUND_WORDS } from './ocrCompoundWords';
import type { ShoppingItem } from '@/types';
const milk: ShoppingItem = { id: 'milk', listId: 'home', name: 'Lait', quantity: 2, checked: true, updatedAt: 1 };
const create = (name: string): ShoppingItem => ({ ...milk, id: name, name, checked: false, quantity: 1 });
it.each(['.', ' / ', '/', '-', ' -', '- ', ' - ', '_', ' _ ', '__', '--', '-_./', ' — ', '–', ' • ', ' · ', ' | ', ';', ' → ', ' ★ ', ' * ', ' ☑ ', ' □ ', ' ▪ '])('splits OCR list separators %s before review', (separator) => {
  expect(prepareOcrText(`Pain${separator}Lait${separator}Œufs`)).toBe('Pain\nLait\nŒufs');
});
it.each([
  'Chou-fleur', 'Lait demi-écrémé', 'Essuie-tout', 'Coca-Cola',
  'Huile 1/2 L', 'Huile 1 / 2 L', 'Lait 1.5 L', 'Crème 1,5%', 'Œufs 6 - 12',
  'St. Môret', 'M. Propre', 'Lait U.H.T. entier', 'Crème 15% M.G.',
  'Lessive 10 g/L', 'Protéines 20 g/100 g', 'Sauce (ail / fines herbes)',
  'Shampooing (corps - cheveux)', 'Vitamine C + zinc',
])('preserves compound words and meaningful punctuation: %s', (name) => {
  expect(prepareOcrText(`${name} / Pain`)).toBe(`${cleanOcrText(name)}\nPain`);
});
it.each(OCR_COMPOUND_WORDS)('preserves dictionary compound %s with either hyphens or underscores', (word) => {
  expect(prepareOcrText(word)).toBe(word);
  expect(prepareOcrText(word.replace(/-/g, '_'))).toBe(word);
  expect(prepareOcrText(word.replace(/-/g, ' _ '))).toBe(word);
});
it('splits tight separators around compounds and normalizes underscores before adding', () => {
  const prepared = prepareOcrText('chou_fleur-pain_lait/essuie_tout.coca_cola');
  expect(prepared).toBe('chou-fleur\npain\nlait\nessuie-tout\ncoca-cola');
  expect(parseOcrItems(prepared)).toEqual([
    { name: 'Chou-fleur', quantity: 1 }, { name: 'Pain', quantity: 1 },
    { name: 'Lait', quantity: 1 }, { name: 'Essuie-tout', quantity: 1 },
    { name: 'Coca-cola', quantity: 1 },
  ]);
  expect(parseOcrItems('2 x CHOU_FLEUR\nlait demi_écrémé')).toEqual([
    { name: 'Chou-fleur', quantity: 2 }, { name: 'Lait demi-écrémé', quantity: 1 },
  ]);
});
it('uses whole dictionary words, not arbitrary fragments or dot/slash aliases', () => {
  expect(prepareOcrText('superchou-fleur/chou-fleurette/chou.fleur/chou/fleur')).toBe(
    'superchou\nfleur\nchou\nfleurette\nchou\nfleur\nchou\nfleur',
  );
  expect(prepareOcrText('CHOU_FLEUR-pain-demi_e\u0301cre\u0301me\u0301')).toBe('CHOU-FLEUR\npain\ndemi-écrémé');
  expect(prepareOcrText('chou--fleur/chou__fleur')).toBe('chou\nfleur\nchou\nfleur');
});
it('preserves original underscores for undo and does not re-split manual review', () => {
  expect(cleanOcrText('pain_lait\nchou_fleur')).toBe('pain_lait\nchou_fleur');
  expect(parseOcrItems('pain-lait\npain_lait')).toEqual([
    { name: 'Pain-lait', quantity: 1 }, { name: 'Pain_lait', quantity: 1 },
  ]);
  expect(() => parseOcrItems(prepareOcrText(Array(51).fill('Pain').join('_')))).toThrow('50');
});
it('handles typography, numbered lists, repeated markers and existing line breaks', () => {
  expect(prepareOcrText('1. Chou‑fleur / lait demi‐écrémé\r\n2) Pain — Œufs 6–12\n• Café ... Thé // Sel')).toBe(
    'Chou-fleur\nlait demi-écrémé\nPain\nŒufs 6-12\nCafé\nThé\nSel',
  );
});
it('keeps quantities attached and enforces the import limit after separation', () => {
  expect(parseOcrItems(prepareOcrText('2 x lait / Pain x 3'))).toEqual([
    { name: 'Lait', quantity: 2 }, { name: 'Pain', quantity: 3 },
  ]);
  expect(() => parseOcrItems(prepareOcrText(Array(51).fill('Pain').join(' / ')))).toThrow('50');
});
it('does not re-split punctuation explicitly kept in a reviewed article or dictated text', () => {
  expect(parseOcrItems('Shampooing / douche')).toEqual([{ name: 'Shampooing / douche', quantity: 1 }]);
});
it('removes decorative OCR symbols while preserving quantities, accents and packaging', () => {
  const cleaned = cleanOcrText('[x] 2 × Lait 1,5% ★\n☑ Huile d’olive 1/2 L\n→ Café 250 g\n___\n🥕 Carottes\n1. Pâtes sans-gluten');
  expect(cleaned).toBe('2 × Lait 1,5%\nHuile d’olive 1/2 L\nCafé 250 g\nCarottes\nPâtes sans-gluten');
  expect(parseOcrItems(cleaned)[0]).toEqual({ name: 'Lait 1,5%', quantity: 2 });
});
it('cleans bullets, whitespace and explicit quantities without mistaking list numbering for quantity', () => {
  expect(parseOcrItems('• PAIN\n2 x lait\nPOMMES x 3\n1. Crème   fraîche\n7up')).toEqual([
    { name: 'Pain', quantity: 1 }, { name: 'Lait', quantity: 2 }, { name: 'Pomme', quantity: 3 },
    { name: 'Crème fraîche', quantity: 1 }, { name: '7up', quantity: 1 },
  ]);
});
it('requires correction of invalid or oversized batches before adding anything', () => {
  for (const text of ['', '0 x pain', '1000 x lait', 'é'.repeat(101), Array(51).fill('Pain').join('\n')]) {
    expect(() => parseOcrItems(text)).toThrow();
  }
});
it('merges repeated names with existing articles and preserves the original list on failure', () => {
  const result = mergeOcrItems([milk], parseOcrItems('1 x lait\nLait\nPain'), create);
  expect(result.find((item) => item.id === 'milk')).toMatchObject({ quantity: 4, checked: false });
  expect(result).toHaveLength(2);
  expect(milk.quantity).toBe(2);
  expect(() => mergeOcrItems([milk], parseOcrItems('Pain\n999 x Lait'), create)).toThrow();
  expect(milk.quantity).toBe(2);
});
it('counts all synchronized additions when importing another quantity', () => {
  const current = [milk, { ...milk, id: 'second', quantity: 996 }];
  const result = mergeOcrItems(current, parseOcrItems('Lait'), create);
  expect(result.reduce((sum, item) => sum + item.quantity, 0)).toBe(999);
  expect(result.every((item) => !item.checked)).toBe(true);
  expect(() => mergeOcrItems(current, parseOcrItems('Pain\n2 x Lait'), create)).toThrow(/999/);
  expect(current.map((item) => item.quantity)).toEqual([2, 996]);
});
