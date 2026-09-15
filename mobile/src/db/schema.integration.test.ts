import { fileURLToPath, URL } from 'node:url';
import initSqlJs, { type Database } from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sqliteSchema } from './schema';

let createDatabase: () => Database;
let database: Database;

beforeAll(async () => {
  const SQL = await initSqlJs({
    locateFile: (file) => fileURLToPath(new URL(`../../node_modules/sql.js/dist/${file}`, import.meta.url)),
  });
  createDatabase = () => new SQL.Database();
});

beforeEach(() => {
  database = createDatabase();
  database.run('PRAGMA foreign_keys = ON;');
  database.run(sqliteSchema);
});

describe('SQLite mobile schema', () => {
  it('isole les articles de plusieurs listes et applique la suppression en cascade', () => {
    insertList('home', 'Maison', 1);
    insertList('party', 'Anniversaire', 2);
    insertItem('milk', 'home', 'Lait', 3);
    insertItem('cake', 'party', 'Gâteau', 4);

    expect(singleNumber("SELECT COUNT(*) FROM items WHERE list_id = 'home'")).toBe(1);
    expect(singleNumber("SELECT COUNT(*) FROM items WHERE list_id = 'party'")).toBe(1);

    database.run("DELETE FROM shopping_lists WHERE id = 'home'");
    expect(singleNumber("SELECT COUNT(*) FROM items WHERE id = 'milk'")).toBe(0);
    expect(singleNumber("SELECT COUNT(*) FROM items WHERE id = 'cake'")).toBe(1);
  });

  it('garantit une seule opération de sync courante par entité', () => {
    insertList('home', 'Maison', 1);
    insertItem('milk', 'home', 'Lait', 2);
    database.run(
      `INSERT INTO sync_ops (id, entity_type, entity_id, operation, payload, created_at)
       VALUES ('op-1', 'item', 'milk', 'upsert', '{}', 2)`,
    );

    expect(() =>
      database.run(
        `INSERT INTO sync_ops (id, entity_type, entity_id, operation, payload, created_at)
         VALUES ('op-2', 'item', 'milk', 'delete', '{}', 3)`,
      ),
    ).toThrow();
  });

  it('sépare les métadonnées et permet de purger le cache expiré', () => {
    database.run("INSERT INTO app_metadata (key, value) VALUES ('active-list-id', 'home')");
    database.run(
      `INSERT INTO products_cache (barcode, data, cached_at, expires_at)
       VALUES ('fresh', '{}', 10, 100), ('expired', '{}', 10, 20)`,
    );
    database.run('DELETE FROM products_cache WHERE expires_at < ?', [50]);

    expect(singleNumber('SELECT COUNT(*) FROM products_cache')).toBe(1);
    expect(singleText("SELECT value FROM app_metadata WHERE key = 'active-list-id'")).toBe('home');
  });
});

function insertList(id: string, name: string, timestamp: number) {
  database.run(
    'INSERT INTO shopping_lists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [id, name, timestamp, timestamp],
  );
}

function insertItem(id: string, listId: string, name: string, timestamp: number) {
  database.run(
    `INSERT INTO items (id, list_id, name, quantity, checked, created_at, updated_at)
     VALUES (?, ?, ?, 1, 0, ?, ?)`,
    [id, listId, name, timestamp, timestamp],
  );
}

function singleNumber(query: string): number {
  return database.exec(query)[0].values[0][0] as number;
}

function singleText(query: string): string {
  return database.exec(query)[0].values[0][0] as string;
}
