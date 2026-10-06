// A small offline vocabulary: suggestions only, never an automatic rewrite of a brand.
const WORDS = `abricots amandes ananas aubergines avocats bananes beurre betteraves biscuits
brocoli café carottes céréales champignons chocolat citrons clémentines compote confiture
concombres courgettes crème croquettes dentifrice déodorant échalotes endives épinards farine
fraises framboises fromage haricots huile jambon lait laitue lessive lentilles levure limonade
lingettes légumes mandarines margarine miel moutarde mozzarella muesli noisettes nouilles
oignons olives oranges pain papier pâtes pêches persil petits pois poireaux poires poivrons
pommes poulet pruneaux radis raisins ricotta riz salade sardines saumon savon semoule
shampooing sucre surgelés thé thon tomates vanille vinaigre yaourt yaourts œufs`.split(/\s+/u);
export type OcrSuggestion = { start: number; end: number; original: string; replacement: string };
const fold = (word: string) => word.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '').replace(/œ/g, 'oe');

function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  rows[0] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
      rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

export function suggestOcrCorrections(text: string): OcrSuggestion[] {
  const suggestions: OcrSuggestion[] = [];
  for (const match of text.matchAll(/[\p{L}\p{M}]+/gu)) {
    const original = match[0], word = fold(original);
    if (word.length < 4 || word.length > 24 || WORDS.some((known) => known === original.toLocaleLowerCase('fr'))) continue;
    const candidates = WORDS.map((known) => ({ known, score: distance(word, fold(known)) }))
      .filter(({ score }) => score <= 1).sort((a, b) => a.score - b.score);
    if (!candidates.length || (candidates[1] && candidates[1].score === candidates[0].score)) continue;
    const replacement = candidates[0].known;
    suggestions.push({ start: match.index!, end: match.index! + original.length, original,
      replacement: original[0] === original[0].toLocaleUpperCase('fr') ? replacement[0].toLocaleUpperCase('fr') + replacement.slice(1) : replacement });
    if (suggestions.length === 12) break;
  }
  return suggestions;
}

export function applyOcrCorrection(text: string, suggestion: OcrSuggestion): string {
  if (text.slice(suggestion.start, suggestion.end) !== suggestion.original) return text;
  return text.slice(0, suggestion.start) + suggestion.replacement + text.slice(suggestion.end);
}
