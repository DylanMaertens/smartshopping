import { expect, it } from 'vitest';
import { suggestVoiceCorrections } from './voiceSpelling';
import { applyOcrCorrection } from './ocrSpelling';
import { prepareVoiceItems } from './voiceItems';
import { parseOcrItems } from './ocrItems';

it('does not guess a product from an isolated digit or change real quantities', () => {
  const text = '1\n1 x Lait\n21\n1 litre de lait\nN° 1\n1,5 kg de farine\n7up\nPain';
  expect(suggestVoiceCorrections(text).filter(({ original }) => /\d/.test(original))).toEqual([]);
  expect(suggestVoiceCorrections('1\nPain')).toEqual([]);
});
it('offers the correction after voice preparation, importing only when explicitly accepted', () => {
  const text = prepareVoiceItems('wwhisky puis deux oranges');
  expect(text).toBe('Wwhisky\n2 x Orange');
  const suggestion = suggestVoiceCorrections(text)[0];
  expect(parseOcrItems(applyOcrCorrection(text, suggestion))).toEqual([
    { name: 'Whisky', quantity: 1 }, { name: 'Orange', quantity: 2 },
  ]);
});
it('keeps offsets exact with whitespace, CRLF and repeated words', () => {
  const text = 'Lait\r\n  wwhisky  \r\nwwhisky\n';
  const suggestions = suggestVoiceCorrections(text);
  expect(suggestions.map(({ start }) => start)).toEqual([8, 19]);
  expect(applyOcrCorrection(text, suggestions[1])).toBe('Lait\r\n  wwhisky  \r\nwhisky\n');
});
it('preserves correctly recognized words and known product names', () => {
  expect(suggestVoiceCorrections('Pain\nLait\nOrange\nSanex\nLumix\n1', ['Lumix', '1'])).toEqual([]);
});
it('offers spelling alternatives but never claims OCR scores measure speech certainty', () => {
  const suggestions = suggestVoiceCorrections('Tomtaes\nwwhisky');
  expect(suggestions.find(({ original }) => original === 'Tomtaes')?.alternatives).toContain('Tomates');
  expect(suggestions.every(({ confidence }) => confidence === 'uncertain')).toBe(true);
});
it('bounds suggestions on very long input', () => {
  expect(suggestVoiceCorrections('wwhisky\n'.repeat(20000))).toHaveLength(50);
});
