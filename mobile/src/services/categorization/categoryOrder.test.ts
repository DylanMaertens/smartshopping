import { describe, expect, it } from 'vitest';
import { defaultCategoryOrder, groupItemsByCategory, moveCategory, normalizeCategoryOrder } from './categoryOrder';
import type { ShoppingItem } from '@/types';

describe('category order', () => {
  it('repairs unknown, repeated and missing categories without losing preferences', () => {
    const repaired = normalizeCategoryOrder(['boissons', null, 'old', 'boissons', 'surgeles']);
    expect(repaired.slice(0, 2)).toEqual(['boissons', 'surgeles']);
    expect(new Set(repaired)).toEqual(new Set(defaultCategoryOrder()));
    expect(repaired.length).toBe(defaultCategoryOrder().length);
    expect(normalizeCategoryOrder({ invalid: true })).toEqual(defaultCategoryOrder());
  });

  it('moves and clamps a category without changing the input', () => {
    const order = defaultCategoryOrder();
    const moved = moveCategory(order, 'boissons', -20);
    expect(moved[0]).toBe('boissons');
    expect(order[0]).toBe('fruits-legumes');
    expect(moveCategory(moved, 'boissons', 999).slice(-1)[0]).toBe('boissons');
    expect(moveCategory(order, 'unknown', 2)).toBe(order);
    expect(moveCategory(order, 'boissons', NaN)).toBe(order);
  });

  it('orders populated sections, keeps checked items, and puts unknown categories at the end', () => {
    const item = (id: string, category?: string, deletedAt?: number): ShoppingItem => ({
      id, name: id, category, deletedAt, listId: 'home', quantity: 1, checked: true, updatedAt: 1,
    });
    const items = [item('pain', 'Boulangerie'), item('eau', 'Boissons'), item('x', 'Nouveau'), item('z'), item('gone', 'Surgelés', 2)];
    const sections = groupItemsByCategory(items, ['boissons']);
    expect(sections.map((section) => section.categoryName)).toEqual(['Boissons', 'Boulangerie', 'À classer', 'Nouveau']);
    expect(sections[0].items).toEqual([items[1]]);
    expect(groupItemsByCategory([], ['boissons'])).toEqual([]);
  });
});

it('appends the new non-food categories without rearranging an existing saved order', () => {
  const additions = ['papeterie-bureau', 'bricolage-quincaillerie', 'jardin-exterieur', 'auto-moto'];
  const saved = defaultCategoryOrder().filter((id) => !additions.includes(id)).reverse();
  const repaired = normalizeCategoryOrder(saved);
  expect(repaired.slice(0, saved.length)).toEqual(saved);
  expect(repaired.slice(saved.length)).toEqual(additions);
  const item: ShoppingItem = { id: 'pen', name: 'Stylo', category: 'Papeterie & fournitures de bureau', listId: 'home', quantity: 1, checked: false, updatedAt: 1 };
  expect(groupItemsByCategory([item], repaired)[0].categoryName).toBe('Papeterie & fournitures de bureau');
});

it('keeps existing category order and list assignments when detailed aisles are introduced', () => {
  const newIds = ['soins-cheveux', 'soins-visage-corps', 'hygiene-dentaire', 'maquillage-parfums', 'alimentation-animale', 'accessoires-animaux', 'maison-cuisine', 'vetements-linge', 'electricite-electronique', 'jeux-loisirs'];
  const saved = defaultCategoryOrder().filter((id) => !newIds.includes(id)).reverse();
  const order = normalizeCategoryOrder(saved);
  expect(order.slice(0, saved.length)).toEqual(saved);
  expect(order.slice(saved.length)).toEqual(newIds);
  const item: ShoppingItem = { id: 'pet', name: 'Croquettes', category: 'Animaux', listId: 'home', quantity: 1, checked: false, updatedAt: 1 };
  expect(groupItemsByCategory([item], order)[0].categoryName).toBe('Animaux');
});
