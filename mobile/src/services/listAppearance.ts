export type ListAppearance = { notebook: boolean; showCategories: boolean };

/** Local display only; never changes the order or shared contents of a list. */
export function normalizeListAppearance(value: unknown): ListAppearance {
  const saved = value && typeof value === 'object' ? value as Partial<ListAppearance> : {};
  return { notebook: saved.notebook === true, showCategories: saved.showCategories !== false };
}
