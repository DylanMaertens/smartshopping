import { OCR_PROTECTED_WORDS, OCR_WORDS } from './ocrVocabulary';

export type OcrSuggestion = {
  start: number; end: number; original: string; replacement: string;
  alternatives: string[]; confidence: 'likely' | 'uncertain';
};
const fold = (word: string) => word.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '').replace(/œ/g, 'oe');
const tokenPattern = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
const vocabulary = [...new Set(OCR_WORDS)].map((known) => ({ known, folded: fold(known) }));
const exactWords = new Set(OCR_WORDS);
const protectedWords = new Set(OCR_PROTECTED_WORDS.map(fold));

function substitution(a: string, b: string): number {
  if (a === b) return 0;
  // Plausible handwriting confusions get a lower cost, not a forced replacement.
  return ['il', 'ltnr', 'nu', 'aoce'].some((group) => group.includes(a) && group.includes(b)) ? 0.6 : 1;
}

function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  rows[0] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const deletion = i > 1 && a[i - 1] === a[i - 2] ? 0.6 : 1;
    rows[i][j] = Math.min(rows[i - 1][j] + deletion, rows[i][j - 1] + 1,
      rows[i - 1][j - 1] + substitution(a[i - 1], b[j - 1]));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
      rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 0.7);
    }
  }
  return rows[a.length][b.length];
}

function matchCase(word: string, original: string): string {
  if (original === original.toLocaleUpperCase('fr')) return word.toLocaleUpperCase('fr');
  return original[0] === original[0].toLocaleUpperCase('fr') ? word[0].toLocaleUpperCase('fr') + word.slice(1) : word;
}

export function suggestOcrCorrections(text: string, knownNames: readonly string[] = []): OcrSuggestion[] {
  const suggestions: OcrSuggestion[] = [];
  const protectedNames = new Set(protectedWords);
  for (const name of knownNames.slice(0, 200)) {
    for (const token of name.slice(0, 200).matchAll(tokenPattern)) protectedNames.add(fold(token[0]));
  }
  const cache = new Map<string, { known: string; score: number }[]>();
  let examined = 0;
  for (const match of text.slice(0, 20000).matchAll(tokenPattern)) {
    if (++examined > 500) break;
    const original = match[0], word = fold(original).replace(/['’]/gu, '');
    if (word.length < 4 || word.length > 24 || /\p{N}/u.test(original) || /^(d|l|qu)['’]/iu.test(original)
      || exactWords.has(original.toLocaleLowerCase('fr')) || protectedNames.has(fold(original))) continue;
    let candidates = cache.get(word);
    if (!candidates) {
      const threshold = word.length <= 4 ? 1.6 : word.length <= 6 ? 2.1 : 3;
      candidates = vocabulary.filter(({ folded }) => folded.length >= 4 && Math.abs(folded.length - word.length) <= 2)
        .map(({ known, folded }) => ({ known, score: distance(word, folded) }))
        .filter(({ score }) => score <= threshold + 0.001).sort((a, b) => a.score - b.score);
      cache.set(word, candidates);
    }
    if (!candidates.length) continue;
    const best = candidates[0];
    const alternatives = candidates.filter(({ score }) => score <= best.score + 0.65).slice(0, 3)
      .map(({ known }) => matchCase(known, original));
    const likely = best.score <= 1 && (!candidates[1] || candidates[1].score - best.score >= 0.45)
      && !/['’]/u.test(original);
    suggestions.push({ start: match.index!, end: match.index! + original.length, original,
      replacement: alternatives[0], alternatives, confidence: likely ? 'likely' : 'uncertain' });
    if (suggestions.length === 50) break;
  }
  return suggestions;
}

export function applyOcrCorrection(text: string, suggestion: OcrSuggestion): string {
  if (text.slice(suggestion.start, suggestion.end) !== suggestion.original) return text;
  return text.slice(0, suggestion.start) + suggestion.replacement + text.slice(suggestion.end);
}

export function applyLikelyOcrCorrections(text: string, suggestions: readonly OcrSuggestion[]): string {
  // Right-to-left preserves the offsets even when a replacement changes length.
  return suggestions.filter(({ confidence }) => confidence === 'likely').sort((a, b) => b.start - a.start)
    .reduce((current, suggestion) => applyOcrCorrection(current, suggestion), text);
}
