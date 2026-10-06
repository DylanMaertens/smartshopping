import { expect, it } from 'vitest';
import { sortItemsForDisplay } from './itemOrder';
import type { ShoppingItem } from '@/types';

const item = (id: string, name: string, updatedAt = 1): ShoppingItem => ({
  id, name, updatedAt, listId: 'home', quantity: 1, checked: false,
});

it('sorts accents, case, spaces and French ligatures consistently without changing the source', () => {
  const items = [item('riz', 'Riz'), item('oeufs', 'Œufs'), item('pain', '  PAIN '),
    item('farine', 'Farine'), item('epinards', 'Épinards'), item('eau', 'Eau')];
  const before = [...items];
  const expected = ['eau', 'epinards', 'farine', 'oeufs', 'pain', 'riz'];
  expect(sortItemsForDisplay(items).map((entry) => entry.id)).toEqual(expected);
  expect(sortItemsForDisplay([...items].reverse()).map((entry) => entry.id)).toEqual(expected);
  expect(items).toEqual(before);
  expect(sortItemsForDisplay(items)[0]).toBe(items[5]);
});

it('breaks identical names by shared ID even when insertion orders and dates differ', () => {
  const a = item('a', 'Pain');
  const b = item('b', 'pain', 200);
  expect(sortItemsForDisplay([b, a]).map((entry) => entry.id)).toEqual(['a', 'b']);
  expect(sortItemsForDisplay([a, b]).map((entry) => entry.id)).toEqual(['a', 'b']);
});

it('keeps positions after quantity updates or sync and repositions a renamed article', () => {
  const items = [item('riz', 'Riz'), item('pain', 'Pain')];
  const changed = items.map((entry) => ({ ...entry, quantity: 3, updatedAt: 500, syncedAt: 600 }));
  expect(sortItemsForDisplay(changed).map((entry) => entry.id)).toEqual(['pain', 'riz']);
  expect(sortItemsForDisplay([{ ...changed[0], name: 'Abricots' }, changed[1]]).map((entry) => entry.id)).toEqual(['riz', 'pain']);
});
