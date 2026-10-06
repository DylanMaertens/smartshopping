import type { ShoppingItem } from '@/types';
import { itemNameKey, normalizeItemName } from './itemValidation';

const byId = (a: ShoppingItem, b: ShoppingItem) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const timestamp = (item: ShoppingItem) => Math.max(Date.now(), item.updatedAt + 1);

/** Keep independent additions in storage: materializing their sum would count
 * overlapping offline merges twice. These rows are only a view, never persisted. */
export function groupEquivalentItems(items: ShoppingItem[]): ShoppingItem[] {
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    if (item.deletedAt) continue;
    const key = JSON.stringify([item.listId, itemNameKey(item.name)]);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    group.sort(byId);
    return {
      ...group[0], name: normalizeItemName(group[0].name),
      barcode: group.find((item) => item.barcode)?.barcode,
      category: group.find((item) => item.category)?.category,
      quantity: group.reduce((total, item) => total + item.quantity, 0),
      checked: group.every((item) => item.checked),
      updatedAt: Math.max(...group.map((item) => item.updatedAt)),
    };
  });
}

export function getEquivalentItems(items: ShoppingItem[], id: string): ShoppingItem[] {
  const target = items.find((item) => item.id === id && !item.deletedAt);
  if (!target) return [];
  return items.filter((item) => !item.deletedAt && item.listId === target.listId
    && itemNameKey(item.name) === itemNameKey(target.name)).sort(byId);
}

export function incrementGroup(items: ShoppingItem[], id: string, amount = 1, reopen = false): ShoppingItem[] {
  const group = getEquivalentItems(items, id);
  if (!group.length || amount < 1 || !Number.isInteger(amount)
    || group.reduce((total, item) => total + item.quantity, 0) + amount > 999) return items;
  const ids = new Set(group.map((item) => item.id));
  return items.map((item) => {
    if (item.id !== group[0].id && !(reopen && ids.has(item.id) && item.checked)) return item;
    return { ...item, name: normalizeItemName(item.name),
      quantity: item.quantity + (item.id === group[0].id ? amount : 0),
      checked: reopen ? false : item.checked, updatedAt: timestamp(item) };
  });
}

export function decrementGroup(items: ShoppingItem[], id: string): ShoppingItem[] {
  const group = getEquivalentItems(items, id);
  if (!group.length || group.reduce((total, item) => total + item.quantity, 0) <= 1) return items;
  const target = group.find((item) => item.quantity > 1) ?? group[group.length - 1];
  return items.map((item) => {
    if (item.id !== target.id) return item;
    const updatedAt = timestamp(item);
    return item.quantity > 1 ? { ...item, quantity: item.quantity - 1, updatedAt }
      : { ...item, deletedAt: updatedAt, updatedAt };
  });
}
