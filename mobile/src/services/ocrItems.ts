import { groupEquivalentItems, incrementGroup } from './itemGroups';
import { itemNameKey, normalizeItemName, truncateUtf8 } from './itemValidation';
import type { ShoppingItem } from '@/types';

export type OcrItem = { name: string; quantity: number };
const listDecoration = /^\s*(?:(?:\[[ xX✓✔]?\]|[-*+•·☐☑✓✔✗✘□■○●]+)\s*|\d+[.)]\s+)/u;

/** Only prepare recognition output, never silently re-split the user's reviewed names.
 * A tight hyphen is ambiguous (pain-lait / chou-fleur): preserve it rather than guess. */
export function prepareOcrText(text: string): string {
  const lines = text.split(/\r?\n/).map((raw) => {
    const line = raw.replace(listDecoration, '').replace(/[‐‑−]/gu, '-');
    const protectedPositions = new Set<number>();
    const protectedTokens = [
      /\d+(?:[ \t]*[./\-–—][ \t]*\d+)+/gu, // fractions, decimals, dates and ranges
      /\b(?:st|ste|dr|mr|mrs|mme|mlle|m)\./giu,
      /(?:\p{L}\.){2,}/gu, // U.H.T., M.G., etc.
      /\b(?:mg|g|kg|ml|cl|dl|l|km|m|kcal|kj)[ \t]*\/[ \t]*(?:\d+[ \t]*)?(?:mg|g|kg|ml|cl|dl|l|km|m|h)(?!\p{L})/giu,
    ];
    for (const pattern of protectedTokens) for (const match of line.matchAll(pattern)) {
      for (let i = match.index; i < match.index + match[0].length; i++) protectedPositions.add(i);
    }
    let result = '', parentheses = 0;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '(') parentheses++;
      const separator = /[./;|•·●○■□▪◦☐☑✓✔★*→➜]/u.test(char)
        || /[–—]/u.test(char)
        || (char === '-' && (line[i - 1] === '-' || line[i + 1] === '-'
          || (/\s/u.test(line[i - 1] ?? '') && /\s/u.test(line[i + 1] ?? ''))));
      result += separator && !parentheses && !protectedPositions.has(i) ? '\n' : char.replace(/[–—]/u, '-');
      if (char === ')') parentheses = Math.max(0, parentheses - 1);
    }
    return result;
  });
  return cleanOcrText(lines.join('\n'));
}

/** Remove list decoration, not product punctuation, weights or quantity markers. */
export function cleanOcrText(text: string): string {
  return text.split(/\r?\n/).map((line) => line
    .replace(listDecoration, '')
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
