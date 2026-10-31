import { afterEach, expect, it, vi } from 'vitest';
const platform = vi.hoisted(() => ({ OS: 'android' }));
vi.mock('react-native', () => ({ Platform: platform }));
import SQLiteKeyValueStorage from 'expo-sqlite/kv-store';
import { LocalKeyValueStorage } from './localKeyValueStorage';

afterEach(() => { platform.OS = 'android'; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['android', 'ios'] as const)('keeps existing SQLite keys on %s even when the runtime exposes localStorage', (os) => {
  platform.OS = os;
  const browser = { getItem: vi.fn(() => 'wrong-identity'), setItem: vi.fn(), removeItem: vi.fn(), key: vi.fn(), length: 0 };
  vi.stubGlobal('localStorage', browser);
  SQLiteKeyValueStorage.setItemSync('migration-fixture', 'original-identity');
  expect(LocalKeyValueStorage.getString('migration-fixture')).toBe('original-identity');
  expect(LocalKeyValueStorage.getAllKeys()).toContain('migration-fixture');
  LocalKeyValueStorage.setString('migration-fixture', 'updated');
  expect(SQLiteKeyValueStorage.getItemSync('migration-fixture')).toBe('updated');
  LocalKeyValueStorage.delete('migration-fixture');
  expect(LocalKeyValueStorage.getString('migration-fixture')).toBeNull();
  expect(browser.getItem).not.toHaveBeenCalled();
  expect(browser.setItem).not.toHaveBeenCalled();
  expect(browser.removeItem).not.toHaveBeenCalled();
});

it('keeps browser storage on the web', () => {
  platform.OS = 'web';
  const browser = { getItem: vi.fn(() => 'web-value'), setItem: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal('localStorage', browser);
  expect(LocalKeyValueStorage.getString('web-key')).toBe('web-value');
  LocalKeyValueStorage.setString('web-key', 'next');
  LocalKeyValueStorage.delete('web-key');
  expect(browser.setItem).toHaveBeenCalledWith('web-key', 'next');
  expect(browser.removeItem).toHaveBeenCalledWith('web-key');
});
