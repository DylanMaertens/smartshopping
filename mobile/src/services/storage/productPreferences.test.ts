import { expect, it, vi } from 'vitest';
import { LocalKeyValueStorage } from './localKeyValueStorage';
import { getProductPreference, saveProductPreference } from './productPreferences';

it('persists personal names independently of list deletion, cache TTL and module restart', async () => {
  const disk = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => disk.get(key) ?? null,
    setItem: (key: string, value: string) => disk.set(key, value) });
  try {
  saveProductPreference('3254569920478', { name: '  MON produit ', category: 'Entretien maison' });
  vi.resetModules();
  const restarted = await import('./productPreferences');
  expect(restarted.getProductPreference('3254569920478')).toEqual({ name: 'Mon produit', category: 'Entretien maison' });
  restarted.saveProductPreference('3254569920478', { name: 'Nouveau nom' });
  expect(restarted.getProductPreference('3254569920478')?.name).toBe('Nouveau nom');
  } finally { vi.unstubAllGlobals(); }
});
it('ignores corrupted or invalid personal names', () => {
  LocalKeyValueStorage.setString('product-preference:v1:4061458194792', '{invalid');
  expect(getProductPreference('4061458194792')).toBeNull();
  saveProductPreference('invalid', { name: 'Pain' });
  expect(getProductPreference('invalid')).toBeNull();
  saveProductPreference('5410306883828', { name: ' ' });
  expect(getProductPreference('5410306883828')).toBeNull();
});
