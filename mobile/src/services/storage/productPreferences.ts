import { LocalKeyValueStorage } from './localKeyValueStorage';
import { normalizeItemName, truncateUtf8 } from '../itemValidation';

export type ProductPreference = { name: string; category?: string };
const key = (barcode: string) => `product-preference:v1:${barcode}`;

/** Personal choices outlive both a shopping list and the expiring catalogue cache. */
export function getProductPreference(barcode: string): ProductPreference | null {
  if (!/^\d{8,14}$/.test(barcode)) return null;
  try {
    const value = JSON.parse(LocalKeyValueStorage.getString(key(barcode)) ?? 'null');
    if (!value || typeof value.name !== 'string' || !value.name.trim()) return null;
    return { name: normalizeItemName(truncateUtf8(value.name, 200)),
      ...(typeof value.category === 'string' ? { category: value.category } : {}) };
  } catch { return null; }
}

export function saveProductPreference(barcode: string, value: ProductPreference): void {
  const name = normalizeItemName(value.name);
  if (!/^\d{8,14}$/.test(barcode) || !name || truncateUtf8(name, 200) !== name) return;
  LocalKeyValueStorage.setString(key(barcode), JSON.stringify({ ...value, name }));
}
