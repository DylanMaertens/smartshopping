import { getDatabase } from '@/db/client';
import { mergeShoppingItems } from '@/services/sync/mergeItems';
import type { ShoppingItem, ShoppingList } from '@/types';

const ACTIVE_LIST_KEY = 'active-list-id';

type ListRow = { id: string; name: string; created_at: number; updated_at: number };
type ItemRow = {
  id: string;
  list_id: string;
  name: string;
  barcode: string | null;
  category: string | null;
  quantity: number;
  checked: number;
  updated_at: number;
  synced_at: number | null;
  deleted_at: number | null;
};
type SyncOperationRow = { payload: string };

export class ShoppingListStorage {
  static getLists(): ShoppingList[] {
    this.ensureDefaultList();
    return getDatabase()
      .getAllSync<ListRow>(
        `SELECT id, name, created_at, updated_at
         FROM shopping_lists WHERE deleted_at IS NULL
         ORDER BY updated_at DESC`,
      )
      .map(mapListRow);
  }

  static getActiveListId(): string {
    this.ensureDefaultList();
    const stored = getMetadata(ACTIVE_LIST_KEY);
    const existing = stored
      ? getDatabase().getFirstSync<{ id: string }>(
          'SELECT id FROM shopping_lists WHERE id = ? AND deleted_at IS NULL',
          stored,
        )
      : null;
    if (existing) return existing.id;

    const first = getDatabase().getFirstSync<{ id: string }>(
      'SELECT id FROM shopping_lists WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1',
    );
    const activeId = first?.id ?? this.ensureDefaultList();
    setMetadata(ACTIVE_LIST_KEY, activeId);
    return activeId;
  }

  static setActiveList(listId: string): void {
    setMetadata(ACTIVE_LIST_KEY, listId);
  }

  static createList(name: string): ShoppingList {
    const now = Date.now();
    const list = { id: `list-${now}-${Math.random().toString(36).slice(2)}`, name, createdAt: now, updatedAt: now };
    getDatabase().runSync(
      'INSERT INTO shopping_lists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      list.id,
      list.name,
      list.createdAt,
      list.updatedAt,
    );
    this.setActiveList(list.id);
    return list;
  }

  static importSharedList(listId: string): ShoppingList {
    const now = Date.now();
    getDatabase().runSync(
      `INSERT INTO shopping_lists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at`,
      listId, 'Liste partagée', now, now,
    );
    this.setActiveList(listId);
    return { id: listId, name: 'Liste partagée', createdAt: now, updatedAt: now };
  }

  static renameList(listId: string, name: string): void {
    getDatabase().runSync(
      'UPDATE shopping_lists SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      name,
      Date.now(),
      listId,
    );
  }

  static archiveList(listId: string): string {
    const db = getDatabase();
    const lists = this.getLists();
    if (lists.length <= 1) return listId;

    db.runSync('UPDATE shopping_lists SET deleted_at = ?, updated_at = ? WHERE id = ?', Date.now(), Date.now(), listId);
    const nextId = lists.find((list) => list.id !== listId)?.id ?? this.ensureDefaultList();
    this.setActiveList(nextId);
    return nextId;
  }

  static getCurrentList(listId = this.getActiveListId()): ShoppingItem[] {
    return getDatabase()
      .getAllSync<ItemRow>(
        `SELECT id, list_id, name, barcode, category, quantity, checked,
                updated_at, synced_at, deleted_at
         FROM items WHERE list_id = ? ORDER BY created_at DESC`,
        listId,
      )
      .map(mapItemRow);
  }

  static saveCurrentList(listId: string, items: ShoppingItem[]): void {
    const db = getDatabase();
    db.withTransactionSync(() => {
      db.runSync('UPDATE shopping_lists SET updated_at = ? WHERE id = ?', Date.now(), listId);

      for (const item of items) {
        db.runSync(
          `INSERT INTO items (id, list_id, name, barcode, category, quantity, checked, created_at, updated_at, synced_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name=excluded.name, barcode=excluded.barcode,
             category=excluded.category, quantity=excluded.quantity, checked=excluded.checked,
             updated_at=excluded.updated_at, synced_at=excluded.synced_at, deleted_at=excluded.deleted_at`,
          item.id, listId, item.name, item.barcode ?? null, item.category ?? null, item.quantity,
          item.checked ? 1 : 0, item.updatedAt, item.updatedAt, item.syncedAt ?? null, item.deletedAt ?? null,
        );

        if (!item.syncedAt || item.updatedAt > item.syncedAt) {
          db.runSync(
            `INSERT INTO sync_ops (id, entity_type, entity_id, operation, payload, created_at, synced_at)
             VALUES (?, 'item', ?, ?, ?, ?, NULL)
             ON CONFLICT(entity_type, entity_id) DO UPDATE SET operation=excluded.operation,
               payload=excluded.payload, created_at=excluded.created_at, synced_at=NULL`,
            `item:${item.id}`, item.id, item.deletedAt ? 'delete' : 'upsert', JSON.stringify(item), item.updatedAt,
          );
        }
      }
    });
  }

  static getPendingChanges(listId: string, items = this.getCurrentList(listId)): ShoppingItem[] {
    const rows = getDatabase().getAllSync<SyncOperationRow>(
      `SELECT sync_ops.payload FROM sync_ops
       INNER JOIN items ON items.id = sync_ops.entity_id
       WHERE sync_ops.entity_type = 'item' AND sync_ops.synced_at IS NULL AND items.list_id = ?
       ORDER BY sync_ops.created_at ASC`,
      listId,
    );
    return rows.length > 0
      ? rows.map((row) => JSON.parse(row.payload) as ShoppingItem)
      : items.filter((item) => !item.syncedAt || item.updatedAt > item.syncedAt);
  }

  static getLastSyncTimestamp(listId: string): number {
    const parsed = Number(getMetadata(lastSyncKey(listId)) ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  static markAsSynced(listId: string, items: ShoppingItem[], syncedAt: number): ShoppingItem[] {
    const syncedItems = items.map((item) => ({ ...item, syncedAt }));
    const db = getDatabase();
    this.saveCurrentList(listId, syncedItems);
    setMetadata(lastSyncKey(listId), String(syncedAt));
    db.runSync(
      `UPDATE sync_ops SET synced_at = ? WHERE entity_type = 'item'
       AND entity_id IN (SELECT id FROM items WHERE list_id = ?) AND synced_at IS NULL`,
      syncedAt,
      listId,
    );
    return syncedItems;
  }

  static applyRemoteChanges(listId: string, currentItems: ShoppingItem[], remoteItems: ShoppingItem[]): ShoppingItem[] {
    const allItems = mergeShoppingItems(currentItems, remoteItems);
    this.saveCurrentList(listId, allItems);
    return allItems;
  }

  static clearCurrentList(listId: string): ShoppingItem[] {
    const now = Date.now();
    const tombstones = this.getCurrentList(listId).map((item) => ({ ...item, deletedAt: now, updatedAt: now }));
    this.saveCurrentList(listId, tombstones);
    return tombstones;
  }

  private static ensureDefaultList(): string {
    const count = getDatabase().getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM shopping_lists');
    if ((count?.count ?? 0) > 0) {
      return getDatabase().getFirstSync<{ id: string }>(
        'SELECT id FROM shopping_lists WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1',
      )?.id ?? 'local-recovery-list';
    }
    const now = Date.now();
    const random = getDatabase().getFirstSync<{ value: string }>('SELECT lower(hex(randomblob(16))) AS value');
    const defaultListId = `local-${random?.value ?? `${now}-${Math.random().toString(36).slice(2)}`}`;
    getDatabase().runSync(
      'INSERT INTO shopping_lists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      defaultListId, 'Ma liste', now, now,
    );
    return defaultListId;
  }
}

function getMetadata(key: string): string | null {
  return getDatabase().getFirstSync<{ value: string }>('SELECT value FROM app_metadata WHERE key = ?', key)?.value ?? null;
}

function setMetadata(key: string, value: string): void {
  getDatabase().runSync(
    `INSERT INTO app_metadata (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value,
  );
}

function lastSyncKey(listId: string): string { return `last-sync:${listId}`; }
function mapListRow(row: ListRow): ShoppingList {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapItemRow(row: ItemRow): ShoppingItem {
  return {
    id: row.id, listId: row.list_id, name: row.name, barcode: row.barcode ?? undefined,
    category: row.category ?? undefined, quantity: row.quantity, checked: row.checked === 1,
    updatedAt: row.updated_at, syncedAt: row.synced_at ?? undefined, deletedAt: row.deleted_at ?? undefined,
  };
}
