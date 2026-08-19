import * as SQLite from 'expo-sqlite';
import { sqliteSchema } from './schema';

const DATABASE_NAME = 'smartshopping.db';

let database: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (database) return database;

  database = SQLite.openDatabaseSync(DATABASE_NAME);
  database.execSync('PRAGMA foreign_keys = ON;');
  database.execSync(sqliteSchema);
  return database;
}
