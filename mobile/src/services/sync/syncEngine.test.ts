import { beforeEach, expect, it, vi } from 'vitest';
import { SyncEngine, splitSyncBatches, SYNC_BATCH_BYTES } from './syncEngine';
import { syncList, toSyncItemPayload } from '@/services/api/backend';
import type { ShoppingItem } from '@/types';
vi.mock('@/services/api/backend', () => ({
  getProduct: vi.fn(), syncList: vi.fn(),
  toSyncItemPayload: (item: ShoppingItem) => ({ id: item.id, list_id: item.listId, name: item.name, quantity: item.quantity, checked: item.checked, updated_at: item.updatedAt }),
  fromSyncItemPayload: (item: unknown) => item,
}));
const items: ShoppingItem[] = Array.from({ length: 600 }, (_, index) => ({ id: `item-${index}`, listId: 'home', name: 'é"\\'.repeat(40), quantity: 1, checked: false, updatedAt: 10 }));
const engine = () => new SyncEngine(async () => true, { getDeviceId: async () => 'device' });
beforeEach(() => { vi.resetAllMocks(); });
it('batches escaped Unicode JSON below the body limit without losing items', () => {
  const payloads = items.map(toSyncItemPayload);
  const batches = splitSyncBatches('home', payloads, 10);
  expect(batches.length).toBeGreaterThan(1);
  expect(batches.flat()).toEqual(payloads);
  for (const batch of batches) {
    expect(Buffer.byteLength(JSON.stringify({ list_id: 'home', items: batch, last_sync: 10 }))).toBeLessThanOrEqual(SYNC_BATCH_BYTES);
  }
  expect(splitSyncBatches('home', [], 0)).toEqual([[]]);
});
it('sends batches sequentially and returns the final committed snapshot', async () => {
  let calls = 0;
  let active = false;
  vi.mocked(syncList).mockImplementation(async () => {
    expect(active).toBe(false); active = true;
    await Promise.resolve(); active = false;
    calls += 1;
    return { list_id: 'home', device_id: 'device', server_time: calls, updated_items: [], conflicts: [] };
  });
  const result = await engine().syncListIfOnline('home', items, 10);
  expect(calls).toBeGreaterThan(1);
  expect(result.synced && result.response.server_time).toBe(calls);
});
it('does not report success when a later batch fails', async () => {
  vi.mocked(syncList).mockResolvedValueOnce({ list_id: 'home', device_id: 'device', server_time: 1, updated_items: [], conflicts: [] }).mockRejectedValueOnce(new Error('offline'));
  await expect(engine().syncListIfOnline('home', items, 0)).rejects.toThrow('offline');
});
it('rejects a response belonging to another list before acknowledgment', async () => {
  vi.mocked(syncList).mockResolvedValue({ list_id: 'other', device_id: 'device', server_time: 1, updated_items: [], conflicts: [] });
  await expect(engine().syncListIfOnline('home', [], 0)).rejects.toThrow('identity mismatch');
});
it('transmits names for empty lists and every retry-safe batch within the size bound', async () => {
  const list_name = { name: 'é"\\'.repeat(60), updated_at: 15 };
  vi.mocked(syncList).mockImplementation(async (_device, payload) => {
    expect(payload.list_name).toEqual(list_name);
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThanOrEqual(SYNC_BATCH_BYTES);
    return { list_id: 'home', device_id: 'device', server_time: 16, updated_items: [], conflicts: [], list_name };
  });
  const result = await engine().syncListIfOnline('home', [], 10, list_name);
  expect(result.synced && result.response.list_name).toEqual(list_name);
  await engine().syncListIfOnline('home', items, 10, list_name);
  expect(vi.mocked(syncList).mock.calls.length).toBeGreaterThan(2);
});
