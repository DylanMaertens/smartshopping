import { LocalKeyValueStorage } from './localKeyValueStorage';
import type { ShoppingItem } from '@/types';

const CURRENT_LIST_KEY = 'current-shopping-list';
const LAST_SYNC_KEY = 'current-shopping-list-last-sync';

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

  static getPendingChanges(items = this.getCurrentList()): ShoppingItem[] {
    return items.filter((item) => !item.syncedAt || item.updatedAt > item.syncedAt);
  }

  static getLastSyncTimestamp(): number {
    const raw = LocalKeyValueStorage.getString(LAST_SYNC_KEY);
    if (!raw) return 0;

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  static markAsSynced(items: ShoppingItem[], syncedAt: number): ShoppingItem[] {
    const syncedItems = items.map((item) => ({ ...item, syncedAt }));
    this.saveCurrentList(syncedItems);
    LocalKeyValueStorage.setString(LAST_SYNC_KEY, String(syncedAt));
    return syncedItems;
  }

  static applyRemoteChanges(currentItems: ShoppingItem[], remoteItems: ShoppingItem[]): ShoppingItem[] {
    const merged = new Map(currentItems.map((item) => [item.id, item]));

    for (const remoteItem of remoteItems) {
      const localItem = merged.get(remoteItem.id);
      if (!localItem || remoteItem.updatedAt >= localItem.updatedAt) {
        merged.set(remoteItem.id, remoteItem);
      }
    }

    const nextItems = Array.from(merged.values()).filter((item) => !item.deletedAt);
    this.saveCurrentList(nextItems);
    return nextItems;
  }

  static clearCurrentList(): void {
    LocalKeyValueStorage.delete(CURRENT_LIST_KEY);
    LocalKeyValueStorage.delete(LAST_SYNC_KEY);
  }
}
