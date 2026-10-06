import { describe, expect, it } from 'vitest';
import { decrementGroup, getEquivalentItems, groupEquivalentItems, incrementGroup } from './itemGroups';
import { mergeShoppingItems } from './sync/mergeItems';
import type { ShoppingItem } from '@/types';
const item = (id: string, changes: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id, listId: 'home', name: 'Pain', quantity: 1, checked: false, updatedAt: 1, ...changes,
});

describe('independent additions of the same article', () => {
  it('converges to one row, sums once and never writes the derived quantity into source records', () => {
    const a = item('a', { name: ' pain  ', quantity: 2, checked: true });
    const b = item('b', { name: 'PAIN', quantity: 3, barcode: '12345678' });
    const fromA = mergeShoppingItems([a], [b]);
    const fromB = mergeShoppingItems([b], [a]);
    expect(groupEquivalentItems(fromA)).toEqual(groupEquivalentItems(fromB));
    expect(groupEquivalentItems(fromA)).toEqual([expect.objectContaining({ id: 'a', name: 'Pain', quantity: 5, checked: false, barcode: '12345678' })]);
    const again = mergeShoppingItems(fromA, fromB);
    expect(groupEquivalentItems(again)[0].quantity).toBe(5);
    const c = item('c');
    const overlap = mergeShoppingItems(mergeShoppingItems(fromA, [c]), mergeShoppingItems(fromB, [c]));
    expect(groupEquivalentItems(overlap)[0].quantity).toBe(6);
    expect(a.quantity).toBe(2);
    expect(b.quantity).toBe(3);
  });
  it('isolates lists and excludes tombstones', () => {
    const rows = [item('a'), item('b', { listId: 'other' }), item('c', { deletedAt: 2 })];
    expect(groupEquivalentItems(rows)).toHaveLength(2);
    expect(getEquivalentItems(rows, 'a').map((entry) => entry.id)).toEqual(['a']);
    expect(getEquivalentItems(rows, 'c')).toEqual([]);
  });
  it('adds one quantity only and reopens the entire group for a fresh addition', () => {
    const rows = [item('b', { checked: true }), item('a', { checked: true })];
    const increased = incrementGroup(rows, 'b', 2, true);
    expect(groupEquivalentItems(increased)[0]).toMatchObject({ quantity: 4, checked: false });
    expect(increased.every((entry) => !entry.checked && entry.updatedAt > 1)).toBe(true);
    expect(rows.every((entry) => entry.quantity === 1 && entry.checked)).toBe(true);
  });
  it('decrements the combined quantity and persists a tombstone when consuming a source', () => {
    const rows = [item('b'), item('a')];
    const reduced = decrementGroup(rows, 'a');
    expect(groupEquivalentItems(reduced)[0]).toMatchObject({ id: 'a', quantity: 1 });
    expect(reduced.find((entry) => entry.id === 'b')?.deletedAt).toBeGreaterThan(1);
    expect(groupEquivalentItems(mergeShoppingItems(rows, reduced))[0].quantity).toBe(1);
    expect(decrementGroup(reduced, 'a')).toBe(reduced);
    expect(groupEquivalentItems(decrementGroup([item('a', { quantity: 3 }), item('b')], 'b'))[0].quantity).toBe(3);
  });
  it('enforces the aggregate input limit without discarding concurrent additions above it', () => {
    const rows = [item('a', { quantity: 998 }), item('b')];
    expect(incrementGroup(rows, 'a')).toBe(rows);
    const overflow = [item('a', { quantity: 999 }), item('b', { quantity: 2 })];
    expect(groupEquivalentItems(overflow)[0].quantity).toBe(1001);
    expect(groupEquivalentItems(decrementGroup(overflow, 'a'))[0].quantity).toBe(1000);
  });
});
