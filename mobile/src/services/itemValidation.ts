/** Use sentence case and keep useful word separators for every item entry path. */
export function normalizeItemName(value: string): string {
  const cleaned = value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
  return cleaned.replace(/^./u, (first) => first.toUpperCase()).normalize('NFC');
}

export function itemNameKey(value: string): string {
  return normalizeItemName(value).toLowerCase();
}

// The API limits UTF-8 bytes, rather than JavaScript UTF-16 code units.
export function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = '';
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > maxBytes) break;
    result += character;
  }
  return result;
}
