import { createMMKV } from 'react-native-mmkv';
import type { ShoppingItem } from '@/types';

const storage = createMMKV({ id: 'shopping-list-storage' });
const CURRENT_LIST_KEY = 'current-list-items';

export class ShoppingListStorage {
  static getCurrentList(): ShoppingItem[] {
    const raw = storage.getString(CURRENT_LIST_KEY);
    if (!raw) return [];

    return JSON.parse(raw) as ShoppingItem[];
  }

  static saveCurrentList(items: ShoppingItem[]) {
    storage.set(CURRENT_LIST_KEY, JSON.stringify(items));
  }

  static clearCurrentList() {
    storage.remove(CURRENT_LIST_KEY);
  }
}
