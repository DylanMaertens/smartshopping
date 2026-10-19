import SQLiteKeyValueStorage from 'expo-sqlite/kv-store';

const memoryStore = new Map<string, string>();

type BrowserLikeStorage = {
  length: number;
  key: (index: number) => string | null;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function getBrowserStorage(): BrowserLikeStorage | null {
  if (typeof globalThis === 'undefined') return null;

  const maybeStorage = (globalThis as { localStorage?: BrowserLikeStorage }).localStorage;
  return maybeStorage ?? null;
}

export class LocalKeyValueStorage {
  static getAllKeys(): string[] {
    const browser = getBrowserStorage();
    if (browser) return Array.from({ length: browser.length }, (_, index) => browser.key(index)).filter((key): key is string => key !== null);
    return SQLiteKeyValueStorage.getAllKeysSync();
  }
  static getString(key: string): string | null {
    const browserStorage = getBrowserStorage();
    if (browserStorage) return browserStorage.getItem(key);
    return SQLiteKeyValueStorage.getItemSync(key) ?? memoryStore.get(key) ?? null;
  }

  static setString(key: string, value: string): void {
    const browserStorage = getBrowserStorage();
    if (browserStorage) {
      browserStorage.setItem(key, value);
      return;
    }

    SQLiteKeyValueStorage.setItemSync(key, value);
    memoryStore.set(key, value);
  }

  static delete(key: string): void {
    const browserStorage = getBrowserStorage();
    if (browserStorage) {
      browserStorage.removeItem(key);
      return;
    }

    SQLiteKeyValueStorage.removeItemSync(key);
    memoryStore.delete(key);
  }
}
