import { getDatabase } from '@/db/client';

const keyFor = (listId: string) => `member-aliases:${listId}`;
export function getMemberAliases(listId: string): Record<string, string> {
  const row = getDatabase().getFirstSync<{ value: string }>('SELECT value FROM app_metadata WHERE key = ?', keyFor(listId));
  if (!row) return {};
  const value: unknown = JSON.parse(row.value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Noms locaux illisibles.');
  return Object.fromEntries(Object.entries(value).filter(([, name]) => typeof name === 'string' && [...name].length <= 80));
}
/** Private labels only: never sent to the server, never exported as member identities. */
export function saveMemberAlias(listId: string, memberId: string, name: string): Record<string, string> {
  const cleaned = name.trim().replace(/\s+/gu, ' ');
  if ([...cleaned].length > 80) throw new Error('Le nom doit contenir au maximum 80 caractères.');
  const aliases = getMemberAliases(listId);
  if (cleaned) Object.defineProperty(aliases, memberId, { value: cleaned, configurable: true, enumerable: true, writable: true });
  else delete aliases[memberId];
  getDatabase().runSync('INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    keyFor(listId), JSON.stringify(aliases));
  return aliases;
}
