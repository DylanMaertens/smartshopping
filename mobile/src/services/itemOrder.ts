import { itemNameKey } from './itemValidation';
import type { ShoppingItem } from '@/types';

const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const alphabeticKey = (name: string): string => itemNameKey(name).normalize('NFD')
  .replace(/\p{M}/gu, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');

/** Same display order on every device, independent of arrival dates and locale.
 * This does not change stored items or create synchronization operations.
 */
export function sortItemsForDisplay(items: readonly ShoppingItem[]): ShoppingItem[] {
  return items.map((item) => ({ item, key: alphabeticKey(item.name), name: itemNameKey(item.name) }))
    .sort((a, b) => compareText(a.key, b.key) || compareText(a.name, b.name) || compareText(a.item.id, b.item.id))
    .map(({ item }) => item);
}
