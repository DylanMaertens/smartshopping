import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'product-cache' });

type CacheEntry<T> = {
  data: T;
  cachedAt: number;
  expiresAt: number;
};

export class ProductCache {
  private static readonly TTL = 7 * 24 * 60 * 60 * 1000;

  static set<T>(key: string, value: T) {
    const now = Date.now();
    const entry: CacheEntry<T> = { data: value, cachedAt: now, expiresAt: now + this.TTL };
    storage.set(key, JSON.stringify(entry));
  }

  static get<T>(key: string): T | null {
    const raw = storage.getString(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() > entry.expiresAt) {
      storage.delete(key);
      return null;
    }
    return entry.data;
  }
}
