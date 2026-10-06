import { getDatabase } from '@/db/client';
import { mergeShoppingItems } from '@/services/sync/mergeItems';
import { normalizeCategoryOrder } from '@/services/categorization/categoryOrder';
import { validateBackup, type ListBackup } from '@/services/backup/listBackup';
import type { ShoppingItem, ShoppingList } from '@/types';
import type { SyncListName } from '@/services/api/backend';

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

export class ShoppingListStorage {
  static createBackup(): ListBackup {
    let backup!: ListBackup;
    getDatabase().withTransactionSync(() => {
      backup = validateBackup({
        format: 'smartshopping-lists', version: 1, backupId: newStorageId(), createdAt: new Date().toISOString(),
        lists: this.getLists().map((list) => ({
          name: list.name, categoryOrder: this.getCategoryOrder(list.id),
          items: this.getCurrentList(list.id).filter((item) => !item.deletedAt).map((item) => ({
            name: item.name, quantity: item.quantity, checked: item.checked,
            ...(item.barcode ? { barcode: item.barcode } : {}),
            ...(item.category ? { category: item.category } : {}),
          })),
        })),
      });
    });
    return backup;
  }

  /** Restore independent copies atomically, never the original IDs or access rights. */
  static restoreBackup(value: unknown): string[] {
    const backup = validateBackup(value);
    const ids: string[] = [];
    const db = getDatabase();
    db.withTransactionSync(() => {
      const key = `restored-backup:${backup.backupId}`;
      if (getMetadata(key)) throw new Error('Cette sauvegarde a déjà été restaurée sur cet appareil.');
      const now = Date.now();
      for (const source of backup.lists) {
        const listId = `restored-${newStorageId()}`;
        db.runSync('INSERT INTO shopping_lists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
          listId, source.name, now, now);
        this.saveCategoryOrder(listId, source.categoryOrder);
        for (const entry of source.items) {
          const item: ShoppingItem = { ...entry, id: newStorageId(), listId, updatedAt: now };
          writeItem(listId, item);
          db.runSync(`INSERT INTO sync_ops (id, entity_type, entity_id, operation, payload, created_at)
            VALUES (?, 'item', ?, 'upsert', ?, ?)`, `item:${item.id}`, item.id, JSON.stringify(item), now);
        }
        ids.push(listId);
      }
      setMetadata(key, String(now));
    });
    return ids;
  }

  static getCategoryOrder(listId: string): string[] {
    try { return normalizeCategoryOrder(JSON.parse(getMetadata(`category-order:${listId}`) ?? 'null')); }
    catch { return normalizeCategoryOrder(null); }
  }

  /** Personal display preference: no item edits or synchronization operations. */
  static saveCategoryOrder(listId: string, order: string[]): void {
    setMetadata(`category-order:${listId}`, JSON.stringify(normalizeCategoryOrder(order)));
  }

  static getLists(): ShoppingList[] {
    this.ensureDefaultList();
    return getDatabase()
      .getAllSync<ListRow>(
        `SELECT id, name, created_at, updated_at
         FROM shopping_lists WHERE deleted_at IS NULL
         ORDER BY updated_at DESC`,
      )
      .map((row) => ({ ...mapListRow(row), ...(this.isSyncDisabled(row.id) ? { syncDisabled: true } : {}) }));
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
    name = cleanListName(name);
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

  static isSyncDisabled(listId: string): boolean {
    return getMetadata(`sync-disabled:${listId}`) === 'revoked';
  }

  static disableSync(listId: string): void {
    setMetadata(`sync-disabled:${listId}`, 'revoked');
  }

  static importSharedList(listId: string): ShoppingList {
    const now = Date.now();
    const existed = getDatabase().getFirstSync<{ id: string }>('SELECT id FROM shopping_lists WHERE id = ?', listId);
    getDatabase().runSync(
      `INSERT INTO shopping_lists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at`,
      listId, 'Liste partagée', now, now,
    );
    getDatabase().runSync('DELETE FROM app_metadata WHERE key = ?', `sync-disabled:${listId}`);
    // A joining device has no name to propose. Rejoining preserves unsent edits.
    if (!existed) setMetadata(`list-name:${listId}`, JSON.stringify({ name: 'Liste partagée', updated_at: 0, pending: false }));
    this.setActiveList(listId);
    return { id: listId, name: 'Liste partagée', createdAt: now, updatedAt: now };
  }

  static renameList(listId: string, name: string): void {
    name = cleanListName(name);
    const db = getDatabase();
    db.withTransactionSync(() => {
      const list = db.getFirstSync<ListRow>('SELECT * FROM shopping_lists WHERE id = ? AND deleted_at IS NULL', listId);
      if (!list) throw new Error('Cette liste n’existe plus.');
      if (list.name === name) return;
      const previous = JSON.parse(getMetadata(`list-name:${listId}`) ?? 'null') as SyncListName | null;
      const updated_at = Math.max(Date.now(), (previous?.updated_at ?? 0) + 1);
      db.runSync('UPDATE shopping_lists SET name = ?, updated_at = ? WHERE id = ?', name, updated_at, listId);
      setMetadata(`list-name:${listId}`, JSON.stringify({ name, updated_at, pending: true }));
    });
  }

  static getPendingListName(listId: string): SyncListName | undefined {
    const list = getDatabase().getFirstSync<ListRow>('SELECT * FROM shopping_lists WHERE id = ? AND deleted_at IS NULL', listId);
    if (!list) return undefined;
    const stored = getMetadata(`list-name:${listId}`);
    // A legacy name seeds an unnamed server list only; it never replaces a rename.
    if (!stored) return { name: [...list.name.trim().replace(/\s+/gu, ' ')].slice(0, 200).join('') || 'Ma liste', updated_at: 0 };
    const state = JSON.parse(stored) as SyncListName & { pending: boolean };
    return state.pending ? { name: state.name, updated_at: state.updated_at } : undefined;
  }

  static getPendingChangesCount(listId: string): number {
    if (this.isSyncDisabled(listId)) return 0;
    return this.getPendingChanges(listId).length + Number(!!this.getPendingListName(listId));
  }

  static archiveList(listId: string): string {
    const db = getDatabase();
    const lists = this.getLists();
    if (lists.length <= 1) return listId;

    const activeId = this.getActiveListId();
    db.runSync('UPDATE shopping_lists SET deleted_at = ?, updated_at = ? WHERE id = ?', Date.now(), Date.now(), listId);
    const nextId = activeId !== listId ? activeId : lists.find((list) => list.id !== listId)?.id ?? this.ensureDefaultList();
    this.setActiveList(nextId);
    return nextId;
  }

  static deleteListPermanently(listId: string): string {
    const db = getDatabase();
    db.withTransactionSync(() => {
      db.runSync("DELETE FROM sync_ops WHERE entity_type = 'item' AND entity_id IN (SELECT id FROM items WHERE list_id = ?)", listId);
      db.runSync('DELETE FROM shopping_lists WHERE id = ?', listId);
      db.runSync('DELETE FROM app_metadata WHERE key = ?', lastSyncKey(listId));
      db.runSync('DELETE FROM app_metadata WHERE key = ?', `sync-disabled:${listId}`);
      db.runSync('DELETE FROM app_metadata WHERE key = ?', `category-order:${listId}`);
      db.runSync('DELETE FROM app_metadata WHERE key = ?', `list-name:${listId}`);
    });
    const nextId = this.ensureDefaultList();
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

  /** Persist local edits immediately; the queue tracks versions, not wall-clock order. */
  static saveCurrentList(listId: string, items: ShoppingItem[]): void {
    const db = getDatabase();
    db.withTransactionSync(() => {
      const existing = new Map(this.getCurrentList(listId).map((item) => [item.id, item]));
      db.runSync('UPDATE shopping_lists SET updated_at = ? WHERE id = ?', Date.now(), listId);
      for (const item of items) {
        if (item.listId !== listId) throw new Error('Item belongs to another list');
        const previous = existing.get(item.id);
        const changed = !previous || !sameItemVersion(previous, item);
        const saved = changed ? { ...item, syncedAt: undefined } : item;
        writeItem(listId, saved);
        if (changed) {
          db.runSync(
            `INSERT INTO sync_ops (id, entity_type, entity_id, operation, payload, created_at, synced_at)
             VALUES (?, 'item', ?, ?, ?, ?, NULL)
             ON CONFLICT(entity_type, entity_id) DO UPDATE SET operation=excluded.operation,
               payload=excluded.payload, created_at=excluded.created_at, synced_at=NULL`,
            `item:${item.id}`, item.id, item.deletedAt ? 'delete' : 'upsert', JSON.stringify(saved), item.updatedAt,
          );
        }
      }
    });
  }

  static getPendingChanges(listId: string): ShoppingItem[] {
    return getDatabase().getAllSync<ItemRow>(
      `SELECT items.id, items.list_id, items.name, items.barcode, items.category, items.quantity,
              items.checked, items.updated_at, items.synced_at, items.deleted_at FROM sync_ops
       INNER JOIN items ON items.id = sync_ops.entity_id
       WHERE sync_ops.entity_type = 'item' AND sync_ops.synced_at IS NULL AND items.list_id = ?
       ORDER BY sync_ops.created_at ASC`,
      listId,
    ).map(mapItemRow);
  }

  static getLastSyncTimestamp(listId: string): number {
    const parsed = Number(getMetadata(lastSyncKey(listId)) ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** Apply a response and acknowledge only the exact versions sent, atomically. */
  static completeSync(
    listId: string,
    sentChanges: ShoppingItem[],
    remoteItems: ShoppingItem[],
    serverTime: number,
    sentName?: SyncListName,
    remoteName?: SyncListName | null,
  ): ShoppingItem[] | null {
    if (!Number.isSafeInteger(serverTime) || serverTime < 0) throw new Error('Invalid sync timestamp');
    if ([...sentChanges, ...remoteItems].some((item) => item.listId !== listId)) {
      throw new Error('Sync response contains items from another list');
    }
    if (new Set(remoteItems.map((item) => item.id)).size !== remoteItems.length) {
      throw new Error('Sync response contains duplicate items');
    }
    if (remoteName != null && (typeof remoteName.name !== 'string' || !remoteName.name.trim()
      || [...remoteName.name].length > 200 || !Number.isSafeInteger(remoteName.updated_at) || remoteName.updated_at < 0)) {
      throw new Error('Invalid synchronized list name');
    }
    const db = getDatabase();
    let result: ShoppingItem[] | null = null;
    db.withTransactionSync(() => {
      const list = db.getFirstSync<{ id: string }>(
        'SELECT id FROM shopping_lists WHERE id = ? AND deleted_at IS NULL', listId,
      );
      // A response must not recreate a deleted or archived list.
      if (!list) return;
      const pendingName = this.getPendingListName(listId);
      const protectedName = pendingName && (!sentName || pendingName.name !== sentName.name || pendingName.updated_at !== sentName.updated_at);
      // Undefined means an older server: keep the name pending. Null means the
      // upgraded server has no canonical name yet (e.g. its owner is offline).
      if (!protectedName && remoteName !== undefined) {
        if (remoteName) {
          db.runSync('UPDATE shopping_lists SET name = ? WHERE id = ?', remoteName.name, listId);
          setMetadata(`list-name:${listId}`, JSON.stringify({ ...remoteName, pending: false }));
        } else if (sentName?.updated_at === 0) {
          setMetadata(`list-name:${listId}`, JSON.stringify({ ...sentName, pending: false }));
        }
      }
      const current = this.getCurrentList(listId);
      const sent = new Map(sentChanges.map((item) => [item.id, item]));
      const pending = this.getPendingChanges(listId);
      const protectedIds = new Set(pending.filter((item) => {
        const snapshot = sent.get(item.id);
        return !snapshot || !sameItemVersion(snapshot, item);
      }).map((item) => item.id));
      const acknowledgedIds = new Set(pending.filter((item) => !protectedIds.has(item.id)).map((item) => item.id));
      const remote = remoteItems.filter((item) => !protectedIds.has(item.id));
      const remoteById = new Map(remote.map((item) => [item.id, item]));
      const merged = mergeShoppingItems(current, remote);
      for (const item of merged) {
        const received = remoteById.get(item.id);
        const acceptedRemote = received && sameItemVersion(received, item);
        if (!protectedIds.has(item.id) && (acknowledgedIds.has(item.id) || acceptedRemote)) {
          writeItem(listId, { ...item, syncedAt: serverTime });
          db.runSync(
            "UPDATE sync_ops SET synced_at = ? WHERE entity_type = 'item' AND entity_id = ? AND synced_at IS NULL",
            serverTime, item.id,
          );
        }
      }
      // A protected item may hide a remote delta from this response. Keep the
      // cursor until the newer local version is sent, so that delta is offered again.
      if (protectedIds.size === 0) setMetadata(lastSyncKey(listId), String(serverTime));
      result = this.getCurrentList(listId);
    });
    return result;
  }

  static clearCurrentList(listId: string): ShoppingItem[] {
    const now = Date.now();
    const tombstones = this.getCurrentList(listId).map((item) => {
      const updatedAt = Math.max(now, item.updatedAt + 1);
      return { ...item, deletedAt: updatedAt, updatedAt };
    });
    this.saveCurrentList(listId, tombstones);
    return this.getCurrentList(listId);
  }

  private static ensureDefaultList(): string {
    const count = getDatabase().getFirstSync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM shopping_lists WHERE deleted_at IS NULL',
    );
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

function newStorageId(): string {
  const row = getDatabase().getFirstSync<{ value: string }>('SELECT lower(hex(randomblob(16))) AS value');
  if (!row?.value) throw new Error('Impossible de créer un identifiant de sauvegarde.');
  return row.value;
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

function sameItemVersion(left: ShoppingItem, right: ShoppingItem): boolean {
  return left.id === right.id && left.listId === right.listId && left.updatedAt === right.updatedAt
    && left.name === right.name && left.barcode === right.barcode && left.category === right.category
    && left.quantity === right.quantity && left.checked === right.checked && left.deletedAt === right.deletedAt;
}

function writeItem(listId: string, item: ShoppingItem): void {
  const result = getDatabase().runSync(
    `INSERT INTO items (id, list_id, name, barcode, category, quantity, checked, created_at, updated_at, synced_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, barcode=excluded.barcode,
       category=excluded.category, quantity=excluded.quantity, checked=excluded.checked,
       updated_at=excluded.updated_at, synced_at=excluded.synced_at, deleted_at=excluded.deleted_at
     WHERE items.list_id = excluded.list_id`,
    item.id, listId, item.name, item.barcode ?? null, item.category ?? null, item.quantity,
    item.checked ? 1 : 0, item.updatedAt, item.updatedAt, item.syncedAt ?? null, item.deletedAt ?? null,
  );
  if (result.changes !== 1) throw new Error('Item identifier already belongs to another list');
}

function cleanListName(value: string): string {
  const name = value.trim().replace(/\s+/gu, ' ');
  if (!name || [...name].length > 200) throw new Error('Choisis un nom de 1 à 200 caractères.');
  return name;
}
