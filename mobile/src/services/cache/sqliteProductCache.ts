import { getDatabase } from '@/db/client';

type ProductCacheRow = {
  data: string;
  expires_at: number;
};

export class ProductCache {
  private static readonly TTL = 7 * 24 * 60 * 60 * 1000;

  static set<T>(barcode: string, value: T): void {
    const now = Date.now();
    getDatabase().runSync(
      `INSERT INTO products_cache (barcode, data, cached_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(barcode) DO UPDATE SET
         data = excluded.data,
         cached_at = excluded.cached_at,
         expires_at = excluded.expires_at`,
      barcode,
      JSON.stringify(value),
      now,
      now + this.TTL,
    );
  }

  static get<T>(barcode: string): T | null {
    const row = getDatabase().getFirstSync<ProductCacheRow>(
      'SELECT data, expires_at FROM products_cache WHERE barcode = ?',
      barcode,
    );
    if (!row) return null;

    if (Date.now() > row.expires_at) {
      this.delete(barcode);
      return null;
    }

    return JSON.parse(row.data) as T;
  }

  static delete(barcode: string): void {
    getDatabase().runSync('DELETE FROM products_cache WHERE barcode = ?', barcode);
  }

  static deleteExpired(now = Date.now()): void {
    getDatabase().runSync('DELETE FROM products_cache WHERE expires_at < ?', now);
  }
}
