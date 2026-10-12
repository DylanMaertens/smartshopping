import { expect, it } from 'vitest';
import { applyLikelyOcrCorrections, applyOcrCorrection, suggestOcrCorrections } from './ocrSpelling';
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

it('keeps correctly read feuille and feuilles without uncertain alternatives', () => {
  expect(suggestOcrCorrections('feuille\nFeuilles\nFEUILLE\n2 x feuilles de papier\nfeuille de cuisson')).toEqual([]);
});

it('preserves common pasta names instead of offering unrelated corrections', () => {
  expect(suggestOcrCorrections('Pâtes\nNouilles\nSpaghetti\nSpaghettis\nCoquillettes\nMacaroni\nMacaronis\nTagliatelles\nVermicelles\nPenne\nFusilli')).toEqual([]);
});

it('offers the intended readings from the handwritten-list screenshot without hardcoded substitutions', () => {
  const text = "Litiéne\nSanex\nwwhisky\nYacan'ts\noRange\nFromage\nResd\nViande\nclaquelte";
  const suggestions = suggestOcrCorrections(text);
  for (const [original, expected] of [['Litiéne', 'Litière'], ['wwhisky', 'whisky'],
    ["Yacan'ts", 'Yaourts'], ['Resd', 'Rosé'], ['claquelte', 'croquette']]) {
    expect(suggestions.find((suggestion) => suggestion.original === original)?.alternatives, original).toContain(expected);
  }
  expect(applyLikelyOcrCorrections(text, suggestions)).toBe("Litière\nSanex\nwhisky\nYacan'ts\noRange\nFromage\nResd\nViande\nclaquelte");
});

it('preserves brands, local names, quantities, units and genuine French elisions', () => {
  expect(suggestOcrCorrections("Sanex\nNutella\n2 x lait\n7up\n500g\n1L\nL'Oréal\nd'orange\nCrème fraîche\nPommes de terre\nLumix", ['Lumix'])).toEqual([]);
});

it('applies probable suggestions right-to-left, preserving repeated articles and quantities', () => {
  const text = '3 x wwhisky\nTomtaes\nwwhisky x 2';
  expect(applyLikelyOcrCorrections(text, suggestOcrCorrections(text))).toBe('3 x whisky\nTomates\nwhisky x 2');
});

it('keeps accents and uppercase and does not change ambiguous readings in a batch', () => {
  expect(suggestOcrCorrections('LITIÈNE')[0]?.replacement).toBe('LITIÈRE');
  expect(suggestOcrCorrections('creme')[0]?.replacement).toBe('crème');
  const text = "Resd\nYacan'ts\nclaquelte";
  expect(suggestOcrCorrections(text).every(({ confidence }) => confidence === 'uncertain')).toBe(true);
  expect(applyLikelyOcrCorrections(text, suggestOcrCorrections(text))).toBe(text);
});

it('bounds work and suggestions on large or repeated input', () => {
  expect(suggestOcrCorrections('Tomtaes\n'.repeat(10000))).toHaveLength(50);
  expect(suggestOcrCorrections('a'.repeat(20000))).toEqual([]);
});
