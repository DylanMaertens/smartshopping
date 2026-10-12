import { normalizeItemName } from './itemValidation';

const numbers: Record<string, number> = { zéro: 0, zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4,
  cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16 };
Object.assign(numbers, { 'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19, vingt: 20, trente: 30, quarante: 40,
  cinquante: 50, soixante: 60, 'quatre-vingts': 80 });
for (const [tens, base] of [['vingt', 20], ['trente', 30], ['quarante', 40], ['cinquante', 50], ['soixante', 60]] as const) {
  for (const [unit, value] of Object.entries(numbers).filter(([, value]) => value >= 1 && value <= (base === 60 ? 19 : 9))) {
    numbers[`${tens}${value === 1 || value === 11 ? '-et-' : '-'}${unit}`] = base + value;
  }
}
for (const [unit, value] of Object.entries(numbers).filter(([, value]) => value >= 1 && value <= 19)) numbers[`quatre-vingt-${unit}`] = 80 + value;
const numberPattern = Object.keys(numbers).sort((a, b) => b.length - a.length).map((word) => word.replace(/-/g, '[ -]')).join('|');
const quantityPrefix = new RegExp(`^(\\d+|${numberPattern})\\s+(?:(?:fois|x|×)\\s+)?(.+)$`, 'iu');
const measured = /^(?:[.,]\d|kg\b|g\b|mg\b|ml\b|cl\b|dl\b|l\b|kilos?\b|kilogrammes?\b|grammes?\b|litres?\b|millilitres?\b|centilitres?\b|et\b|cents?\b|mille\b|demi\b)/iu;

/** Conservative French dictation preparation. Always reviewed before parsing/import.
 * "puis" is the explicit separator; compound names and weights stay editable. */
export function prepareVoiceItems(transcript: string): string {
  return transcript.trim()
    .replace(/\b(?:vingt|trente|quarante|cinquante|soixante) et (?:un|une|onze)\b/giu, (phrase) => phrase.replace(/ et /i, ' & '))
    .replace(/\b(sel et poivre|fruits et légumes)\b/giu, (phrase) => phrase.replace(/ et /i, ' & '))
    .split(/\s*\n\s*|\s*;\s*|(?<!\d),\s*|,\s*(?!\d)|\s+(?:et puis|puis|ensuite|et)\s+/iu)
    .map((part) => {
      let name = part.replace(/ & /g, ' et ').replace(/[.!?]+$/u, '').trim().replace(/^(?:et puis|puis|ensuite|et)\s+/iu, '');
      if (!name) return '';
      const quantity = name.match(quantityPrefix);
      if (quantity) {
        const amount = numbers[quantity[1].toLocaleLowerCase('fr').replace(/ /g, '-')] ?? Number(quantity[1]);
        if (measured.test(quantity[2])) return normalizeItemName(name);
        return `${amount} x ${normalizeItemName(quantity[2].replace(/^d[’']|^de\s+/iu, ''))}`;
      }
      name = name.replace(/^(?:(?:du|des|de la)\s+|de l[’']\s*)/iu, '');
      return normalizeItemName(name);
    }).filter(Boolean).join('\n');
}
