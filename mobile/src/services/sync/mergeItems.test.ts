import { describe, expect, it } from 'vitest';
import { mergeShoppingItems } from './mergeItems';
import type { ShoppingItem } from '@/types';

const item = (id: string, name: string, updatedAt: number): ShoppingItem => ({
  id,
  listId: 'list-1',
  name,
  quantity: 1,
  checked: false,
  updatedAt,
});

describe('mergeShoppingItems', () => {
  it('applique Last-Write-Wins sans perdre les items uniquement locaux ou distants', () => {
    const merged = mergeShoppingItems(
      [item('shared', 'local récent', 20), item('local', 'local', 10)],
      [item('shared', 'remote ancien', 15), item('remote', 'remote', 12)],
    );

    expect(merged).toHaveLength(3);
    expect(merged.find((entry) => entry.id === 'shared')?.name).toBe('local récent');
    expect(merged.map((entry) => entry.id)).toEqual(expect.arrayContaining(['local', 'remote']));
  });

  it('conserve les tombstones distants plus récents', () => {
    const tombstone = { ...item('shared', 'supprimé', 30), deletedAt: 30 };
    const merged = mergeShoppingItems([item('shared', 'présent', 20)], [tombstone]);
    expect(merged[0].deletedAt).toBe(30);
  });
});
