import { expect, it } from 'vitest';
import { MAX_BACKUP_BYTES, parseBackup, serializeBackup, validateBackup } from './listBackup';
const example = () => ({
  format: 'smartshopping-lists', version: 1, backupId: 'a'.repeat(32), createdAt: '2026-10-03T12:00:00.000Z',
  lists: [{ name: 'Courses', categoryOrder: ['boissons'], items: [{ name: '  PAIN ', quantity: 2, checked: true }] }],
});
it('round-trips content and normalizes names', () => {
  const backup = validateBackup(example());
  expect(parseBackup(serializeBackup(backup))).toEqual(backup);
  expect(backup.lists[0].items[0].name).toBe('Pain');
});
it('rejects invalid JSON, unknown versions and unexpected credentials', () => {
  expect(() => parseBackup('{')).toThrow(/valide/);
  expect(() => validateBackup({ ...example(), version: 2 })).toThrow(/version/);
  expect(() => validateBackup({ ...example(), deviceSecret: 'private' })).toThrow();
});
it.each([0, -1, 1000, 1.5, '2'])('rejects invalid quantity %s', (quantity) => {
  const backup = example();
  (backup.lists[0].items[0] as { quantity: unknown }).quantity = quantity;
  expect(() => validateBackup(backup)).toThrow();
});
it('rejects oversized files and oversized UTF-8 names', () => {
  expect(() => parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toThrow(/4 Mo/);
  const backup = example();
  backup.lists[0].items[0].name = 'é'.repeat(101);
  expect(() => validateBackup(backup)).toThrow();
});

it('uses the same Unicode list-name limit as synchronization', () => {
  const backup = example();
  backup.lists[0].name = '🛒'.repeat(200);
  expect(parseBackup(serializeBackup(validateBackup(backup))).lists[0].name).toBe(backup.lists[0].name);
  backup.lists[0].name += 'a';
  expect(() => validateBackup(backup)).toThrow();
});
