import { PersonalSettings, THEME_STORAGE_KEY } from '@/services/storage/personalSettings';
import { itemNameKey } from '@/services/itemValidation';
import { DEFAULT_THEME_ID, isThemeId } from '@/theme/themes';
import { preferencesSchema, type BackupPreferences } from './listBackup';

export function exportPersonalSettings(): BackupPreferences {
  try { return snapshotPersonalSettings(); }
  catch { throw new Error('Impossible de sauvegarder les préférences : stockage indisponible ou données invalides. Aucune sauvegarde incomplète n’a été créée.'); }
}
function snapshotPersonalSettings(): BackupPreferences {
  const products = [], categories = [];
  for (const key of PersonalSettings.keys()) {
    const value = PersonalSettings.getString(key);
    if (!value) continue;
    if (key.startsWith('product-preference:v1:')) {
      // A malformed stored preference must be reported, not silently lost.
      products.push({ ...JSON.parse(value), barcode: key.slice('product-preference:v1:'.length) });
    } else if (key.startsWith('product-category:v1:')) {
      categories.push({ name: key.slice('product-category:v1:'.length), category: value });
    }
  }
  const saved = PersonalSettings.getString(THEME_STORAGE_KEY);
  return preferencesSchema.parse({ products, categories, theme: isThemeId(saved) ? saved : DEFAULT_THEME_ID });
}

/** Called inside the list restoration transaction. Existing choices win. */
export function restorePersonalSettings(value: BackupPreferences): void {
  const missing = (key: string, value: string) => {
    if (!PersonalSettings.has(key)) PersonalSettings.setString(key, value);
  };
  for (const entry of value.products) {
    const { barcode, ...product } = entry;
    missing(`product-preference:v1:${barcode}`, JSON.stringify(product));
  }
  for (const entry of value.categories) missing(`product-category:v1:${itemNameKey(entry.name)}`, entry.category);
  if (value.theme) missing(THEME_STORAGE_KEY, value.theme);
}
