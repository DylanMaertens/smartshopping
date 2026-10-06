import { fileURLToPath, URL } from 'node:url';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqliteSchema } from '@/db/schema';
import { groupEquivalentItems, incrementGroup, decrementGroup } from '@/services/itemGroups';
import { groupItemsByCategory } from '@/services/categorization/categoryOrder';
import { ShoppingListStorage as Storage } from './shoppingListStorage';
import type { ShoppingItem } from '@/types';

let database: Database;
let createDatabase: (data?: Uint8Array) => Database;
const adapter = {
  runSync(sql: string, ...params: SqlValue[]) {
    database.run(sql, params);
    return { changes: database.getRowsModified() };
  },
  getAllSync(sql: string, ...params: SqlValue[]) {
    const statement = database.prepare(sql);
    try {
      statement.bind(params);
      const rows = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  },
  getFirstSync(sql: string, ...params: SqlValue[]) {
    return this.getAllSync(sql, ...params)[0] ?? null;
  },
  withTransactionSync(action: () => void) {
    database.run('BEGIN');
    try { action(); database.run('COMMIT'); }
    catch (error) { database.run('ROLLBACK'); throw error; }
  },
};
vi.mock('@/db/client', () => ({ getDatabase: () => adapter }));

beforeAll(async () => {
  const SQL = await initSqlJs({
    locateFile: (file) => fileURLToPath(new URL(`../../../node_modules/sql.js/dist/${file}`, import.meta.url)),
  });
  createDatabase = (data) => new SQL.Database(data);
});
beforeEach(() => {
  database = createDatabase();
  database.run('PRAGMA foreign_keys = ON');
  database.run(sqliteSchema);
  for (const id of ['home', 'other']) {
    database.run('INSERT INTO shopping_lists (id,name,created_at,updated_at) VALUES (?,?,1,1)', [id, id]);
  }
});
afterEach(() => database.close());

const milk = (changes: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: 'milk', listId: 'home', name: 'Lait', quantity: 1, checked: false, updatedAt: 10, ...changes,
});

function startSync() {
  Storage.saveCurrentList('home', [milk()]);
  return Storage.getPendingChanges('home');
}

describe('portable list backups', () => {
  it('exports only visible list content, without credentials, IDs or tombstones', () => {
    Storage.saveCurrentList('home', [milk({ checked: true, barcode: '12345678' }), milk({ id: 'removed', deletedAt: 20 })]);
    Storage.archiveList('other');
    database.run("INSERT INTO app_metadata (key, value) VALUES ('private-secret', 'never-export-me')");
    const backup = Storage.createBackup();
    expect(backup.lists).toHaveLength(1);
    expect(backup.lists[0].items).toEqual([{ name: 'Lait', quantity: 1, checked: true, barcode: '12345678' }]);
    expect(JSON.stringify(backup)).not.toContain('never-export-me');
    expect(backup.lists[0].items[0]).not.toHaveProperty('id');
  });
  it('restores independent copies, keeps existing edits, and queues fresh IDs for sync', () => {
    Storage.setActiveList('home');
    Storage.saveCurrentList('home', [milk({ quantity: 3, checked: true, category: 'Boissons' })]);
    Storage.saveCategoryOrder('home', ['boissons']);
    const backup = Storage.createBackup();
    Storage.saveCurrentList('home', [milk({ quantity: 4, updatedAt: 11 })]);
    const ids = Storage.restoreBackup(backup);
    expect(Storage.getLists()).toHaveLength(4);
    expect(Storage.getActiveListId()).toBe('home');
    expect(Storage.getCurrentList('home')[0].quantity).toBe(4);
    expect(Storage.getPendingChanges('home')).toHaveLength(1);
    const restored = ids.find((id) => Storage.getCurrentList(id).length)!;
    expect(Storage.getCurrentList(restored)[0]).toMatchObject({ quantity: 3, checked: true, category: 'Boissons', listId: restored });
    expect(Storage.getCurrentList(restored)[0].id).not.toBe('milk');
    expect(Storage.getPendingChanges(restored)).toHaveLength(1);
    expect(Storage.getLastSyncTimestamp(restored)).toBe(0);
    expect(Storage.getCategoryOrder(restored)[0]).toBe('boissons');
    expect(() => Storage.restoreBackup(backup)).toThrow(/déjà/);
    expect(Storage.getLists()).toHaveLength(4);
  });
  it('rolls back every list and the import marker if a write fails part-way', () => {
    Storage.saveCurrentList('home', [milk()]);
    const backup = Storage.createBackup();
    database.run("CREATE TRIGGER fail_restore BEFORE INSERT ON items BEGIN SELECT RAISE(ABORT, 'full'); END");
    expect(() => Storage.restoreBackup(backup)).toThrow();
    expect(Storage.getLists()).toHaveLength(2);
    database.run('DROP TRIGGER fail_restore');
    expect(Storage.restoreBackup(backup)).toHaveLength(2);
  });
});

describe('SQLite sync reconciliation', () => {
  it('preserves an edit made while the request is in flight', () => {
    const sent = startSync();
    Storage.saveCurrentList('home', [milk({ quantity: 2, updatedAt: 11 })]);
    const result = Storage.completeSync('home', sent, [milk()], 1000);
    expect(result?.[0].quantity).toBe(2);
    expect(Storage.getPendingChanges('home')).toMatchObject([{ quantity: 2 }]);
    expect(Storage.getLastSyncTimestamp('home')).toBe(0);
  });

  it('retains the previous cursor when an unsent edit defers a remote delta', () => {
    Storage.completeSync('home', [], [milk({ updatedAt: 90 })], 100);
    Storage.saveCurrentList('home', [milk({ updatedAt: 110, quantity: 2 })]);
    const sent = Storage.getPendingChanges('home');
    Storage.saveCurrentList('home', [milk({ updatedAt: 120, quantity: 3 })]);
    Storage.completeSync('home', sent, [milk({ updatedAt: 150, quantity: 4 })], 200);
    expect(Storage.getLastSyncTimestamp('home')).toBe(100);
    expect(Storage.getCurrentList('home')[0].quantity).toBe(3);
    const next = Storage.getPendingChanges('home');
    Storage.completeSync('home', next, [milk({ updatedAt: 150, quantity: 4 })], 201);
    expect(Storage.getCurrentList('home')[0].quantity).toBe(4);
    expect(Storage.getPendingChanges('home')).toEqual([]);
    expect(Storage.getLastSyncTimestamp('home')).toBe(201);
  });

  it('keeps a new item and a deletion pending after an older response', () => {
    const sent = startSync();
    Storage.saveCurrentList('home', [milk({ deletedAt: 11, updatedAt: 11 }), milk({ id: 'bread', name: 'Pain' })]);
    Storage.completeSync('home', sent, [milk()], 1000);
    expect(Storage.getCurrentList('home').find((item) => item.id === 'milk')?.deletedAt).toBe(11);
    expect(new Set(Storage.getPendingChanges('home').map((item) => item.id))).toEqual(new Set(['milk', 'bread']));
  });

  it('acknowledges only the versions actually sent', () => {
    const sent = startSync();
    Storage.saveCurrentList('home', [milk(), milk({ id: 'bread' })]);
    Storage.completeSync('home', sent, [milk()], 1000);
    expect(Storage.getPendingChanges('home').map((item) => item.id)).toEqual(['bread']);
  });

  it('detects an edit even when its millisecond timestamp is unchanged', () => {
    const sent = startSync();
    Storage.saveCurrentList('home', [milk({ checked: true })]);
    Storage.completeSync('home', sent, [milk()], 1000);
    expect(Storage.getPendingChanges('home')).toMatchObject([{ checked: true }]);
    expect(Storage.getCurrentList('home')[0].checked).toBe(true);
  });

  it('does not requeue an acknowledged item whose timestamp exceeds server time', () => {
    Storage.saveCurrentList('home', [milk({ updatedAt: 2000 })]);
    Storage.completeSync('home', Storage.getPendingChanges('home'), [milk({ updatedAt: 2000 })], 1000);
    expect(Storage.getPendingChanges('home')).toEqual([]);
    Storage.saveCurrentList('home', Storage.getCurrentList('home'));
    expect(Storage.getPendingChanges('home')).toEqual([]);
  });

  it('queues local edits even when the local clock is behind the last acknowledgement', () => {
    const sent = startSync();
    Storage.completeSync('home', sent, [milk()], 10000);
    Storage.saveCurrentList('home', [milk({ quantity: 2, updatedAt: 12, syncedAt: 10000 })]);
    expect(Storage.getPendingChanges('home')).toMatchObject([{ quantity: 2, updatedAt: 12 }]);
  });

  it('applies new remote items without adding them to the outgoing queue', () => {
    Storage.completeSync('home', [], [milk({ updatedAt: 2000 })], 1000);
    expect(Storage.getCurrentList('home')).toMatchObject([{ id: 'milk', syncedAt: 1000 }]);
    expect(Storage.getPendingChanges('home')).toEqual([]);
  });

  it('rejects items belonging to another list without acknowledging anything', () => {
    const sent = startSync();
    expect(() => Storage.completeSync('home', sent, [milk({ listId: 'other' })], 1000)).toThrow();
    expect(Storage.getLastSyncTimestamp('home')).toBe(0);
    expect(Storage.getPendingChanges('home')).toHaveLength(1);
  });

  it('rolls back when a remote identifier collides with a different list', () => {
    const sent = startSync();
    Storage.saveCurrentList('other', [milk({ id: 'foreign', listId: 'other', name: 'Original' })]);
    expect(() => Storage.completeSync('home', sent, [milk(), milk({ id: 'foreign', name: 'Overwrite' })], 1000)).toThrow();
    expect(Storage.getCurrentList('other')[0].name).toBe('Original');
    expect(Storage.getPendingChanges('home')).toHaveLength(1);
    expect(Storage.getLastSyncTimestamp('home')).toBe(0);
  });

  it('never recreates a list deleted while syncing', () => {
    const sent = startSync();
    Storage.deleteListPermanently('home');
    expect(Storage.completeSync('home', sent, [milk()], 1000)).toBeNull();
    expect(Storage.getLists().some((list) => list.id === 'home')).toBe(false);
    expect(Storage.getCurrentList('home')).toEqual([]);
    expect(Storage.getLastSyncTimestamp('home')).toBe(0);
  });

  it('ignores a response for an archived list', () => {
    const sent = startSync();
    Storage.archiveList('home');
    expect(Storage.completeSync('home', sent, [milk()], 1000)).toBeNull();
    expect(Storage.getPendingChanges('home')).toHaveLength(1);
  });

  it('rolls back item writes and acknowledgements if cursor persistence fails', () => {
    const sent = startSync();
    database.run(`CREATE TRIGGER reject_cursor BEFORE INSERT ON app_metadata
      WHEN NEW.key = 'last-sync:home' BEGIN SELECT RAISE(ABORT, 'disk failure fixture'); END`);
    expect(() => Storage.completeSync('home', sent, [milk({ quantity: 4, updatedAt: 20 })], 1000)).toThrow();
    expect(Storage.getCurrentList('home')[0].quantity).toBe(1);
    expect(Storage.getPendingChanges('home')).toHaveLength(1);
    expect(Storage.getLastSyncTimestamp('home')).toBe(0);
  });

  it('sends the preserved edit on the next sync and then clears its queue entry', () => {
    const sent = startSync();
    Storage.saveCurrentList('home', [milk({ quantity: 2, updatedAt: 11 })]);
    Storage.completeSync('home', sent, [milk()], 1000);
    const next = Storage.getPendingChanges('home');
    Storage.completeSync('home', next, next, 1001);
    expect(Storage.getCurrentList('home')[0].quantity).toBe(2);
    expect(Storage.getPendingChanges('home')).toEqual([]);
  });

  it('persists pending edits through a database close and reopen', () => {
    const sent = startSync();
    Storage.saveCurrentList('home', [milk({ quantity: 2, updatedAt: 11 })]);
    Storage.completeSync('home', sent, [milk()], 1000);
    const snapshot = database.export();
    database.close();
    database = createDatabase(snapshot);
    expect(Storage.getPendingChanges('home')).toMatchObject([{ quantity: 2 }]);
  });

  it('reads the latest SQLite version when a legacy queued payload is stale', () => {
    startSync();
    database.run("UPDATE items SET quantity = 3, updated_at = 12 WHERE id = 'milk'");
    expect(Storage.getPendingChanges('home')).toMatchObject([{ quantity: 3, updatedAt: 12 }]);
  });

  it('does not switch the active list when an earlier sync finishes', () => {
    const sent = startSync();
    Storage.setActiveList('other');
    Storage.completeSync('home', sent, [milk()], 1000);
    expect(Storage.getActiveListId()).toBe('other');
    expect(Storage.getCurrentList('other')).toEqual([]);
  });
});

describe('basic list and item lifecycle', () => {
  it('keeps the active list when deleting a different list from its menu', () => {
    const active = Storage.createList('Courses');
    expect(Storage.archiveList('other')).toBe(active.id);
    expect(Storage.getActiveListId()).toBe(active.id);
    expect(Storage.getLists().some((list) => list.id === 'other')).toBe(false);
    const saved = database.export();
    database.close(); database = createDatabase(saved);
    expect(Storage.getActiveListId()).toBe(active.id);
  });
  it('creates, selects, renames and archives a list without losing another list', () => {
    Storage.saveCurrentList('home', [milk()]);
    const created = Storage.createList('Week-end');
    expect(Storage.getActiveListId()).toBe(created.id);
    expect(Storage.getCurrentList()).toEqual([]);
    Storage.renameList(created.id, 'Vacances');
    expect(Storage.getLists().find((entry) => entry.id === created.id)?.name).toBe('Vacances');
    const next = Storage.archiveList(created.id);
    expect(Storage.getActiveListId()).toBe(next);
    expect(Storage.getLists().some((entry) => entry.id === created.id)).toBe(false);
    expect(Storage.getCurrentList('home')[0].name).toBe('Lait');
  });
  it('retains checked items and quantities after reopening and queues clear-list tombstones', () => {
    Storage.setActiveList('home');
    Storage.saveCurrentList('home', [milk({ checked: true, quantity: 3 })]);
    const saved = database.export();
    database.close(); database = createDatabase(saved);
    expect(Storage.getActiveListId()).toBe('home');
    expect(Storage.getCurrentList()[0]).toMatchObject({ checked: true, quantity: 3 });
    Storage.clearCurrentList('home');
    expect(Storage.getCurrentList().filter((item) => !item.deletedAt)).toEqual([]);
    expect(Storage.getPendingChanges('home')[0].deletedAt).toBeGreaterThan(0);
  });
});

describe('persistent personal category order', () => {
  it('survives database reopening and sync independently for each list', () => {
    Storage.saveCategoryOrder('home', ['boissons', 'surgeles']);
    Storage.saveCategoryOrder('other', ['boulangerie']);
    Storage.saveCurrentList('home', [milk()]);
    Storage.completeSync('home', Storage.getPendingChanges('home'), [milk()], 100);
    const bytes = database.export();
    database.close();
    database = createDatabase(bytes);
    expect(Storage.getCategoryOrder('home').slice(0, 2)).toEqual(['boissons', 'surgeles']);
    expect(Storage.getCategoryOrder('other')[0]).toBe('boulangerie');
    expect(Storage.getPendingChanges('home')).toEqual([]);
    expect(Storage.getCurrentList('home')[0].name).toBe('Lait');
  });
  it('recovers from malformed saved data and clears the preference on permanent deletion', () => {
    database.run('INSERT INTO app_metadata (key,value) VALUES (?,?)', ['category-order:home', '{broken']);
    expect(Storage.getCategoryOrder('home')[0]).toBe('fruits-legumes');
    Storage.saveCategoryOrder('home', ['boissons']);
    expect(Storage.getPendingChanges('home')).toEqual([]);
    Storage.deleteListPermanently('home');
    expect(adapter.getFirstSync('SELECT value FROM app_metadata WHERE key = ?', 'category-order:home')).toBeNull();
  });
});


it('persists a manually chosen category after reopening and accepts it from remote sync', () => {
  Storage.saveCurrentList('home', [milk({ category: 'À classer' })]);
  Storage.saveCurrentList('home', [milk({ category: 'Boissons', updatedAt: 20 })]);
  const saved = database.export();
  database.close(); database = createDatabase(saved);
  expect(Storage.getCurrentList('home')[0].category).toBe('Boissons');
  const pending = Storage.getPendingChanges('home');
  expect(pending[0].category).toBe('Boissons');
  Storage.completeSync('home', pending, pending, 100);
  expect(Storage.getPendingChanges('home')).toEqual([]);
  Storage.completeSync('home', [], [milk({ category: 'Surgelés', updatedAt: 200 })], 200);
  expect(Storage.getCurrentList('home')[0].category).toBe('Surgelés');
});

describe('shared list names', () => {
  it('queues an empty list name and persists an offline rename across restart', () => {
    const created = Storage.createList('  Courses   famille  ');
    expect(Storage.getPendingChangesCount(created.id)).toBe(1);
    expect(Storage.getPendingListName(created.id)).toEqual({ name: 'Courses famille', updated_at: 0 });
    Storage.renameList(created.id, 'Vacances');
    const sent = Storage.getPendingListName(created.id)!;
    const bytes = database.export(); database.close(); database = createDatabase(bytes);
    expect(Storage.getPendingListName(created.id)).toEqual(sent);
    Storage.completeSync(created.id, [], [], 1000, sent, sent);
    expect(Storage.getPendingChangesCount(created.id)).toBe(0);
  });
  it('adopts the real name on join without proposing the generic placeholder', () => {
    Storage.importSharedList('joined');
    expect(Storage.getPendingListName('joined')).toBeUndefined();
    Storage.completeSync('joined', [], [], 1000, undefined, { name: 'Famille', updated_at: 10 });
    expect(Storage.getLists().find((list) => list.id === 'joined')?.name).toBe('Famille');
    Storage.importSharedList('joined');
    expect(Storage.getLists().find((list) => list.id === 'joined')?.name).toBe('Famille');
  });
  it('protects a rename made while an item-only request was in flight', () => {
    const seed = Storage.getPendingListName('home');
    Storage.completeSync('home', [], [], 1, seed, { name: 'Maison', updated_at: 1 });
    Storage.renameList('home', 'Nouveau nom');
    const pending = Storage.getPendingListName('home');
    Storage.completeSync('home', [], [], 2, undefined, { name: 'Ancien nom distant', updated_at: 2 });
    expect(Storage.getPendingListName('home')).toEqual(pending);
    expect(Storage.getLists().find((list) => list.id === 'home')?.name).toBe('Nouveau nom');
  });
  it('acknowledges only the exact rename sent, including rapid edits in the same millisecond', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    try {
      Storage.renameList('home', 'Premier');
      const first = Storage.getPendingListName('home')!;
      Storage.renameList('home', 'Second');
      const second = Storage.getPendingListName('home')!;
      expect(second.updated_at).toBeGreaterThan(first.updated_at);
      Storage.completeSync('home', [], [], 101, first, first);
      expect(Storage.getPendingListName('home')).toEqual(second);
      Storage.completeSync('home', [], [], 102, second, { name: 'Gagnant distant', updated_at: 102 });
      expect(Storage.getPendingListName('home')).toBeUndefined();
      expect(Storage.getLists().find((list) => list.id === 'home')?.name).toBe('Gagnant distant');
    } finally { vi.restoreAllMocks(); }
  });
  it('keeps renames pending with an older server and rejects invalid metadata atomically', () => {
    Storage.renameList('home', 'Famille');
    const sent = Storage.getPendingListName('home');
    Storage.completeSync('home', [], [], 1000, sent);
    expect(Storage.getPendingListName('home')).toEqual(sent);
    expect(() => Storage.completeSync('home', [], [milk()], 1001, sent, { name: '', updated_at: 1 })).toThrow();
    expect(Storage.getCurrentList('home')).toEqual([]);
    expect(Storage.getPendingListName('home')).toEqual(sent);
    expect(() => Storage.renameList('home', 'a'.repeat(201))).toThrow(/200/);
  });
  it('does not recreate a removed list and preserves unsent names on rejoin', () => {
    Storage.renameList('home', 'Hors ligne');
    const sent = Storage.getPendingListName('home');
    Storage.archiveList('home');
    expect(Storage.completeSync('home', [], [], 1, sent, sent)).toBeNull();
    Storage.importSharedList('home');
    expect(Storage.getPendingListName('home')).toEqual(sent);
    Storage.deleteListPermanently('home');
    expect(Storage.getPendingListName('home')).toBeUndefined();
  });
  it('accepts a late owner name after a legacy member bootstrap found no server name', () => {
    const sent = Storage.getPendingListName('home');
    Storage.completeSync('home', [], [], 1, sent, null);
    expect(Storage.getPendingListName('home')).toBeUndefined();
    Storage.completeSync('home', [], [], 2, undefined, { name: 'Nom propriétaire', updated_at: 0 });
    expect(Storage.getLists().find((list) => list.id === 'home')?.name).toBe('Nom propriétaire');
  });
});

it('displays the same order on two databases despite different local creation dates', () => {
  const emptyDevice = database.export();
  const pain = milk({ id: 'pain', name: 'Pain', category: 'Épicerie salée', updatedAt: 10 });
  const riz = milk({ id: 'riz', name: 'Riz', category: 'Épicerie salée', updatedAt: 20 });
  Storage.saveCurrentList('home', [pain, riz]);
  // On A, Pain was created before Riz, but edited after it.
  Storage.saveCurrentList('home', [{ ...pain, quantity: 2, updatedAt: 50 }, riz]);
  const sent = Storage.getCurrentList('home');
  expect(sent.map((entry) => entry.id)).toEqual(['riz', 'pain']);
  const displayedOnA = groupItemsByCategory(sent, []);
  expect(Storage.getPendingChanges('home')).toHaveLength(2);
  database.close();
  database = createDatabase(emptyDevice);
  // B learns only the last modification date and derives different local dates.
  Storage.completeSync('home', [], sent, 100);
  expect(Storage.getCurrentList('home').map((entry) => entry.id)).toEqual(['pain', 'riz']);
  const displayedOnB = groupItemsByCategory(Storage.getCurrentList('home'), []);
  expect(displayedOnB.map((section) => section.items.map((entry) => entry.id)))
    .toEqual(displayedOnA.map((section) => section.items.map((entry) => entry.id)));
  const saved = database.export(); database.close(); database = createDatabase(saved);
  expect(groupItemsByCategory(Storage.getCurrentList('home'), [])[0].items.map((entry) => entry.id)).toEqual(['pain', 'riz']);
  expect(Storage.getPendingChanges('home')).toEqual([]);
});

describe('disconnected local copies', () => {
  it('persists disabled sync across restart, preserves edits, and reenables after joining', () => {
    Storage.saveCurrentList('home', [milk()]);
    Storage.disableSync('home');
    Storage.renameList('home', 'Copie locale');
    Storage.saveCurrentList('home', [milk({ quantity: 2, updatedAt: 20 })]);
    const snapshot = database.export(); database.close(); database = createDatabase(snapshot);
    expect(Storage.isSyncDisabled('home')).toBe(true);
    expect(Storage.isSyncDisabled('other')).toBe(false);
    expect(Storage.getLists().find((list) => list.id === 'home')).toMatchObject({ syncDisabled: true, name: 'Copie locale' });
    expect(Storage.getPendingChangesCount('home')).toBe(0);
    expect(Storage.getPendingChanges('home')).toHaveLength(1);
    expect(Storage.getCurrentList('home')[0].quantity).toBe(2);
    expect(JSON.stringify(Storage.createBackup())).not.toContain('syncDisabled');
    Storage.importSharedList('home');
    expect(Storage.isSyncDisabled('home')).toBe(false);
    expect(Storage.getPendingChangesCount('home')).toBe(2);
    expect(Storage.getCurrentList('home')[0].quantity).toBe(2);
  });
  it('cleans the disabled flag when deleting permanently', () => {
    Storage.disableSync('home'); Storage.deleteListPermanently('home');
    expect(Storage.isSyncDisabled('home')).toBe(false);
  });
});

it('converges across two SQLite devices after simultaneous additions, retries and grouped edits', () => {
  const initial = database.export();
  const a = database;
  const b = createDatabase(initial);
  try {
    database = a; Storage.saveCurrentList('home', [milk({ id: 'a', name: ' pain ' })]);
    const sentA = Storage.getPendingChanges('home');
    database = b; Storage.saveCurrentList('home', [milk({ id: 'b', name: 'Pain' })]);
    const sentB = Storage.getPendingChanges('home');
    const server = [...sentA, ...sentB];
    for (const [device, sent] of [[a, sentA], [b, sentB]] as const) {
      database = device;
      Storage.completeSync('home', sent, server, 1000);
      Storage.completeSync('home', [], [...server].reverse(), 1001);
      expect(groupEquivalentItems(Storage.getCurrentList('home'))).toEqual([
        expect.objectContaining({ name: 'Pain', quantity: 2 }),
      ]);
      expect(Storage.getPendingChanges('home')).toHaveLength(0);
    }
    // A's aggregate edit updates source rows, never a duplicated total.
    database = a;
    Storage.saveCurrentList('home', incrementGroup(Storage.getCurrentList('home'), 'a'));
    const change = Storage.getPendingChanges('home');
    database = b;
    Storage.completeSync('home', [], change, 1002);
    expect(groupEquivalentItems(Storage.getCurrentList('home'))[0].quantity).toBe(3);
    Storage.saveCurrentList('home', decrementGroup(decrementGroup(Storage.getCurrentList('home'), 'a'), 'a'));
    const reduced = Storage.getPendingChanges('home');
    database = a;
    Storage.completeSync('home', change, reduced, 1003);
    expect(groupEquivalentItems(Storage.getCurrentList('home'))[0].quantity).toBe(1);
    const restored = Storage.restoreBackup(Storage.createBackup());
    const copy = restored.find((id) => Storage.getCurrentList(id).length)!;
    expect(groupEquivalentItems(Storage.getCurrentList(copy))[0].quantity).toBe(1);
  } finally { database = a; b.close(); }
});
