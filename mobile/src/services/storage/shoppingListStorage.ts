import { LocalKeyValueStorage } from './localKeyValueStorage';
import type { ShoppingItem } from '@/types';

const CURRENT_LIST_KEY = 'current-shopping-list';

export class ShoppingListStorage {
  static getCurrentList(): ShoppingItem[] {
    const raw = LocalKeyValueStorage.getString(CURRENT_LIST_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as ShoppingItem[];
    return Array.isArray(parsed) ? parsed : [];
  }

  static saveCurrentList(items: ShoppingItem[]): void {
    LocalKeyValueStorage.setString(CURRENT_LIST_KEY, JSON.stringify(items));
  }

  static clearCurrentList(): void {
    LocalKeyValueStorage.delete(CURRENT_LIST_KEY);
  }
}
