import { z } from 'zod';
import { itemNameKey, normalizeItemName, truncateUtf8 } from '@/services/itemValidation';
import { isThemeId } from '@/theme/themes';
import { canonicalCategoryName, STORE_CATEGORIES } from '@/services/categorization/categoryService';

export const MAX_BACKUP_BYTES = 4 * 1024 * 1024;
const name = z.string().transform(normalizeItemName).refine((value) => value.length > 0 && truncateUtf8(value, 200) === value);
const item = z.object({
  name,
  quantity: z.number().int().min(1).max(999),
  checked: z.boolean(),
  barcode: z.string().regex(/^\d{8,14}$/).optional(),
  category: z.string().refine((value) => truncateUtf8(value, 100) === value).optional(),
}).strict();
const category = z.string().max(100).transform(canonicalCategoryName)
  .refine(value => STORE_CATEGORIES.some(entry => entry.name === value));
export const preferencesSchema = z.object({
  theme: z.string().refine(isThemeId).optional(),
  helpIcons: z.boolean().optional(),
  products: z.array(z.object({ barcode: z.string().regex(/^\d{8,14}$/), name, category: category.optional(),
    catalogueName: name.optional(), catalogueReview: z.enum(['pending', 'shown', 'accepted', 'kept']).optional(),
  }).strict()).max(10_000),
  categories: z.array(z.object({ name, category }).strict()).max(10_000),
}).strict().refine(value => new Set(value.products.map(entry => entry.barcode)).size === value.products.length
  && new Set(value.categories.map(entry => itemNameKey(entry.name))).size === value.categories.length);
export type BackupPreferences = z.infer<typeof preferencesSchema>;
const common = z.object({
  format: z.literal('smartshopping-lists'),
  backupId: z.string().regex(/^[a-zA-Z0-9-]{16,80}$/),
  createdAt: z.string().datetime(),
  lists: z.array(z.object({
    name: z.string().trim().min(1).refine((value) => [...value].length <= 200),
    categoryOrder: z.array(z.string().max(80)).max(100),
    appearance: z.object({ notebook: z.boolean(), showCategories: z.boolean() }).strict().optional(),
    items: z.array(item).max(10_000),
  }).strict()).min(1).max(200),
});
const schema = z.discriminatedUnion('version', [
  common.extend({ version: z.literal(1) }).strict(),
  common.extend({ version: z.literal(2), preferences: preferencesSchema }).strict(),
]).refine((backup) => backup.lists.reduce((sum, list) => sum + list.items.length, 0) <= 10_000);

export type ListBackup = z.infer<typeof schema>;
export function validateBackup(value: unknown): ListBackup {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error('Sauvegarde invalide ou version non prise en charge. Aucune liste n’a été modifiée.');
  return result.data;
}
export function parseBackup(text: string): ListBackup {
  if (text.length > MAX_BACKUP_BYTES || truncateUtf8(text, MAX_BACKUP_BYTES) !== text) {
    throw new Error('Ce fichier dépasse la limite de 4 Mo.');
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('Ce fichier n’est pas une sauvegarde Poduna valide.'); }
  return validateBackup(value);
}
export function serializeBackup(backup: ListBackup): string {
  const text = JSON.stringify(validateBackup(backup));
  // Keep exports within the same bounds as imports.
  parseBackup(text);
  return text;
}
