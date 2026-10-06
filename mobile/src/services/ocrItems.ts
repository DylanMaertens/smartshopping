import { groupEquivalentItems, incrementGroup } from './itemGroups';
import { itemNameKey, normalizeItemName, truncateUtf8 } from './itemValidation';
import type { ShoppingItem } from '@/types';

export type OcrItem = { name: string; quantity: number };

/** Remove list decoration, not product punctuation, weights or quantity markers. */
export function cleanOcrText(text: string): string {
  return text.split(/\r?\n/).map((line) => line
    .replace(/^\s*(?:(?:\[[ xX✓✔]?\]|[-*+•·☐☑✓✔✗✘□■○●]+)\s*|\d+[.)]\s+)/u, '')
    .replace(/[^\p{L}\p{M}\p{N}\s'’.,%/()×+\-]/gu, '')
    .replace(/\s+/gu, ' ').replace(/^[\s.,\-]+|[\s.,\-]+$/gu, '')
    .trim()).filter((line) => /[\p{L}\p{N}]/u.test(line)).join('\n');
}

/** Recognition stays editable: one line is one article, with optional “2 x lait”. */
export function parseOcrItems(text: string): OcrItem[] {
  const lines = cleanOcrText(text).split('\n').map(normalizeItemName).filter(Boolean);
  if (!lines.length) throw new Error('Ajoute au moins un article, un par ligne.');
  if (lines.length > 50) throw new Error('Importe au maximum 50 lignes à la fois.');
  return lines.map((line) => {
    const prefix = line.match(/^(\d+)\s*[x×]\s+(.+)$/iu);
    const suffix = line.match(/^(.+?)\s+[x×]\s*(\d+)$/iu);
    const name = normalizeItemName(prefix?.[2] ?? suffix?.[1] ?? line);
    const quantity = Number(prefix?.[1] ?? suffix?.[2] ?? 1);
    if (!name || truncateUtf8(name, 200) !== name) throw new Error('Chaque article doit avoir un nom de 200 octets maximum.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('Les quantités doivent être comprises entre 1 et 999.');
    return { name, quantity };
  });
}

/** Validate the whole batch before saving anything; repeated names increase quantities. */
export function mergeOcrItems(
  current: ShoppingItem[], drafts: OcrItem[], create: (name: string) => ShoppingItem,
): ShoppingItem[] {
  let result = current.map((item) => ({ ...item }));
  for (const draft of drafts) {
    const existing = groupEquivalentItems(result).find((item) => !item.deletedAt && itemNameKey(item.name) === itemNameKey(draft.name));
    if (existing) {
      if (existing.quantity + draft.quantity > 999) throw new Error(`La quantité de « ${existing.name} » dépasserait 999. Corrige les quantités avant l’ajout.`);
      result = incrementGroup(result, existing.id, draft.quantity, true);
    } else result.unshift({ ...create(draft.name), quantity: draft.quantity });
  }
  return result;
}
