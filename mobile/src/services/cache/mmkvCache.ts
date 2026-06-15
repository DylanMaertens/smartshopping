import { LocalKeyValueStorage } from '@/services/storage/localKeyValueStorage';

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

export class ProductCache {
  private static readonly TTL = 7 * 24 * 60 * 60 * 1000;

  static set<T>(key: string, value: T): void {
    const entry: CacheEntry<T> = {
      data: value,
      cachedAt: Date.now(),
      expiresAt: Date.now() + this.TTL,
    };

    LocalKeyValueStorage.setString(this.cacheKey(key), JSON.stringify(entry));
  }

  static get<T>(key: string): T | null {
    const raw = LocalKeyValueStorage.getString(this.cacheKey(key));
    if (!raw) return null;

    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    return entry.data;
  }

  static delete(key: string): void {
    LocalKeyValueStorage.delete(this.cacheKey(key));
  }

  private static cacheKey(key: string): string {
    return `product-cache:${key}`;
  }
}
