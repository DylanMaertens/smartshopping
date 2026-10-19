import { getDatabase } from '@/db/client';
import { LocalKeyValueStorage } from './localKeyValueStorage';

export const THEME_STORAGE_KEY = 'appearance.theme.v1';
const prefix = 'personal-setting:';
export const isPersonalKey = (key: string) => key === THEME_STORAGE_KEY
  || key.startsWith('product-preference:v1:') || key.startsWith('product-category:v1:');

/** Same SQLite transaction as lists; legacy KV values remain readable after upgrade. */
export class PersonalSettings {
  static has(key: string): boolean {
    return !!getDatabase().getFirstSync('SELECT value FROM app_metadata WHERE key = ?', prefix + key)
      || LocalKeyValueStorage.getString(key) !== null;
  }
  static getString(key: string): string | null {
    const row = getDatabase().getFirstSync<{ value: string }>('SELECT value FROM app_metadata WHERE key = ?', prefix + key);
    // Empty string is a tombstone, so deleting a migrated choice never revives it.
    return row ? row.value || null : LocalKeyValueStorage.getString(key);
  }
  static setString(key: string, value: string): void {
    if (!isPersonalKey(key)) throw new Error('Préférence non prise en charge.');
    getDatabase().runSync('INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', prefix + key, value);
  }
  static delete(key: string): void { this.setString(key, ''); }
  static keys(): string[] {
    const rows = getDatabase().getAllSync<{ key: string }>('SELECT key FROM app_metadata WHERE key LIKE ?', prefix + '%');
    return [...new Set([...LocalKeyValueStorage.getAllKeys().filter(isPersonalKey), ...rows.map(row => row.key.slice(prefix.length))])];
  }
}
