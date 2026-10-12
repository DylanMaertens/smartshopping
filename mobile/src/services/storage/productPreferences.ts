import { LocalKeyValueStorage } from './localKeyValueStorage';
import { itemNameKey, normalizeItemName, truncateUtf8 } from '../itemValidation';
import { canonicalCategoryName, STORE_CATEGORIES } from '../categorization/categoryService';

export type ProductPreference = { name: string; category?: string };
const key = (barcode: string) => `product-preference:v1:${barcode}`;

/** Personal choices outlive both a shopping list and the expiring catalogue cache. */
export function getProductPreference(barcode: string): ProductPreference | null {
  if (!/^\d{8,14}$/.test(barcode)) return null;
  try {
    const value = JSON.parse(LocalKeyValueStorage.getString(key(barcode)) ?? 'null');
    if (!value || typeof value.name !== 'string' || !value.name.trim()) return null;
    return { name: normalizeItemName(truncateUtf8(value.name, 200)),
      ...(typeof value.category === 'string' ? { category: canonicalCategoryName(value.category) } : {}) };
  } catch { return null; }
}

export function saveProductPreference(barcode: string, value: ProductPreference): void {
  const name = normalizeItemName(value.name);
  if (!/^\d{8,14}$/.test(barcode) || !name || truncateUtf8(name, 200) !== name) return;
  LocalKeyValueStorage.setString(key(barcode), JSON.stringify({ ...value, name,
    ...(value.category ? { category: canonicalCategoryName(value.category) } : {}) }));
}

const categoryKey = (name: string) => `product-category:v1:${itemNameKey(name)}`;
const validName = (name: string) => !!name.trim() && truncateUtf8(name, 200) === name;

/** Device-local preference shared by typing, OCR and barcode lookup. No TTL. */
export function getRememberedCategory(name: string): string | null {
  if (!validName(name)) return null;
  try {
    const value = LocalKeyValueStorage.getString(categoryKey(name));
    const category = value ? canonicalCategoryName(value) : null;
    return STORE_CATEGORIES.some((entry) => entry.name === category && entry.id !== 'non-categorise') ? category : null;
  } catch { return null; }
}

export function rememberProductCategory(name: string, category: string): void {
  if (!validName(name)) return;
  const canonical = canonicalCategoryName(category);
  if (!STORE_CATEGORIES.some((entry) => entry.name === canonical)) return;
  if (canonical === 'À classer') LocalKeyValueStorage.delete(categoryKey(name));
  else LocalKeyValueStorage.setString(categoryKey(name), canonical);
}
