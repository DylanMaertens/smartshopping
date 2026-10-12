import { describe, expect, it } from 'vitest';
import { prepareVoiceItems } from './voiceItems';
import { parseOcrItems } from './ocrItems';

describe('French voice list preparation', () => {
  it.each([
    ['deux oranges, puis du lait, puis trois yaourts', '2 x Orange\nLait\n3 x Yaourt'],
    ['Deux oranges, du lait et trois yaourts.', '2 x Orange\nLait\n3 x Yaourt'],
    ['du pain puis de la farine puis de l’eau', 'Pain\nFarine\nEau'],
    ['Duracell puis Desperados', 'Duracell\nDesperados'],
    ['deux kilos de pommes puis 1,5 litre de lait', 'Deux kilos de pommes\n1,5 litre de lait'],
    ['pommes de terre puis sel et poivre puis fruits et légumes', 'Pomme de terre\nSel et poivre\nFruit et légumes'],
    ['2 x lait\nSanex', '2 x Lait\nSanex'],
    ['vingt et un œufs puis quatre-vingt-dix pommes', '21 x Œuf\n90 x Pomme'],
    ['deux cents grammes de farine', 'Deux cents grammes de farine'],
    ['', ''],
  ])('prepares %s without dropping brands or measurements', (source, expected) => {
    expect(prepareVoiceItems(source)).toBe(expected);
  });
  it('feeds the existing validator, singularization and quantity limits', () => {
    expect(parseOcrItems(prepareVoiceItems('deux oranges puis du lait'))).toEqual([
      { name: 'Orange', quantity: 2 }, { name: 'Lait', quantity: 1 },
    ]);
    expect(() => parseOcrItems(prepareVoiceItems('1000 pommes'))).toThrow('999');
    expect(() => parseOcrItems(prepareVoiceItems('zéro pommes'))).toThrow('999');
    expect(() => parseOcrItems(prepareVoiceItems(Array(51).fill('lait').join(' puis ')))).toThrow('50');
  });
});
