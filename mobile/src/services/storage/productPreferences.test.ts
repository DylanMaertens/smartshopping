import { expect, it, vi } from 'vitest';
import { LocalKeyValueStorage } from './localKeyValueStorage';
import { getProductPreference, getRememberedCategory, rememberProductCategory, saveProductPreference } from './productPreferences';

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

it('remembers name-based aisles across plurals and restarts, and allows a new choice or reset', async () => {
  const disk = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => disk.get(key) ?? null,
    setItem: (key: string, value: string) => disk.set(key, value), removeItem: (key: string) => disk.delete(key) });
  try {
    rememberProductCategory('  ORANGES ', 'Épicerie salée');
    vi.resetModules();
    const restarted = await import('./productPreferences');
    expect(restarted.getRememberedCategory('Orange')).toBe('Épicerie salée');
    restarted.rememberProductCategory('Orange', 'Fruits & légumes');
    expect(restarted.getRememberedCategory('oranges')).toBe('Fruits & légumes');
    restarted.rememberProductCategory('Orange', 'À classer');
    expect(restarted.getRememberedCategory('Orange')).toBeNull();
    rememberProductCategory('Croquettes', 'Alimentation animale');
    expect(getRememberedCategory('Croquette')).toBe('Animaux');
  } finally { vi.unstubAllGlobals(); }
});

it('discards unknown cached aisles and tolerates unavailable storage without blocking an addition', () => {
  vi.stubGlobal('localStorage', { getItem: () => 'Rayon supprimé', setItem: () => {} });
  try { expect(getRememberedCategory('Quinoa')).toBeNull(); } finally { vi.unstubAllGlobals(); }
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('disk'); } });
  try { expect(getRememberedCategory('Quinoa')).toBeNull(); } finally { vi.unstubAllGlobals(); }
});
it('ignores corrupted or invalid personal names', () => {
  LocalKeyValueStorage.setString('product-preference:v1:4061458194792', '{invalid');
  expect(getProductPreference('4061458194792')).toBeNull();
  saveProductPreference('invalid', { name: 'Pain' });
  expect(getProductPreference('invalid')).toBeNull();
  saveProductPreference('5410306883828', { name: ' ' });
  expect(getProductPreference('5410306883828')).toBeNull();
});
