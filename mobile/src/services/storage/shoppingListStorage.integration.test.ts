import { fileURLToPath, URL } from 'node:url';
import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqliteSchema } from '@/db/schema';
import { groupEquivalentItems, incrementGroup, decrementGroup } from '@/services/itemGroups';
import { groupItemsByCategory } from '@/services/categorization/categoryOrder';
import { ShoppingListStorage as Storage } from './shoppingListStorage';
import type { ShoppingItem } from '@/types';
import { rememberProductCategory, getRememberedCategory, getProductPreference, saveProductPreference } from './productPreferences';
import { PersonalSettings, THEME_STORAGE_KEY } from './personalSettings';
import { HELP_STORAGE_KEY, readHelpIcons, saveHelpIcons } from './interfaceSettings';
import { getMemberAliases, saveMemberAlias } from './memberAliases';
import { LocalKeyValueStorage } from './localKeyValueStorage';
import { saveOcrContributionPreview, OCR_CONTRIBUTION_PREVIEW_KEY } from './ocrContributionSettings';

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

describe('per-list presentation', () => {
  it('persists independently without changing items, order or pending synchronization', () => {
    Storage.saveCurrentList('home', [milk()]);
    const pending = Storage.getPendingChanges('home');
    const order = Storage.getCategoryOrder('home');
    expect(Storage.getListAppearance('home')).toEqual({ notebook: false, showCategories: true });
    Storage.saveListAppearance('home', { notebook: true, showCategories: false });
    const disk = database.export(); database.close(); database = createDatabase(disk);
    expect(Storage.getListAppearance('home')).toEqual({ notebook: true, showCategories: false });
    expect(Storage.getListAppearance('other')).toEqual({ notebook: false, showCategories: true });
    expect(Storage.getPendingChanges('home')).toEqual(pending);
    expect(Storage.getCategoryOrder('home')).toEqual(order);
    Storage.saveListAppearance('home', { notebook: false, showCategories: false });
    expect(Storage.getListAppearance('home').showCategories).toBe(false);
  });
  it('backs up presentation onto independent restored lists and reads older backups', () => {
    Storage.saveListAppearance('home', { notebook: true, showCategories: false });
    const backup = Storage.createBackup();
    const ids = Storage.restoreBackup(backup);
    const restored = ids.find(id => Storage.getLists().find(list => list.id === id)?.name === 'home')!;
    expect(Storage.getListAppearance(restored)).toEqual({ notebook: true, showCategories: false });
    expect(restored).not.toBe('home');
    const older = { ...backup, backupId: 'old-backup-without-appearance', lists: backup.lists.map(({ appearance, ...list }) => list) };
    expect(Storage.restoreBackup(older).every(id => !Storage.getListAppearance(id).notebook)).toBe(true);
    expect(() => Storage.restoreBackup({ ...backup, lists: [{ ...backup.lists[0], appearance: { notebook: 'yes', showCategories: true } }] })).toThrow();
  });
  it('cleans only the deleted list settings and recovers corrupt presentation safely', () => {
    Storage.saveListAppearance('home', { notebook: true, showCategories: false });
    Storage.saveListAppearance('other', { notebook: true, showCategories: true });
    Storage.deleteListPermanently('home');
    expect(Storage.getListAppearance('home')).toEqual({ notebook: false, showCategories: true });
    expect(Storage.getListAppearance('other').notebook).toBe(true);
    database.run("UPDATE app_metadata SET value = 'broken' WHERE key = 'list-appearance:other'");
    expect(Storage.getListAppearance('other')).toEqual({ notebook: false, showCategories: true });
  });
});

describe('help icon preference', () => {
  it('defaults to visible, persists after restart and restores on a fresh database', () => {
    expect(readHelpIcons()).toBe(true);
    saveHelpIcons(false);
    const disk = database.export(); database.close(); database = createDatabase(disk);
    expect(readHelpIcons()).toBe(false);
    const backup = Storage.createBackup();
    expect(backup.version === 2 && backup.preferences.helpIcons).toBe(false);
    database.close(); database = createDatabase(); database.run(sqliteSchema);
    Storage.restoreBackup(backup);
    expect(readHelpIcons()).toBe(false);
  });
  it('preserves an existing choice when restoring and supports backups without the setting', () => {
    const oldBackup = Storage.createBackup();
    expect(oldBackup.version === 2 && oldBackup.preferences.helpIcons).toBeUndefined();
    saveHelpIcons(false);
    const hiddenBackup = Storage.createBackup();
    saveHelpIcons(true);
    Storage.restoreBackup(hiddenBackup);
    expect(readHelpIcons()).toBe(true);
    Storage.restoreBackup(oldBackup);
    expect(PersonalSettings.getString(HELP_STORAGE_KEY)).toBe('true');
  });
});

describe('private member labels', () => {
  it('persists labels per list without exporting member identities or simulation rights', () => {
    saveMemberAlias('home', 'member-test-id', '  Camille   Test  ');
    saveMemberAlias('other', 'member-test-id', 'Alex');
    LocalKeyValueStorage.setString('preview.premium-simulation.v1', 'true');
    saveOcrContributionPreview(true);
    const disk = database.export(); database.close(); database = createDatabase(disk);
    expect(getMemberAliases('home')).toEqual({ 'member-test-id': 'Camille Test' });
    expect(getMemberAliases('other')).toEqual({ 'member-test-id': 'Alex' });
    const backup = JSON.stringify(Storage.createBackup());
    expect(backup).not.toContain('member-test-id');
    expect(backup).not.toContain('Camille Test');
    expect(backup).not.toContain('premium-simulation');
    expect(backup).not.toContain(OCR_CONTRIBUTION_PREVIEW_KEY);
    expect(Storage.getPendingChanges('home')).toEqual([]);
    saveMemberAlias('home', 'member-test-id', '');
    expect(getMemberAliases('home')).toEqual({});
    expect(() => saveMemberAlias('home', 'id', 'a'.repeat(81))).toThrow();
    LocalKeyValueStorage.delete('preview.premium-simulation.v1');
    LocalKeyValueStorage.delete(OCR_CONTRIBUTION_PREVIEW_KEY);
  });
  it('cleans aliases only for a permanently deleted list', () => {
    saveMemberAlias('home', 'member', 'Camille'); saveMemberAlias('other', 'member', 'Alex');
    Storage.deleteListPermanently('home');
    expect(getMemberAliases('home')).toEqual({});
    expect(getMemberAliases('other')).toEqual({ member: 'Alex' });
  });
});

describe('local lists and explicit sharing', () => {
  it('persists a confirmed end of sharing despite legacy sync timestamps and can share again', () => {
    const sent = startSync();
    Storage.completeSync('home', sent, [], 1000);
    Storage.makeListLocal('home');
    expect(Storage.isSyncEnabled('home')).toBe(false);
    const disk = database.export(); database.close(); database = createDatabase(disk);
    expect(Storage.isSyncEnabled('home')).toBe(false);
    Storage.saveCurrentList('home', [milk({ quantity: 3, updatedAt: 2000 })]);
    expect(Storage.getCurrentList('home')[0].quantity).toBe(3);
    expect(Storage.isSyncEnabled('home')).toBe(false);
    Storage.enableSyncForSharing('home');
    expect(Storage.isSyncEnabled('home')).toBe(true);
    expect(Storage.getPendingChanges('home')[0].quantity).toBe(3);
  });
  it('keeps unsynchronized, new and restored lists local without losing their edits', () => {
    expect(Storage.isSyncEnabled('home')).toBe(false);
    const fresh = Storage.createList('Privée');
    Storage.saveCurrentList(fresh.id, [milk({ id: 'private', listId: fresh.id })]);
    Storage.renameList(fresh.id, 'Courses privées');
    expect(Storage.isSyncEnabled(fresh.id)).toBe(false);
    expect(Storage.getPendingChanges(fresh.id)).toHaveLength(1);
    for (const id of Storage.restoreBackup(Storage.createBackup())) expect(Storage.isSyncEnabled(id)).toBe(false);
  });
  it('keeps the initial default list local', () => {
    database.run('DELETE FROM shopping_lists');
    expect(Storage.isSyncEnabled(Storage.getActiveListId())).toBe(false);
  });
  it('persists explicit sharing and keeps all edits for the first upload', () => {
    const sent = startSync();
    Storage.enableSyncForSharing('home');
    const saved = database.export(); database.close(); database = createDatabase(saved);
    expect(Storage.isSyncEnabled('home')).toBe(true);
    expect(Storage.getPendingChanges('home')).toEqual(sent);
    expect(Storage.getPendingListName('home')).toBeDefined();
  });
  it('preserves legacy synchronization without treating restored copies as shared', () => {
    const sent = startSync();
    Storage.completeSync('home', sent, [], 1000);
    expect(Storage.isSyncEnabled('home')).toBe(true);
    const restored = Storage.restoreBackup(Storage.createBackup());
    expect(restored.every((id) => !Storage.isSyncEnabled(id))).toBe(true);
  });
  it('preserves legacy joins before a successful first sync', () => {
    database.run("INSERT INTO app_metadata (key,value) VALUES ('list-name:home', ?)", [JSON.stringify({ name: 'Liste partagée', updated_at: 0, pending: false })]);
    expect(Storage.isSyncEnabled('home')).toBe(true);
    Storage.renameList('home', 'Liste renommée hors ligne');
    expect(Storage.isSyncEnabled('home')).toBe(true);
  });
  it('enables joined lists but never bypasses a revoked access', () => {
    Storage.importSharedList('joined');
    expect(Storage.isSyncEnabled('joined')).toBe(true);
    Storage.disableSync('joined');
    expect(Storage.isSyncEnabled('joined')).toBe(false);
    expect(() => Storage.enableSyncForSharing('joined')).toThrow(/invitation/);
    Storage.importSharedList('joined');
    expect(Storage.isSyncEnabled('joined')).toBe(true);
  });
  it('removes sharing metadata on deletion and rejects nonexistent or archived lists', () => {
    expect(() => Storage.enableSyncForSharing('missing')).toThrow();
    Storage.enableSyncForSharing('home');
    Storage.deleteListPermanently('home');
    expect(Storage.isSyncEnabled('home')).toBe(false);
    const fresh = Storage.createList('Archive');
    Storage.archiveList(fresh.id);
    expect(() => Storage.enableSyncForSharing(fresh.id)).toThrow();
  });
});

describe('portable list backups', () => {
  it.each(['pending', 'shown', 'accepted', 'kept'] as const)('restores personal barcode names and catalogue review state (%s)', catalogueReview => {
    const preference = { name: 'Mon café', catalogueName: 'Café du catalogue', catalogueReview };
    saveProductPreference('12345678', preference);
    const backup = Storage.createBackup();
    database.run('DELETE FROM app_metadata');
    Storage.restoreBackup(backup);
    expect(getProductPreference('12345678')).toEqual(preference);
  });
  it('keeps the current name when restoring a previously seen proposal without asking again', () => {
    saveProductPreference('12345678', { name: 'Ancien nom', catalogueName: 'Café du catalogue', catalogueReview: 'shown' });
    const backup = Storage.createBackup();
    saveProductPreference('12345678', { name: 'Mon nouveau nom', catalogueReview: 'pending' });
    Storage.restoreBackup(backup);
    expect(getProductPreference('12345678')).toMatchObject({ name: 'Mon nouveau nom', catalogueReview: 'kept' });
  });
  it('exports legacy choices, absent-list preferences and theme, then restores atomically on a fresh device', () => {
    LocalKeyValueStorage.setString('product-category:v1:quinoa', 'Épicerie salée');
    saveProductPreference('12345678', { name: 'Mon café', category: 'Épicerie sucrée' });
    PersonalSettings.setString(THEME_STORAGE_KEY, 'nuit');
    const backup = Storage.createBackup();
    expect(backup.version).toBe(2);
    if (backup.version !== 2) throw new Error('v2 expected');
    expect(backup.preferences.categories).toContainEqual({ name: 'Quinoa', category: 'Épicerie salée' });
    LocalKeyValueStorage.delete('product-category:v1:quinoa');
    database.run('DELETE FROM app_metadata');
    database.run("CREATE TRIGGER fail_settings BEFORE INSERT ON app_metadata WHEN NEW.key LIKE 'restored-backup:%' BEGIN SELECT RAISE(ABORT, 'full'); END");
    expect(() => Storage.restoreBackup(backup)).toThrow();
    expect(PersonalSettings.getString(THEME_STORAGE_KEY)).toBeNull();
    expect(getProductPreference('12345678')).toBeNull();
    expect(Storage.getLists()).toHaveLength(2);
    database.run('DROP TRIGGER fail_settings');
    Storage.restoreBackup(backup);
    expect(PersonalSettings.getString(THEME_STORAGE_KEY)).toBe('nuit');
    expect(getRememberedCategory('Quinoa')).toBe('Épicerie salée');
    expect(getProductPreference('12345678')?.name).toBe('Mon café');
    const disk = database.export(); database.close(); database = createDatabase(disk);
    expect(PersonalSettings.getString(THEME_STORAGE_KEY)).toBe('nuit');
    expect(getRememberedCategory('Quinoa')).toBe('Épicerie salée');
  });
  it('keeps current choices on conflict and accepts v1 without touching preferences', () => {
    rememberProductCategory('Quinoa', 'Épicerie salée');
    PersonalSettings.setString(THEME_STORAGE_KEY, 'nuit');
    saveProductPreference('12345678', { name: 'Avant' });
    const backup = Storage.createBackup();
    rememberProductCategory('Quinoa', 'Boissons');
    PersonalSettings.setString(THEME_STORAGE_KEY, 'papier');
    saveProductPreference('12345678', { name: 'Après' });
    Storage.restoreBackup(backup);
    expect(PersonalSettings.getString(THEME_STORAGE_KEY)).toBe('papier');
    expect(getRememberedCategory('Quinoa')).toBe('Boissons');
    expect(getProductPreference('12345678')?.name).toBe('Après');
    const legacy = { ...backup, version: 1, backupId: 'legacy-backup-123456' } as Record<string, unknown>;
    delete legacy.preferences;
    Storage.restoreBackup(legacy);
    expect(PersonalSettings.getString(THEME_STORAGE_KEY)).toBe('papier');
  });
  it('does not resurrect a deleted legacy preference after a restart', () => {
    const key = 'product-category:v1:quinoa';
    LocalKeyValueStorage.setString(key, 'Épicerie salée');
    expect(getRememberedCategory('Quinoa')).toBe('Épicerie salée');
    rememberProductCategory('Quinoa', 'À classer');
    const disk = database.export(); database.close(); database = createDatabase(disk);
    expect(getRememberedCategory('Quinoa')).toBeNull();
    const backup = Storage.createBackup();
    if (backup.version !== 2) throw new Error('v2 expected');
    backup.preferences.categories = [{ name: 'Quinoa', category: 'Boissons' }];
    Storage.restoreBackup(backup);
    expect(getRememberedCategory('Quinoa')).toBeNull();
    LocalKeyValueStorage.delete(key);
  });
  it('normalizes restored plurals and reuses remembered aisles only when the backup item was unclassified', () => {
    rememberProductCategory('Orange', 'Fruits & légumes');
    try {
      Storage.saveCurrentList('home', [milk({ name: 'Oranges', category: 'À classer' }),
        milk({ id: 'chosen', name: 'Oranges', category: 'Boissons' })]);
      const ids = Storage.restoreBackup(Storage.createBackup());
      const restored = ids.flatMap((id) => Storage.getCurrentList(id));
      expect(restored.map((item) => [item.name, item.category])).toEqual([
        ['Orange', 'Fruits & légumes'], ['Orange', 'Boissons'],
      ]);
    } finally { LocalKeyValueStorage.delete('product-category:v1:orange'); }
  });
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

it('keeps barcode aliases private across two SQLite copies, disconnect and explicit rejoin', () => {
  const a = database;
  const b = createDatabase(database.export());
  let second = b;
  const barcode = '3017620422003';
  const catalogueItem = milk({ barcode, name: 'Nom catalogue' });
  try {
    for (const device of [a, b]) {
      database = device;
      Storage.importSharedList('home');
      Storage.completeSync('home', [], [catalogueItem], 1000);
    }
    database = a;
    saveProductPreference(barcode, { name: 'Mon nom', catalogueName: 'Nom catalogue', catalogueReview: 'kept' });
    Storage.saveCurrentList('home', incrementGroup(Storage.getCurrentList('home'), 'milk'));
    const sent = Storage.getPendingChanges('home');
    expect(sent[0].name).toBe('Nom catalogue');
    database = b;
    Storage.completeSync('home', [], sent, 1001);
    expect(Storage.getCurrentList('home')[0]).toMatchObject({ name: 'Nom catalogue', quantity: 2 });
    expect(getProductPreference(barcode)).toBeNull();
    Storage.disableSync('home');
    Storage.saveCurrentList('home', incrementGroup(Storage.getCurrentList('home'), 'milk'));
    expect(Storage.isSyncEnabled('home')).toBe(false);
    expect(Storage.getCurrentList('home')[0].quantity).toBe(3);
    const saved = b.export();
    second = createDatabase(saved); b.close(); database = second;
    expect(Storage.isSyncEnabled('home')).toBe(false);
    Storage.importSharedList('home');
    expect(Storage.isSyncEnabled('home')).toBe(true);
    expect(Storage.getPendingChanges('home')[0]).toMatchObject({ name: 'Nom catalogue', quantity: 3 });
    database = a;
    Storage.makeListLocal('home');
    expect(Storage.isSyncEnabled('home')).toBe(false);
    expect(getProductPreference(barcode)?.name).toBe('Mon nom');
  } finally { second.close(); database = a; }
});
