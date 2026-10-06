import { expect, it } from 'vitest';
import { cleanOcrText, parseOcrItems, mergeOcrItems } from './ocrItems';
import type { ShoppingItem } from '@/types';
const milk: ShoppingItem = { id: 'milk', listId: 'home', name: 'Lait', quantity: 2, checked: true, updatedAt: 1 };
const create = (name: string): ShoppingItem => ({ ...milk, id: name, name, checked: false, quantity: 1 });
it('removes decorative OCR symbols while preserving quantities, accents and packaging', () => {
  const cleaned = cleanOcrText('[x] 2 × Lait 1,5% ★\n☑ Huile d’olive 1/2 L\n→ Café 250 g\n___\n🥕 Carottes\n1. Pâtes sans-gluten');
  expect(cleaned).toBe('2 × Lait 1,5%\nHuile d’olive 1/2 L\nCafé 250 g\nCarottes\nPâtes sans-gluten');
  expect(parseOcrItems(cleaned)[0]).toEqual({ name: 'Lait 1,5%', quantity: 2 });
});
it('cleans bullets, whitespace and explicit quantities without mistaking list numbering for quantity', () => {
  expect(parseOcrItems('• PAIN\n2 x lait\nPOMMES x 3\n1. Crème   fraîche\n7up')).toEqual([
    { name: 'Pain', quantity: 1 }, { name: 'Lait', quantity: 2 }, { name: 'Pommes', quantity: 3 },
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
