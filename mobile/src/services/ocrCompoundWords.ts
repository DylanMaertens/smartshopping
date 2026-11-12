/** Explicit French shopping vocabulary, not a generic "word-word" exception.
 * Extend with known compounds; do not infer them from arbitrary OCR output. */
export const OCR_COMPOUND_WORDS = [
  'chou-fleur', 'choux-fleurs', 'chou-rave', 'choux-raves',
  'demi-écrémé', 'demi-écrémée', 'demi-écrémés', 'demi-écrémées',
  'semi-écrémé', 'semi-écrémée', 'petit-suisse', 'petits-suisses',
  'petit-beurre', 'petits-beurre', 'quatre-quarts', 'casse-croûte',
  'coca-cola', 'saint-môret', 'saint-nectaire', 'saint-paulin',
  'saint-marcellin', 'saint-félicien', 'pont-l’évêque', "pont-l'évêque",
  'saint-jacques', 'sainte-maure', 'sans-gluten', 'sans-lactose',
  'essuie-tout', 'essuie-mains', 'coton-tige', 'cotons-tiges',
  'cure-dent', 'cure-dents', 'sac-poubelle', 'sacs-poubelle', 'sacs-poubelles',
  'papier-toilette', 'après-shampoing', 'après-shampooing',
  'après-rasage', 'anti-calcaire', 'anti-transpirant', 'multi-usage', 'multi-usages',
  'tire-bouchon', 'tire-bouchons', 'ouvre-boîte', 'ouvre-boîtes',
  'coupe-ongles', 'porte-savon', 'grille-pain',
] as const;

const escapeRegex = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Longer entries first; Unicode boundaries prevent matching inside another word.
// A single hyphen/underscore, possibly surrounded by OCR whitespace, is allowed.
const alternatives = [...OCR_COMPOUND_WORDS].sort((a, b) => b.length - a.length)
  .map((word) => word.split('-').map(escapeRegex).join('[ \\t]*[-_][ \\t]*'));
export const OCR_COMPOUND_WORD_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{M}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{M}\\p{N}])`, 'giu',
);

export function normalizeOcrCompoundWords(text: string): string {
  return text.normalize('NFC').replace(/[‐‑−]/gu, '-')
    .replace(OCR_COMPOUND_WORD_PATTERN, (word) => word.replace(/[ \t]*[-_][ \t]*/gu, '-'));
}
