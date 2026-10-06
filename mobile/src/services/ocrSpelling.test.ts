import { expect, it } from 'vitest';
import { applyOcrCorrection, suggestOcrCorrections } from './ocrSpelling';
it('suggests conservative corrections but changes only a manually accepted occurrence', () => {
  const text = '2 x lalt\nTomtaes\n7up\nNutella\nTomtaes';
  const suggestions = suggestOcrCorrections(text);
  expect(suggestions.map(({ original, replacement }) => [original, replacement])).toEqual([
    ['lalt', 'lait'], ['Tomtaes', 'Tomates'], ['Tomtaes', 'Tomates'],
  ]);
  expect(applyOcrCorrection(text, suggestions[1])).toBe('2 x lalt\nTomates\n7up\nNutella\nTomtaes');
  expect(applyOcrCorrection('Nouvelle liste', suggestions[1])).toBe('Nouvelle liste');
});
it('does not suggest alternatives for correct vocabulary or short words', () => {
  expect(suggestOcrCorrections('Pain\nLait\n2 x riz\nYaourts\nHuile')).toEqual([]);
});
