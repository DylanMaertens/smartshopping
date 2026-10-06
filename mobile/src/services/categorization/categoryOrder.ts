import { STORE_CATEGORIES } from './categoryService';
import { sortItemsForDisplay } from '../itemOrder';
import type { CategorySection, ShoppingItem } from '@/types';

export function defaultCategoryOrder(): string[] {
  return [...STORE_CATEGORIES].sort((a, b) => a.orderIndex - b.orderIndex).map((category) => category.id);
}

/** Repair stale preferences and append newly introduced categories without losing the chosen order. */
export function normalizeCategoryOrder(value: unknown): string[] {
  const defaults = defaultCategoryOrder();
  const known = new Set(defaults);
  const saved = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && known.has(id)) : [];
  return [...new Set([...saved, ...defaults])];
}

export function moveCategory(order: string[], id: string, destination: number): string[] {
  const from = order.indexOf(id);
  if (from < 0 || !Number.isFinite(destination)) return order;
  const to = Math.max(0, Math.min(order.length - 1, Math.round(destination)));
  if (from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export function groupItemsByCategory(items: ShoppingItem[], order: string[]): CategorySection[] {
  const positions = new Map(normalizeCategoryOrder(order).map((id, index) => [id, index]));
  const byName = new Map(STORE_CATEGORIES.map((category) => [category.name, positions.get(category.id)!]));
  const grouped = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    if (item.deletedAt) continue;
    const name = item.category ?? 'À classer';
    const group = grouped.get(name) ?? [];
    group.push(item);
    grouped.set(name, group);
  }
  return [...grouped].map(([categoryName, categoryItems]) => ({
    categoryName, items: sortItemsForDisplay(categoryItems), orderIndex: byName.get(categoryName) ?? positions.size,
  })).sort((a, b) => a.orderIndex - b.orderIndex || a.categoryName.localeCompare(b.categoryName, 'fr'));
}
