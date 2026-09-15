import type { ShoppingItem } from '@/types';

export function mergeShoppingItems(
  currentItems: ShoppingItem[],
  remoteItems: ShoppingItem[],
): ShoppingItem[] {
  const merged = new Map(currentItems.map((item) => [item.id, item]));

  for (const remoteItem of remoteItems) {
    const localItem = merged.get(remoteItem.id);
    if (!localItem || remoteItem.updatedAt >= localItem.updatedAt) {
      merged.set(remoteItem.id, remoteItem);
    }
  }

  return Array.from(merged.values());
}
