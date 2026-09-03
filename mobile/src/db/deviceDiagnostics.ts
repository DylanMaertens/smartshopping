import { getDatabase } from './client';

export type DeviceDiagnosticResult = {
  name: string;
  passed: boolean;
  detail: string;
};

export function runDeviceStorageDiagnostics(): DeviceDiagnosticResult[] {
  const db = getDatabase();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const listId = `diagnostic-list-${suffix}`;
  const itemId = `diagnostic-item-${suffix}`;
  const barcode = `diagnostic-${suffix}`;
  const results: DeviceDiagnosticResult[] = [];

  try {
    db.withTransactionSync(() => {
      const now = Date.now();
      db.runSync(
        'INSERT INTO shopping_lists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
        listId,
        'Diagnostic',
        now,
        now,
      );
      db.runSync(
        `INSERT INTO items (id, list_id, name, quantity, checked, created_at, updated_at)
         VALUES (?, ?, 'Article diagnostic', 1, 0, ?, ?)`,
        itemId,
        listId,
        now,
        now,
      );
      db.runSync(
        'INSERT INTO products_cache (barcode, data, cached_at, expires_at) VALUES (?, ?, ?, ?)',
        barcode,
        '{}',
        now,
        now + 60_000,
      );
    });

    const item = db.getFirstSync<{ name: string }>('SELECT name FROM items WHERE id = ?', itemId);
    results.push({
      name: 'Lecture/écriture SQLite native',
      passed: item?.name === 'Article diagnostic',
      detail: item ? 'Transaction relue depuis expo-sqlite.' : 'Article diagnostic introuvable.',
    });

    db.runSync('DELETE FROM shopping_lists WHERE id = ?', listId);
    const childCount = db.getFirstSync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM items WHERE id = ?',
      itemId,
    );
    results.push({
      name: 'Clés étrangères et cascade',
      passed: childCount?.count === 0,
      detail: childCount?.count === 0 ? 'Suppression en cascade confirmée.' : 'Cascade non appliquée.',
    });

    const cache = db.getFirstSync<{ data: string }>('SELECT data FROM products_cache WHERE barcode = ?', barcode);
    results.push({
      name: 'Cache produit local',
      passed: cache?.data === '{}',
      detail: cache ? 'Cache relu avec succès.' : 'Entrée de cache introuvable.',
    });
  } catch (error) {
    results.push({
      name: 'Initialisation SQLite native',
      passed: false,
      detail: error instanceof Error ? error.message : 'Erreur SQLite inconnue.',
    });
  } finally {
    db.runSync('DELETE FROM products_cache WHERE barcode = ?', barcode);
    db.runSync('DELETE FROM shopping_lists WHERE id = ?', listId);
  }

  return results;
}
